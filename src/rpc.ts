import type { Hex } from 'viem';
export interface RpcTransport {
  request<T = unknown>(method: string, params?: readonly unknown[]): Promise<T>;
}
export class JsonRpcTransport implements RpcTransport {
  constructor(
    private readonly url: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}
  async request<T>(method: string, params: readonly unknown[] = []): Promise<T> {
    const response = await this.fetcher(this.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
    });
    if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
    const body = (await response.json()) as {
      result?: T;
      error?: { code: number; message: string };
    };
    if (body.error) throw new Error(`RPC ${body.error.code}: ${body.error.message}`);
    return body.result as T;
  }
}
export class EvmRpc {
  constructor(private readonly transport: RpcTransport) {}
  chainId(): Promise<bigint> {
    return this.transport.request<string>('eth_chainId').then((x) => BigInt(x));
  }
  balance(address: `0x${string}`, block = 'latest'): Promise<bigint> {
    return this.transport
      .request<string>('eth_getBalance', [address, block])
      .then((x) => BigInt(x));
  }
  nonce(address: `0x${string}`, tag = 'pending'): Promise<number> {
    return this.transport
      .request<string>('eth_getTransactionCount', [address, tag])
      .then((x) => Number(BigInt(x)));
  }
  gasPrice(): Promise<bigint> {
    return this.transport.request<string>('eth_gasPrice').then((x) => BigInt(x));
  }
  maxPriorityFeePerGas(): Promise<bigint> {
    return this.transport.request<string>('eth_maxPriorityFeePerGas').then((x) => BigInt(x));
  }
  call(transaction: Record<string, unknown>, block = 'latest'): Promise<Hex> {
    return this.transport.request<Hex>('eth_call', [transaction, block]);
  }
  estimateGas(transaction: Record<string, unknown>): Promise<bigint> {
    return this.transport.request<string>('eth_estimateGas', [transaction]).then((x) => BigInt(x));
  }
  sendRawTransaction(raw: Hex): Promise<Hex> {
    return this.transport.request<Hex>('eth_sendRawTransaction', [raw]);
  }
}
