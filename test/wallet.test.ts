import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createNewVault,
  createVault,
  EvmWallet,
  parseVault,
  serializeVault,
} from '../src/index.js';
import { JsonRpcTransport, EvmRpc, MoralisEvmClient } from '../src/index.js';

const MNEMONIC = 'test test test test test test test test test test test junk';

describe('encrypted vault and HD wallet', () => {
  it('round-trips a vault and derives the BIP-44 account', () => {
    const vault = createVault(MNEMONIC, 'correct horse battery staple');
    const wallet = EvmWallet.fromVault(
      parseVault(serializeVault(vault)),
      'correct horse battery staple',
    );
    expect(wallet.derive(0)).toEqual({
      index: 0,
      address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      path: "m/44'/60'/0'/0/0",
    });
  });
  it('rejects wrong passwords and invalid mnemonics', () => {
    const { vault } = createNewVault('correct horse battery staple');
    expect(() => EvmWallet.fromVault(vault, 'wrong password')).toThrow('Unable to decrypt vault');
    expect(() => createVault('not a mnemonic', 'correct horse battery staple')).toThrow(
      'Invalid BIP-39 mnemonic',
    );
  });
  it('derives unique addresses without exposing the mnemonic in the vault', () => {
    const { vault, mnemonic } = createNewVault('correct horse battery staple');
    expect(serializeVault(vault)).not.toContain(mnemonic);
    const wallet = EvmWallet.fromVault(vault, 'correct horse battery staple');
    expect(new Set(wallet.deriveMany(3).map((a) => a.address)).size).toBe(3);
  });
});

describe('JSON-RPC boundary', () => {
  it('encodes requests and parses hex quantities', async () => {
    const calls: Array<{ method: string; params: readonly unknown[] }> = [];
    const rpc = new EvmRpc({
      request: async <T>(method: string, params: readonly unknown[] = []) => {
        calls.push({ method, params });
        return '0x2a' as T;
      },
    });
    expect(await rpc.chainId()).toBe(42n);
    expect(await rpc.balance('0x0000000000000000000000000000000000000001')).toBe(42n);
    expect(calls.map((c) => c.method)).toEqual(['eth_chainId', 'eth_getBalance']);
  });
  it('rejects non-OK HTTP responses', async () => {
    const transport = new JsonRpcTransport(
      'https://rpc.invalid',
      async () => new Response('', { status: 503 }),
    );
    await expect(transport.request('eth_chainId')).rejects.toThrow('RPC HTTP 503');
  });
  it('returns a typed error when the RPC cannot be reached', async () => {
    const transport = new JsonRpcTransport('https://rpc.invalid', async () => {
      throw new Error('connect ECONNREFUSED');
    });
    await expect(transport.request('eth_chainId')).rejects.toMatchObject({
      code: 'RPC_UNAVAILABLE',
    });
    await expect(transport.request('eth_chainId')).rejects.toThrow(
      'RPC request failed for eth_chainId',
    );
  });
  it('reports when a network has no EIP-1559 base fee', async () => {
    const rpc = new EvmRpc({
      request: async <T>(method: string) => {
        if (method === 'eth_getBlockByNumber') return { baseFeePerGas: null } as T;
        return '0x1' as T;
      },
    });
    await expect(rpc.latestBaseFeePerGas()).rejects.toMatchObject({ code: 'EIP1559_UNAVAILABLE' });
  });
});

describe('Moralis boundary', () => {
  it('keeps API key in the request header and returns indexed balances', async () => {
    let requestUrl = '';
    let requestHeaders: HeadersInit | undefined;
    const client = new MoralisEvmClient({
      apiKey: 'test-key',
      fetcher: async (input, init) => {
        requestUrl = String(input);
        requestHeaders = init?.headers;
        return new Response(
          JSON.stringify([
            {
              tokenAddress: '0x0000000000000000000000000000000000000001',
              symbol: 'TST',
              name: 'Test',
              decimals: 18,
              balance: '1',
              possibleSpam: false,
            },
          ]),
        );
      },
    });
    const result = await client.tokenBalances('0x0000000000000000000000000000000000000001', '0x89');
    expect(requestUrl).toContain('chain=0x89');
    expect(requestHeaders).toEqual({ accept: 'application/json', 'X-API-Key': 'test-key' });
    expect(result[0]?.symbol).toBe('TST');
  });
});

describe('EIP-1559 transaction pipeline', () => {
  const from = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as const;
  const to = '0x0000000000000000000000000000000000000001' as const;
  const rpc = new EvmRpc({
    request: async <T>(method: string) => {
      if (method === 'eth_getBlockByNumber') return { baseFeePerGas: '0x3b9aca00' } as T;
      const values: Record<string, string> = {
        eth_chainId: '0x1',
        eth_getTransactionCount: '0x7',
        eth_gasPrice: '0x3b9aca00',
        eth_maxPriorityFeePerGas: '0x5f5e100',
        eth_estimateGas: '0x5208',
      };
      return values[method] as T;
    },
  });
  it('creates a preview with exact debit and signs locally', async () => {
    const { TransactionBuilder, NETWORKS, EvmWallet } = await import('../src/index.js');
    const prepared = await new TransactionBuilder(rpc).prepareNativeTransfer({
      from,
      to,
      value: 1_000_000_000_000_000n,
      network: NETWORKS.ethereum,
    });
    expect(prepared.transaction.nonce).toBe(7);
    expect(prepared.transaction.gas).toBe(21_000n);
    expect(prepared.preview.baseFeePerGas).toBe(1_000_000_000n);
    expect(prepared.transaction.maxPriorityFeePerGas).toBe(100_000_000n);
    expect(prepared.transaction.maxFeePerGas).toBe(2_100_000_000n);
    expect(prepared.preview.estimatedFee).toBe(44_100_000_000_000n);
    let signerPayload: Record<string, unknown> | undefined;
    const capturingAccount = {
      address: from,
      signTransaction: async (payload: Record<string, unknown>) => {
        signerPayload = payload;
        return '0x1234' as `0x${string}`;
      },
    } as never;
    const signature = await new TransactionBuilder(rpc).sign(prepared, capturingAccount);
    expect(signature).toBe('0x1234');
    expect(signerPayload).toEqual({
      type: 'eip1559',
      chainId: prepared.transaction.chainId,
      nonce: prepared.transaction.nonce,
      to: prepared.transaction.to,
      value: prepared.transaction.value,
      gas: prepared.transaction.gas,
      maxFeePerGas: prepared.transaction.maxFeePerGas,
      maxPriorityFeePerGas: prepared.transaction.maxPriorityFeePerGas,
    });
    await expect(
      new TransactionBuilder(rpc).sign(prepared, EvmWallet.fromMnemonic(MNEMONIC).account(0)),
    ).resolves.toMatch(/^0x[0-9a-f]+$/);
  });
  it('uses the latest base fee plus a next-block safety envelope', async () => {
    const { TransactionBuilder, NETWORKS } = await import('../src/index.js');
    const requests: string[] = [];
    const dynamicRpc = new EvmRpc({
      request: async <T>(method: string) => {
        requests.push(method);
        if (method === 'eth_getBlockByNumber') return { baseFeePerGas: '0x59682f00' } as T;
        return {
          eth_chainId: '0x1',
          eth_getTransactionCount: '0x0',
          eth_maxPriorityFeePerGas: '0x5f5e100',
          eth_estimateGas: '0x5208',
        }[method] as T;
      },
    });
    const prepared = await new TransactionBuilder(dynamicRpc).prepareNativeTransfer({
      from,
      to,
      value: 1n,
      network: NETWORKS.ethereum,
    });
    expect(prepared.transaction.maxFeePerGas).toBe(3_100_000_000n);
    expect(prepared.preview.estimatedFee).toBe(65_100_000_000_000n);
    expect(requests).toContain('eth_getBlockByNumber');
  });
  it('blocks chain mismatch and mismatched signing account', async () => {
    const { TransactionBuilder, NETWORKS, EvmWallet } = await import('../src/index.js');
    const builder = new TransactionBuilder(rpc);
    await expect(
      builder.prepareNativeTransfer({ from, to, value: 1n, network: NETWORKS.sepolia }),
    ).rejects.toThrow('RPC chain mismatch');
    const prepared = await builder.prepareNativeTransfer({
      from,
      to,
      value: 1n,
      network: NETWORKS.ethereum,
    });
    await expect(
      builder.sign(prepared, EvmWallet.fromMnemonic(MNEMONIC).account(1)),
    ).rejects.toThrow('does not match');
  });
  it('rejects malformed addresses and negative values', async () => {
    const { TransactionBuilder, NETWORKS } = await import('../src/index.js');
    const builder = new TransactionBuilder(rpc);
    await expect(
      builder.prepareNativeTransfer({
        from: '0xnope' as `0x${string}`,
        to,
        value: 1n,
        network: NETWORKS.ethereum,
      }),
    ).rejects.toThrow('from must be a valid');
    await expect(
      builder.prepareNativeTransfer({ from, to, value: -1n, network: NETWORKS.ethereum }),
    ).rejects.toThrow('non-negative');
  });
});

describe('ERC-20 operations', () => {
  const from = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as const;
  const token = '0x00000000000000000000000000000000000000aa' as const;
  const recipient = '0x00000000000000000000000000000000000000bb' as const;
  it('encodes transfer, simulates it, and exposes token details in preview', async () => {
    const calls: string[] = [];
    const rpc = new EvmRpc({
      request: async <T>(method: string) => {
        calls.push(method);
        if (method === 'eth_getBlockByNumber') return { baseFeePerGas: '0x3b9aca00' } as T;
        const values: Record<string, string> = {
          eth_chainId: '0x1',
          eth_getTransactionCount: '0x2',
          eth_gasPrice: '0x3b9aca00',
          eth_maxPriorityFeePerGas: '0x5f5e100',
          eth_call: '0x',
          eth_estimateGas: '0x927c',
        };
        return values[method] as T;
      },
    });
    const { Erc20Builder, NETWORKS, TransactionBuilder } = await import('../src/index.js');
    const prepared = await new Erc20Builder(new TransactionBuilder(rpc), rpc).prepareTransfer({
      from,
      token,
      to: recipient,
      amount: 1_500n,
      tokenSymbol: 'TST',
      network: NETWORKS.ethereum,
    });
    expect(prepared.preview.action).toBe('erc20-transfer');
    expect(prepared.preview.tokenAmount).toBe(1_500n);
    expect(prepared.preview.tokenSymbol).toBe('TST');
    expect(calls.indexOf('eth_call')).toBeGreaterThan(-1);
    expect(calls.indexOf('eth_call')).toBeLessThan(calls.indexOf('eth_estimateGas'));
    expect(prepared.transaction.to).toBe('0x00000000000000000000000000000000000000AA');
    expect(prepared.transaction.data).toMatch(/^0xa9059cbb[0-9a-f]+$/);
    let signerPayload: Record<string, unknown> | undefined;
    const capturingAccount = {
      address: from,
      signTransaction: async (payload: Record<string, unknown>) => {
        signerPayload = payload;
        return '0x1234' as `0x${string}`;
      },
    } as never;
    await new TransactionBuilder(rpc).sign(prepared, capturingAccount);
    expect(signerPayload?.data).toBe(prepared.transaction.data);
    expect(signerPayload?.maxFeePerGas).toBe(prepared.transaction.maxFeePerGas);
  });
  it('encodes approve and rejects negative token amounts', async () => {
    const rpc = new EvmRpc({
      request: async <T>(method: string) =>
        method === 'eth_getBlockByNumber'
          ? ({ baseFeePerGas: '0x3b9aca00' } as T)
          : ({
              eth_chainId: '0x1',
              eth_getTransactionCount: '0x2',
              eth_gasPrice: '0x1',
              eth_maxPriorityFeePerGas: '0x1',
              eth_call: '0x',
              eth_estimateGas: '0x5208',
            }[method] as T),
    });
    const { Erc20Builder, NETWORKS, TransactionBuilder } = await import('../src/index.js');
    const builder = new Erc20Builder(new TransactionBuilder(rpc), rpc);
    const prepared = await builder.prepareApprove({
      from,
      token,
      spender: recipient,
      amount: 10n,
      network: NETWORKS.ethereum,
    });
    expect(prepared.preview.action).toBe('erc20-approve');
    expect(prepared.preview.spender).toBe(recipient);
    await expect(
      builder.prepareTransfer({
        from,
        token,
        to: recipient,
        amount: -1n,
        network: NETWORKS.ethereum,
      }),
    ).rejects.toThrow('non-negative');
  });
});

describe('NFT operations', () => {
  const from = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as const;
  const token = '0x00000000000000000000000000000000000000aa' as const;
  const recipient = '0x00000000000000000000000000000000000000bb' as const;
  const rpc = new EvmRpc({
    request: async <T>(method: string) =>
      method === 'eth_getBlockByNumber'
        ? ({ baseFeePerGas: '0x3b9aca00' } as T)
        : ({
            eth_chainId: '0x1',
            eth_getTransactionCount: '0x1',
            eth_gasPrice: '0x3b9aca00',
            eth_maxPriorityFeePerGas: '0x5f5e100',
            eth_call: '0x',
            eth_estimateGas: '0x927c',
          }[method] as T),
  });
  it('prepares simulated ERC-721 and ERC-1155 transfers', async () => {
    const { NftBuilder, NETWORKS, TransactionBuilder } = await import('../src/index.js');
    const builder = new NftBuilder(new TransactionBuilder(rpc), rpc);
    const nft721 = await builder.prepareErc721Transfer({
      from,
      token,
      to: recipient,
      tokenId: 42n,
      network: NETWORKS.ethereum,
    });
    const nft1155 = await builder.prepareErc1155Transfer({
      from,
      token,
      to: recipient,
      tokenId: 7n,
      amount: 3n,
      network: NETWORKS.ethereum,
    });
    expect(nft721.preview.standard).toBe('ERC-721');
    expect(nft721.preview.assetId).toBe(42n);
    expect(nft721.preview.quantity).toBe(1n);
    expect(nft721.transaction.data).toMatch(/^0x42842e0e[0-9a-f]+$/);
    expect(nft1155.transaction.data).toMatch(/^0xf242432a[0-9a-f]+$/);
    expect(nft1155.preview.standard).toBe('ERC-1155');
    expect(nft1155.preview.assetId).toBe(7n);
    expect(nft1155.preview.quantity).toBe(3n);
  });
});

describe('encrypted file vault storage', () => {
  it('writes only encrypted JSON with restrictive permissions and round-trips', async () => {
    const { EncryptedFileVaultStore } = await import('../src/index.js');
    const directory = await mkdtemp(join(tmpdir(), 'wallet-core-'));
    const path = join(directory, 'vault.json');
    const vault = createVault(MNEMONIC, 'correct horse battery staple');
    const store = new EncryptedFileVaultStore(path);
    await store.save(vault);
    const metadata = await stat(path);
    const raw = await readFile(path, 'utf8');
    expect(metadata.mode & 0o777).toBe(0o600);
    expect(raw).not.toContain(MNEMONIC);
    expect((await store.load()).ciphertext).toBe(vault.ciphertext);
  });
});

describe('EIP-712 typed data', () => {
  it('signs typed data locally and rejects a domain chain mismatch', async () => {
    const { Eip712Signer, EvmWallet } = await import('../src/index.js');
    const account = EvmWallet.fromMnemonic(MNEMONIC).account(0);
    const signer = new Eip712Signer();
    const request = {
      account,
      chainId: 1,
      domain: {
        name: 'WalletCore',
        version: '1',
        chainId: 1,
        verifyingContract: '0x0000000000000000000000000000000000000001' as const,
      },
      types: { Mail: [{ name: 'contents', type: 'string' }] as const },
      primaryType: 'Mail',
      message: { contents: 'Approve this typed message' },
    };
    const signature = await signer.sign(request);
    expect(signature).toMatch(/^0x[0-9a-f]+$/);
    await expect(signer.sign({ ...request, chainId: 5 })).rejects.toThrow('EIP-712 chain mismatch');
  });
});
