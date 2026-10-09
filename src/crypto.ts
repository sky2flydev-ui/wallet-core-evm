import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { InvalidPasswordError, VaultDecryptionError } from './errors.js';

const VERSION = 1;
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const SALT_LENGTH = 16;
const SCRYPT_N = 1 << 15;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

export interface EncryptedVault {
  version: 1;
  kdf: 'scrypt';
  kdfParams: { n: number; r: number; p: number; dklen: number };
  salt: string;
  iv: string;
  authTag: string;
  ciphertext: string;
}

function assertPassword(password: string): void {
  if (typeof password !== 'string' || password.length < 12) throw new InvalidPasswordError();
}
function deriveKey(password: string, salt: Buffer): Buffer {
  return scryptSync(password.normalize('NFKC'), salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 64 * 1024 * 1024,
  });
}
export function encrypt(plaintext: string, password: string): EncryptedVault {
  assertPassword(password);
  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(password, salt), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    version: VERSION,
    kdf: 'scrypt',
    kdfParams: { n: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, dklen: KEY_LENGTH },
    salt: salt.toString('base64url'),
    iv: iv.toString('base64url'),
    authTag: cipher.getAuthTag().toString('base64url'),
    ciphertext: ciphertext.toString('base64url'),
  };
}
export function decrypt(vault: EncryptedVault, password: string): string {
  assertPassword(password);
  try {
    if (vault.version !== 1 || vault.kdf !== 'scrypt') throw new Error('unsupported');
    const decipher = createDecipheriv(
      'aes-256-gcm',
      deriveKey(password, Buffer.from(vault.salt, 'base64url')),
      Buffer.from(vault.iv, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(vault.authTag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(vault.ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new VaultDecryptionError();
  }
}
