# Changelog

Все заметные изменения проекта документируются здесь.

## [Unreleased]

- Подготовка публичного GitHub-релиза и npm publishing workflow.
- Исправлен расчёт EIP-1559 `maxFeePerGas`: используется latest `baseFeePerGas` с явным safety envelope и priority fee.
- Добавлены типизированные ошибки недоступного RPC и сетей без EIP-1559 base fee.

## [0.1.0] - 2026-10-09

### Added

- BIP-39 generation/validation и BIP-44 EVM derivation.
- AES-256-GCM vault с scrypt KDF.
- Atomic encrypted file vault storage (`0700` directory / `0600` file).
- EIP-1559 native transaction builder с chain-ID guard и preview.
- ERC-20 transfer/approve с simulation.
- ERC-721 transfer/approve/operator approvals с simulation.
- ERC-1155 transfer/operator approvals с simulation.
- EIP-712 typed-data signing с domain chain-ID guard.
- Minimal JSON-RPC transport and Moralis token-balance adapter.
- Strict TypeScript, tests, CI, security policy and MIT license.

[Unreleased]: https://github.com/OWNER/REPOSITORY/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/OWNER/REPOSITORY/releases/tag/v0.1.0
