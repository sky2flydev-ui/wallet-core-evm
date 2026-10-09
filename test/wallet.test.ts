import { describe, expect, it } from 'vitest';
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
      const values: Record<string, string> = {
        eth_chainId: '0x1',
        eth_getTransactionCount: '0x7',
        eth_gasPrice: '0x3b9aca00',
        eth_maxPriorityFeePerGas: '0x3b9aca0',
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
    expect(prepared.preview.estimatedFee).toBe(21_000_000_000_000n);
    const signature = await new TransactionBuilder(rpc).sign(
      prepared,
      EvmWallet.fromMnemonic(MNEMONIC).account(0),
    );
    expect(signature).toMatch(/^0x[0-9a-f]+$/);
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
        const values: Record<string, string> = {
          eth_chainId: '0x1',
          eth_getTransactionCount: '0x2',
          eth_gasPrice: '0x3b9aca00',
          eth_maxPriorityFeePerGas: '0x3b9aca0',
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
  });
  it('encodes approve and rejects negative token amounts', async () => {
    const rpc = new EvmRpc({
      request: async <T>(method: string) =>
        ({
          eth_chainId: '0x1',
          eth_getTransactionCount: '0x2',
          eth_gasPrice: '0x1',
          eth_maxPriorityFeePerGas: '0x1',
          eth_call: '0x',
          eth_estimateGas: '0x5208',
        })[method] as T,
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
