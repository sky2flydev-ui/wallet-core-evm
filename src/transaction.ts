import { getAddress, isAddress, type Hex } from 'viem';
import type { LocalAccount } from 'viem/accounts';
import type { EvmNetwork } from './chains.js';
import { EvmRpc } from './rpc.js';

export interface NativeTransferRequest {
  readonly from: `0x${string}`;
  readonly to: `0x${string}`;
  readonly value: bigint;
  readonly network: EvmNetwork;
  readonly gasLimit?: bigint;
}
export interface UnsignedEip1559Transaction {
  readonly type: 'eip1559';
  readonly chainId: number;
  readonly nonce: number;
  readonly from: `0x${string}`;
  readonly to: `0x${string}`;
  readonly value: bigint;
  readonly gas: bigint;
  readonly maxFeePerGas: bigint;
  readonly maxPriorityFeePerGas: bigint;
}
export interface TransactionPreview {
  readonly network: string;
  readonly chainId: number;
  readonly from: `0x${string}`;
  readonly to: `0x${string}`;
  readonly value: bigint;
  readonly nativeSymbol: string;
  readonly estimatedFee: bigint;
  readonly totalDebit: bigint;
  readonly nonce: number;
  readonly gasLimit: bigint;
  readonly maxFeePerGas: bigint;
  readonly maxPriorityFeePerGas: bigint;
}
export interface PreparedTransfer {
  readonly transaction: UnsignedEip1559Transaction;
  readonly preview: TransactionPreview;
}

function assertAddress(value: string, field: string): asserts value is `0x${string}` {
  if (!isAddress(value)) throw new TypeError(`${field} must be a valid EVM address`);
}
function assertNonNegative(value: bigint, field: string): void {
  if (value < 0n) throw new RangeError(`${field} must be non-negative`);
}

export class TransactionBuilder {
  constructor(private readonly rpc: EvmRpc) {}
  async prepareNativeTransfer(request: NativeTransferRequest): Promise<PreparedTransfer> {
    assertAddress(request.from, 'from');
    assertAddress(request.to, 'to');
    assertNonNegative(request.value, 'value');
    const actualChainId = await this.rpc.chainId();
    if (actualChainId !== BigInt(request.network.chainId))
      throw new Error(
        `RPC chain mismatch: expected ${request.network.chainId}, got ${actualChainId}`,
      );
    const nonce = await this.rpc.nonce(request.from);
    const [gasPrice, priority] = await Promise.all([
      this.rpc.gasPrice(),
      this.rpc.maxPriorityFeePerGas(),
    ]);
    const maxFeePerGas = gasPrice > priority ? gasPrice : priority;
    const gas =
      request.gasLimit ??
      (await this.rpc.estimateGas({
        from: request.from,
        to: request.to,
        value: `0x${request.value.toString(16)}`,
      }));
    const transaction: UnsignedEip1559Transaction = {
      type: 'eip1559',
      chainId: request.network.chainId,
      nonce,
      from: getAddress(request.from),
      to: getAddress(request.to),
      value: request.value,
      gas,
      maxFeePerGas,
      maxPriorityFeePerGas: priority,
    };
    const estimatedFee = gas * maxFeePerGas;
    return {
      transaction,
      preview: {
        network: request.network.name,
        chainId: request.network.chainId,
        from: transaction.from,
        to: transaction.to,
        value: request.value,
        nativeSymbol: request.network.nativeSymbol,
        estimatedFee,
        totalDebit: request.value + estimatedFee,
        nonce,
        gasLimit: gas,
        maxFeePerGas,
        maxPriorityFeePerGas: priority,
      },
    };
  }
  async sign(prepared: PreparedTransfer, account: LocalAccount): Promise<Hex> {
    if (getAddress(account.address) !== prepared.transaction.from)
      throw new Error('Signing account does not match transaction.from');
    const tx = prepared.transaction;
    return account.signTransaction({
      type: 'eip1559',
      chainId: tx.chainId,
      nonce: tx.nonce,
      to: tx.to,
      value: tx.value,
      gas: tx.gas,
      maxFeePerGas: tx.maxFeePerGas,
      maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
    });
  }
}
