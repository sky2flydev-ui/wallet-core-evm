import { HDKey } from '@scure/bip32';
import { mnemonicToSeedSync, validateMnemonic } from '@scure/bip39';
import { privateKeyToAccount, type LocalAccount } from 'viem/accounts';
import { mainnet } from 'viem/chains';
import { createWalletClient, http, type Hex, type Chain, type WalletClient } from 'viem';
import { wordlist } from '@scure/bip39/wordlists/english';
import { InvalidMnemonicError } from './errors.js';
import { unlockVault, type Vault, type VaultData } from './vault.js';

export interface DerivedAccount {
  index: number;
  address: `0x${string}`;
  path: string;
}
export const DEFAULT_PATH = "m/44'/60'/0'/0";
export class EvmWallet {
  private readonly data: VaultData;
  private constructor(data: VaultData) {
    this.data = data;
  }
  static fromVault(vault: Vault, password: string): EvmWallet {
    return new EvmWallet(unlockVault(vault, password));
  }
  static fromMnemonic(mnemonic: string): EvmWallet {
    const normalized = mnemonic.trim().replace(/\s+/g, ' ');
    if (!validateMnemonic(normalized, wordlist)) throw new InvalidMnemonicError();
    return new EvmWallet({ mnemonic: normalized, createdAt: new Date().toISOString() });
  }
  derive(index = 0): DerivedAccount {
    const { privateKey, path } = this.deriveKey(index);
    const account = privateKeyToAccount(`0x${Buffer.from(privateKey).toString('hex')}` as Hex);
    return { index, address: account.address, path };
  }
  deriveMany(count: number, start = 0): DerivedAccount[] {
    if (!Number.isSafeInteger(count) || count < 0 || count > 1000)
      throw new RangeError('count must be between 0 and 1000');
    return Array.from({ length: count }, (_, i) => this.derive(start + i));
  }
  account(index = 0): LocalAccount {
    const { privateKey } = this.deriveKey(index);
    return privateKeyToAccount(`0x${Buffer.from(privateKey).toString('hex')}` as Hex);
  }
  client(index = 0, chain: Chain = mainnet): WalletClient {
    return createWalletClient({ account: this.account(index), chain, transport: http() });
  }
  private deriveKey(index: number): { privateKey: Uint8Array; path: string } {
    if (!Number.isSafeInteger(index) || index < 0)
      throw new RangeError('index must be a non-negative safe integer');
    const path = `${DEFAULT_PATH}/${index}`;
    const seed = mnemonicToSeedSync(this.data.mnemonic);
    const node = HDKey.fromMasterSeed(seed).derive(path);
    if (!node.privateKey) throw new Error('Unable to derive private key');
    seed.fill(0);
    return { privateKey: node.privateKey, path };
  }
}
