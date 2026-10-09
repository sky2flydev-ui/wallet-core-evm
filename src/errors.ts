export class WalletError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'WalletError';
  }
}
export class InvalidMnemonicError extends WalletError {
  constructor() {
    super('Invalid BIP-39 mnemonic', 'INVALID_MNEMONIC');
  }
}
export class InvalidPasswordError extends WalletError {
  constructor() {
    super('Password must be at least 12 characters', 'INVALID_PASSWORD');
  }
}
export class VaultDecryptionError extends WalletError {
  constructor() {
    super('Unable to decrypt vault: wrong password or corrupted data', 'VAULT_DECRYPTION_FAILED');
  }
}
export class InvalidVaultError extends WalletError {
  constructor() {
    super('Invalid vault format', 'INVALID_VAULT');
  }
}
