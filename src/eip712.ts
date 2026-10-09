import type { Hex, TypedDataDomain } from 'viem';
import type { LocalAccount } from 'viem/accounts';

export type Eip712Type = readonly { readonly name: string; readonly type: string }[];
export interface Eip712Request {
  readonly account: LocalAccount;
  readonly chainId: number;
  readonly domain: TypedDataDomain;
  readonly types: Record<string, Eip712Type>;
  readonly primaryType: string;
  readonly message: Record<string, unknown>;
}
export class Eip712Signer {
  async sign(request: Eip712Request): Promise<Hex> {
    if (request.domain.chainId !== request.chainId)
      throw new Error(
        `EIP-712 chain mismatch: expected ${request.chainId}, got ${String(request.domain.chainId)}`,
      );
    if (!request.domain.name || !request.primaryType || !request.types[request.primaryType])
      throw new TypeError('EIP-712 domain, primaryType and matching types are required');
    const { account, ...typedData } = request;
    return account.signTypedData(typedData as never);
  }
}
