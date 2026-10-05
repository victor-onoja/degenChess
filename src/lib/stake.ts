import { maxUint256 } from "viem";
import { publicClient, type Call } from "./account";
import { chessContract, tokenContract } from "./contract";

/**
 * Approve (only if needed) + the paying call, signed together under one passkey prompt.
 * `spender` is the contract taking the money: the game contract unless said otherwise.
 */
export async function withApproval(owner: `0x${string}`, amount: bigint, call: Call, spender: `0x${string}` = chessContract.address): Promise<Call[]> {
  const allowance = await publicClient.readContract({
    ...tokenContract,
    functionName: "allowance",
    args: [owner, spender],
  });
  const approve: Call = { ...tokenContract, functionName: "approve", args: [spender, maxUint256] };
  return allowance < amount ? [approve, call] : [call];
}
