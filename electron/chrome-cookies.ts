/**
 * Import cookies from Chrome into Electron's automation session.
 *
 * How it works:
 * 1. Copy Chrome's Cookies SQLite DB to a temp file (avoids lock while Chrome is running)
 * 2. Read the AES master key from Chrome's "Local State" JSON
 * 3. Decrypt the master key using Windows DPAPI (via PowerShell)
 * 4. For each cookie row, decrypt the value using AES-256-GCM (Node.js crypto)
 * 5. Inject into Electron's session via session.cookies.set()
 *
 * No additional npm packages required — uses better-sqlite3 (already installed),
 * Node.js crypto, and PowerShell for DPAPI.
 */

import { join } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { copyFileSync, readFileSync, existsSync, unlinkSync } from 'node:fs';
import { createDecipheriv } from 'node:crypto';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import type { Session } from 'electron';

const require = createRequire(import.meta.url);

// Domains we want cookies for
const TARGET_DOMAINS = [
  'meetup.com',
  'eventbrite.com',
  'eventbrite.co.uk',
  'headfirstbristol.co.uk',
];

interface ChromeCookieRow {
  host_key: string;
  name: string;
  path: string;
  encrypted_value: Buffer;
  expires_utc: number;
  is_secure: number;
  is_httponly: number;
  samesite: number;
}

/**
 * Find Chrome's user data directory.
 */
function findChromeUserDataDir(): string | null {
  const paths = [
    join(homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'User Data'),
  ];
  for (const p of paths) {
    if (existsSync(p)) return p;
  }
  return null;
}

/**
 * Read and decrypt Chrome's master encryption key using DPAPI via PowerShell.
 */
function decryptMasterKey(userDataDir: string): Buffer | null {
  const localStatePath = join(userDataDir, 'Local State');
  if (!existsSync(localStatePath)) return null;

  try {
    const localState = JSON.parse(readFileSync(localStatePath, 'utf-8'));
    const encryptedKeyB64: string = localState?.os_crypt?.encrypted_key;
    if (!encryptedKeyB64) return null;

    const encryptedKey = Buffer.from(encryptedKeyB64, 'base64');

    // Strip the "DPAPI" prefix (5 bytes)
    if (encryptedKey.toString('utf-8', 0, 5) !== 'DPAPI') return null;
    const keyData = encryptedKey.subarray(5);

    // Use PowerShell to DPAPI-decrypt the key
    const b64Input = keyData.toString('base64');
    const psScript = `
      Add-Type -AssemblyName System.Security
      $encrypted = [Convert]::FromBase64String('${b64Input}')
      $decrypted = [System.Security.Cryptography.ProtectedData]::Unprotect($encrypted, $null, 'CurrentUser')
      [Convert]::ToBase64String($decrypted)
    `.trim();

    const result = execSync(`powershell -NoProfile -Command "${psScript.replace(/"/g, '\\"')}"`, {
      encoding: 'utf-8',
      timeout: 10_000,
    }).trim();

    return Buffer.from(result, 'base64');
  } catch (err) {
    console.warn('[chrome-cookies] Failed to decrypt master key:', err);
    return null;
  }
}

/**
 * Decrypt a Chrome cookie value encrypted with AES-256-GCM.
 * Format: "v10" (3 bytes) + nonce (12 bytes) + ciphertext+tag
 */
function decryptCookieValue(encrypted: Buffer, masterKey: Buffer): string | null {
  if (encrypted.length < 3) return null;

  const prefix = encrypted.toString('utf-8', 0, 3);

  // v10/v11 = AES-256-GCM encrypted
  if (prefix === 'v10' || prefix === 'v11') {
    try {
      const nonce = encrypted.subarray(3, 3 + 12);
      const ciphertextWithTag = encrypted.subarray(3 + 12);

      // Last 16 bytes are the GCM auth tag
      const tagStart = ciphertextWithTag.length - 16;
      const ciphertext = ciphertextWithTag.subarray(0, tagStart);
      const tag = ciphertextWithTag.subarray(tagStart);

      const decipher = createDecipheriv('aes-256-gcm', masterKey, nonce);
      decipher.setAuthTag(tag);
      const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      return decrypted.toString('utf-8');
    } catch {
      return null;
    }
  }

  // Older DPAPI-only encryption (pre-Chrome 80) — not common anymore
  return null;
}

/**
 * Convert Chrome's expires_utc (microseconds since 1601-01-01) to Unix seconds.
 */
function chromeTimeToUnix(chromeTime: number): number {
  if (chromeTime === 0) return 0; // Session cookie
  // Chrome epoch is 1601-01-01, Unix epoch is 1970-01-01
  // Difference in microseconds: 11644473600000000
  const unixMicros = chromeTime - 11_644_473_600_000_000;
  return Math.floor(unixMicros / 1_000_000);
}

/**
 * Map Chrome's samesite int to Electron's string format.
 */
function sameSiteToString(val: number): 'unspecified' | 'no_restriction' | 'lax' | 'strict' {
  switch (val) {
    case -1: return 'unspecified';
    case 0: return 'no_restriction';
    case 1: return 'lax';
    case 2: return 'strict';
    default: return 'unspecified';
  }
}

/**
 * Import cookies from Chrome into an Electron session.
 * Returns the number of cookies successfully imported.
 */
export async function importChromeCookies(electronSession: Session): Promise<{ imported: number; error?: string }> {
  const userDataDir = findChromeUserDataDir();
  if (!userDataDir) {
    return { imported: 0, error: 'Chrome user data directory not found' };
  }

  // Decrypt master key
  const masterKey = decryptMasterKey(userDataDir);
  if (!masterKey) {
    return { imported: 0, error: 'Failed to decrypt Chrome master key (DPAPI)' };
  }

  // Find the Cookies DB — try Default profile first, then Profile 1
  let cookieDbPath: string | null = null;
  for (const profile of ['Default', 'Profile 1']) {
    const candidate = join(userDataDir, profile, 'Network', 'Cookies');
    if (existsSync(candidate)) {
      cookieDbPath = candidate;
      break;
    }
  }
  if (!cookieDbPath) {
    return { imported: 0, error: 'Chrome Cookies database not found' };
  }

  // Copy to temp to avoid lock conflicts with running Chrome.
  // Chrome locks the DB file, so copyFileSync fails with EBUSY.
  // PowerShell Copy-Item -Force can read through the lock.
  const tempPath = join(tmpdir(), `socialise-chrome-cookies-${Date.now()}.db`);
  try {
    try {
      copyFileSync(cookieDbPath, tempPath);
    } catch {
      // Fallback: use PowerShell to copy through Chrome's file lock
      execSync(
        `powershell -NoProfile -Command "Copy-Item -LiteralPath '${cookieDbPath.replace(/'/g, "''")}' -Destination '${tempPath.replace(/'/g, "''")}' -Force"`,
        { timeout: 10_000 },
      );
    }
  } catch (err) {
    return { imported: 0, error: `Failed to copy Cookies DB: ${err}` };
  }

  let imported = 0;
  try {
    const Database = require('better-sqlite3');
    const db = new Database(tempPath, { readonly: true });

    // Build a WHERE clause to match our target domains
    const domainClauses = TARGET_DOMAINS.map(d => `host_key LIKE '%${d}'`).join(' OR ');
    const rows: ChromeCookieRow[] = db.prepare(
      `SELECT host_key, name, path, encrypted_value, expires_utc, is_secure, is_httponly, samesite
       FROM cookies WHERE ${domainClauses}`
    ).all();

    db.close();

    for (const row of rows) {
      const value = decryptCookieValue(row.encrypted_value, masterKey);
      if (!value) continue;

      // Determine the URL scheme based on is_secure
      const scheme = row.is_secure ? 'https' : 'http';
      const domain = row.host_key.startsWith('.') ? row.host_key.slice(1) : row.host_key;
      const url = `${scheme}://${domain}${row.path}`;

      const expirationDate = chromeTimeToUnix(row.expires_utc);

      try {
        await electronSession.cookies.set({
          url,
          name: row.name,
          value,
          domain: row.host_key,
          path: row.path,
          secure: row.is_secure === 1,
          httpOnly: row.is_httponly === 1,
          sameSite: sameSiteToString(row.samesite),
          ...(expirationDate > 0 ? { expirationDate } : {}),
        });
        imported++;
      } catch {
        // Some cookies may fail (e.g. invalid domain) — skip
      }
    }
  } catch (err) {
    return { imported, error: `Failed to read Cookies DB: ${err}` };
  } finally {
    // Clean up temp file
    try { unlinkSync(tempPath); } catch { /* ignore */ }
  }

  return { imported };
}
