import { describe, it, expect } from 'vitest';
import { encrypt, decrypt } from './crypto.js';

describe('crypto', () => {
  it('encrypts and decrypts a string', () => {
    const plaintext = 'my-secret-token-12345';
    const encrypted = encrypt(plaintext);
    expect(encrypted).not.toBe(plaintext);
    expect(encrypted).toContain(':');
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it('returns empty string for empty input', () => {
    expect(encrypt('')).toBe('');
    expect(decrypt('')).toBe('');
  });

  it('produces different ciphertext for same input (random IV)', () => {
    const a = encrypt('same-value');
    const b = encrypt('same-value');
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe('same-value');
    expect(decrypt(b)).toBe('same-value');
  });
});
