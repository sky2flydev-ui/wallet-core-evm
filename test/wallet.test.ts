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
