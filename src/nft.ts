import { encodeFunctionData, getAddress, isAddress, type Hex } from 'viem';
import type { EvmNetwork } from './chains.js';
import type { EvmRpc } from './rpc.js';
import type { PreparedTransfer, TransactionBuilder } from './transaction.js';

export const erc721Abi = [
  {
    type: 'function',
    name: 'safeTransferFrom',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'setApprovalForAll',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'operator', type: 'address' },
      { name: 'approved', type: 'bool' },
    ],
  },
] as const;
export const erc1155Abi = [
  {
    type: 'function',
    name: 'safeTransferFrom',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'id', type: 'uint256' },
      { name: 'amount', type: 'uint256' },
      { name: 'data', type: 'bytes' },
    ],
  },
  {
    type: 'function',
    name: 'setApprovalForAll',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'operator', type: 'address' },
      { name: 'approved', type: 'bool' },
    ],
  },
] as const;

export type NftPreview = PreparedTransfer['preview'] & {
  readonly standard: 'ERC-721' | 'ERC-1155';
  readonly assetId?: bigint;
  readonly quantity?: bigint;
  readonly operator?: `0x${string}`;
};
export type PreparedNft = Omit<PreparedTransfer, 'preview'> & { readonly preview: NftPreview };
export interface Erc721TransferRequest {
  readonly from: `0x${string}`;
  readonly token: `0x${string}`;
  readonly to: `0x${string}`;
  readonly tokenId: bigint;
  readonly network: EvmNetwork;
  readonly gasLimit?: bigint | undefined;
}
export interface Erc1155TransferRequest {
  readonly from: `0x${string}`;
  readonly token: `0x${string}`;
  readonly to: `0x${string}`;
  readonly tokenId: bigint;
  readonly amount: bigint;
  readonly network: EvmNetwork;
  readonly data?: Hex | undefined;
  readonly gasLimit?: bigint | undefined;
}

function addr(value: string, field: string): `0x${string}` {
  if (!isAddress(value)) throw new TypeError(`${field} must be a valid EVM address`);
  return getAddress(value);
}
function nonNegative(value: bigint, field: string): bigint {
  if (value < 0n) throw new RangeError(`${field} must be non-negative`);
  return value;
}
function withNftPreview(
  prepared: PreparedTransfer,
  extra: Omit<NftPreview, keyof PreparedTransfer['preview']>,
): PreparedNft {
  return { ...prepared, preview: { ...prepared.preview, ...extra } as NftPreview };
}

export class NftBuilder {
  constructor(
    private readonly transactions: TransactionBuilder,
    private readonly rpc: EvmRpc,
  ) {}
  async prepareErc721Transfer(request: Erc721TransferRequest): Promise<PreparedNft> {
    const from = addr(request.from, 'from');
    const token = addr(request.token, 'token');
    const to = addr(request.to, 'to');
    const tokenId = nonNegative(request.tokenId, 'tokenId');
    const data = encodeFunctionData({
      abi: erc721Abi,
      functionName: 'safeTransferFrom',
      args: [from, to, tokenId],
    });
    const prepared = await this.transactions.prepareContractCall({
      from,
      to: token,
      value: 0n,
      data,
      network: request.network,
      gasLimit: request.gasLimit,
      action: 'erc721-safe-transfer',
      tokenAddress: token,
      tokenAmount: tokenId,
      simulation: true,
    });
    return withNftPreview(prepared, { standard: 'ERC-721', assetId: tokenId, quantity: 1n });
  }
  async prepareErc721Approval(
    fromInput: `0x${string}`,
    tokenInput: `0x${string}`,
    approvedInput: `0x${string}`,
    tokenId: bigint,
    network: EvmNetwork,
  ): Promise<PreparedNft> {
    const from = addr(fromInput, 'from');
    const token = addr(tokenInput, 'token');
    const approved = addr(approvedInput, 'approved');
    const id = nonNegative(tokenId, 'tokenId');
    const data = encodeFunctionData({
      abi: erc721Abi,
      functionName: 'approve',
      args: [approved, id],
    });
    const prepared = await this.transactions.prepareContractCall({
      from,
      to: token,
      value: 0n,
      data,
      network,
      action: 'erc721-approve',
      tokenAddress: token,
      tokenAmount: id,
      simulation: true,
    });
    return withNftPreview(prepared, {
      standard: 'ERC-721',
      assetId: id,
      quantity: 1n,
      operator: approved,
    });
  }
  async prepareErc1155Transfer(request: Erc1155TransferRequest): Promise<PreparedNft> {
    const from = addr(request.from, 'from');
    const token = addr(request.token, 'token');
    const to = addr(request.to, 'to');
    const id = nonNegative(request.tokenId, 'tokenId');
    const amount = nonNegative(request.amount, 'amount');
    const data = encodeFunctionData({
      abi: erc1155Abi,
      functionName: 'safeTransferFrom',
      args: [from, to, id, amount, request.data ?? '0x'],
    });
    const prepared = await this.transactions.prepareContractCall({
      from,
      to: token,
      value: 0n,
      data,
      network: request.network,
      gasLimit: request.gasLimit,
      action: 'erc1155-safe-transfer',
      tokenAddress: token,
      tokenAmount: amount,
      simulation: true,
    });
    return withNftPreview(prepared, { standard: 'ERC-1155', assetId: id, quantity: amount });
  }
}
