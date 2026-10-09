# @wallet-core/evm

Production-oriented **non-custodial EVM wallet core**. The package never sends a seed phrase or private key to an RPC, Moralis, or any third-party service: keys are derived and transactions are signed locally.

## Included in v0.1

- BIP-39 24-word mnemonic generation and validation.
- BIP-44 Ethereum derivation (`m/44'/60'/0'/0/index`).
- AES-256-GCM encrypted vault with scrypt KDF.
- Local account derivation and viem-compatible signing accounts.
- Minimal JSON-RPC transport for chain ID, balance, nonce, and raw transaction broadcast.
- Moralis token-balance adapter with injected API key and fetcher.
- Network registry and EIP-1559 native-transfer preparation with chain-ID guard, fee preview, nonce, gas estimate, and local signing. No broadcast occurs during preparation or signing.
- ERC-20 `transfer` and `approve` calldata builders with address/amount validation, `eth_call` simulation before gas estimation, and token-aware previews.
- ERC-721 and ERC-1155 safe transfer/approval builders with simulation and NFT-aware previews.
- EIP-712 typed-data signing with domain chain-ID enforcement.
- Atomic encrypted vault file storage with directory mode `0700`, file mode `0600`, temporary-file write, and rename. The file never contains the mnemonic in plaintext.
- Strict TypeScript, no placeholder implementations, deterministic tests planned for the next increment.

## Security boundary

This is a wallet **core**, not a hosted wallet or custody backend. `EncryptedFileVaultStore` protects the vault at rest, but the application must still protect the password, process memory, backups, and host account. The application embedding it is responsible for secure password entry, vault storage permissions, device compromise protection, backups, phishing-resistant transaction review, chain allowlists, and dependency auditing. Never commit vaults, mnemonics, API keys, or private keys.

## Quick start

```ts
import { createNewVault, EvmWallet } from '@wallet-core/evm';

const { vault, mnemonic } = createNewVault(process.env.WALLET_PASSWORD!);
// Show mnemonic exactly once in a secure backup flow; do not log it.
const wallet = EvmWallet.fromVault(vault, process.env.WALLET_PASSWORD!);
const first = wallet.derive(0);
const signer = wallet.account(0);
const signature = await signer.signMessage({ message: 'hello' });
```

## Transaction safety

Use `TransactionBuilder.prepareNativeTransfer()` to obtain a complete preview before signing. The builder verifies the RPC chain ID, validates addresses, computes nonce and fees, and returns the exact estimated debit. Call `EvmRpc.sendRawTransaction()` separately only after the application has displayed and approved that preview.

## Roadmap

Hardware-wallet interface, EIP-1559 transaction builder with human-readable simulation, EIP-4337 account abstraction, multi-chain registry, secure storage interfaces, and property/fuzz tests are intentionally separate increments—not hidden mocks.
