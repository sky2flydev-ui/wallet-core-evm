export interface TokenBalance {
  tokenAddress: `0x${string}`;
  symbol: string | null;
  name: string | null;
  decimals: number | null;
  balance: string;
  possibleSpam: boolean;
}
export interface MoralisClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetcher?: typeof fetch;
}
export class MoralisEvmClient {
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;
  constructor(private readonly options: MoralisClientOptions) {
    if (!options.apiKey.trim()) throw new Error('Moralis API key is required');
    this.baseUrl = options.baseUrl ?? 'https://deep-index.moralis.io/api/v2.2';
    this.fetcher = options.fetcher ?? fetch;
  }
  async tokenBalances(address: `0x${string}`, chain = '0x1'): Promise<TokenBalance[]> {
    const response = await this.fetcher(
      `${this.baseUrl}/${address}/erc20?chain=${encodeURIComponent(chain)}`,
      { headers: { accept: 'application/json', 'X-API-Key': this.options.apiKey } },
    );
    if (!response.ok) throw new Error(`Moralis HTTP ${response.status}`);
    return (await response.json()) as TokenBalance[];
  }
}
