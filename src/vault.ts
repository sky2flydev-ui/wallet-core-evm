import { generateMnemonic, mnemonicToEntropy, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { decrypt, encrypt, type EncryptedVault } from './crypto.js';
import { InvalidMnemonicError, InvalidVaultError, VaultDecryptionError } from './errors.js';

export interface VaultData {
  mnemonic: string;
  createdAt: string;
}
export type Vault = EncryptedVault;
export const generateMnemonicPhrase = (): string => generateMnemonic(wordlist, 256);
export function createVault(mnemonic: string, password: string): Vault {
  const normalized = mnemonic.trim().replace(/\s+/g, ' ');
  if (!validateMnemonic(normalized, wordlist)) throw new InvalidMnemonicError();
  mnemonicToEntropy(normalized, wordlist);
  return encrypt(
    JSON.stringify({
      mnemonic: normalized,
      createdAt: new Date().toISOString(),
    } satisfies VaultData),
    password,
  );
}
export function createNewVault(password: string): { vault: Vault; mnemonic: string } {
  const mnemonic = generateMnemonicPhrase();
  return { vault: createVault(mnemonic, password), mnemonic };
}
export function unlockVault(vault: Vault, password: string): VaultData {
  try {
    const parsed: unknown = JSON.parse(decrypt(vault, password));
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof (parsed as VaultData).mnemonic !== 'string' ||
      !validateMnemonic((parsed as VaultData).mnemonic, wordlist)
    )
      throw new Error();
    return parsed as VaultData;
  } catch (error) {
    if (error instanceof InvalidVaultError) throw error;
    throw error;
  }
}
export function parseVault(input: string): Vault {
  try {
    const parsed: unknown = JSON.parse(input);
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      (parsed as Vault).version !== 1 ||
      (parsed as Vault).kdf !== 'scrypt'
    )
      throw new Error();
    return parsed as Vault;
  } catch {
    throw new InvalidVaultError();
  }
}
export const serializeVault = (vault: Vault): string => JSON.stringify(vault);
