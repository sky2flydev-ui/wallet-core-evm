import { encodeFunctionData, getAddress, isAddress, type Hex } from 'viem';
import type { EvmNetwork } from './chains.js';
import { EvmRpc } from './rpc.js';
import type { PreparedTransfer, TransactionBuilder } from './transaction.js';

export const erc20Abi = [
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
] as const;

export interface Erc20TransferRequest {
  readonly from: `0x${string}`;
  readonly token: `0x${string}`;
  readonly to: `0x${string}`;
  readonly amount: bigint;
  readonly network: EvmNetwork;
  readonly gasLimit?: bigint | undefined;
  readonly tokenSymbol?: string | undefined;
}
export interface Erc20ApproveRequest {
  readonly from: `0x${string}`;
  readonly token: `0x${string}`;
  readonly spender: `0x${string}`;
  readonly amount: bigint;
  readonly network: EvmNetwork;
  readonly gasLimit?: bigint | undefined;
  readonly tokenSymbol?: string | undefined;
}
export interface Erc20PreparedTransfer extends PreparedTransfer {
  readonly preview: PreparedTransfer['preview'] & {
    readonly action: 'erc20-transfer';
    readonly tokenAddress: `0x${string}`;
    readonly tokenAmount: bigint;
    readonly tokenSymbol?: string | undefined;
  };
}
export interface Erc20PreparedApprove extends PreparedTransfer {
  readonly preview: PreparedTransfer['preview'] & {
    readonly action: 'erc20-approve';
    readonly tokenAddress: `0x${string}`;
    readonly tokenAmount: bigint;
    readonly spender: `0x${string}`;
    readonly tokenSymbol?: string | undefined;
  };
}

function address(value: string, field: string): `0x${string}` {
  if (!isAddress(value)) throw new TypeError(`${field} must be a valid EVM address`);
  return getAddress(value);
}
function amount(value: bigint): bigint {
  if (value < 0n) throw new RangeError('token amount must be non-negative');
  return value;
}

export class Erc20Builder {
  constructor(
    private readonly transactions: TransactionBuilder,
    private readonly rpc: EvmRpc,
  ) {}
  async prepareTransfer(request: Erc20TransferRequest): Promise<Erc20PreparedTransfer> {
    const from = address(request.from, 'from');
    const token = address(request.token, 'token');
    const to = address(request.to, 'to');
    const value = amount(request.amount);
    const data = encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [to, value] });
    const prepared = await this.transactions.prepareContractCall({
      from,
      to: token,
      value: 0n,
      data,
      network: request.network,
      gasLimit: request.gasLimit,
      action: 'erc20-transfer',
      tokenAddress: token,
      tokenAmount: value,
      tokenSymbol: request.tokenSymbol,
      simulation: true,
    });
    return prepared as Erc20PreparedTransfer;
  }
  async prepareApprove(request: Erc20ApproveRequest): Promise<Erc20PreparedApprove> {
    const from = address(request.from, 'from');
    const token = address(request.token, 'token');
    const spender = address(request.spender, 'spender');
    const value = amount(request.amount);
    const data = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: [spender, value],
    });
    const prepared = await this.transactions.prepareContractCall({
      from,
      to: token,
      value: 0n,
      data,
      network: request.network,
      gasLimit: request.gasLimit,
      action: 'erc20-approve',
      tokenAddress: token,
      tokenAmount: value,
      tokenSymbol: request.tokenSymbol,
      spender,
      simulation: true,
    });
    return prepared as Erc20PreparedApprove;
  }
}
