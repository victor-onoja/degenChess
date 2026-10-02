import { maxUint256 } from "viem";
import { publicClient, type Call } from "./account";
import { chessContract, tokenContract } from "./contract";

/** Approve (only if needed) + the staking call, signed together under one passkey prompt. */
export async function withApproval(owner: `0x${string}`, amount: bigint, call: Call): Promise<Call[]> {
  const allowance = await publicClient.readContract({
    ...tokenContract,
    functionName: "allowance",
    args: [owner, chessContract.address],
  });
  const approve: Call = { ...tokenContract, functionName: "approve", args: [chessContract.address, maxUint256] };
  return allowance < amount ? [approve, call] : [call];
}
