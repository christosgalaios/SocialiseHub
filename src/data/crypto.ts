import { createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync } from 'node:crypto';
import { hostname, userInfo } from 'node:os';

const ALGORITHM = 'aes-256-gcm';
const SALT = 'socialisehub-credential-salt-v1';
const IV_LENGTH = 16;

let cachedKey: Buffer | null = null;

function deriveKey(): Buffer {
  if (cachedKey) return cachedKey;
  const machine = `${hostname()}:${userInfo().username}`;
  cachedKey = pbkdf2Sync(machine, SALT, 100_000, 32, 'sha256');
  return cachedKey;
}

export function encrypt(plaintext: string): string {
  if (!plaintext) return '';
  const key = deriveKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decrypt(ciphertext: string): string {
  if (!ciphertext) return '';
  const key = deriveKey();
  const [ivHex, authTagHex, encHex] = ciphertext.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const encrypted = Buffer.from(encHex, 'hex');
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}
