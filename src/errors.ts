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
export class RpcUnavailableError extends WalletError {
  constructor(message: string) {
    super(message, 'RPC_UNAVAILABLE');
  }
}
export class Eip1559UnavailableError extends WalletError {
  constructor() {
    super(
      'RPC latest block has no EIP-1559 base fee; use a legacy transaction mode or an EIP-1559 network',
      'EIP1559_UNAVAILABLE',
    );
  }
}
