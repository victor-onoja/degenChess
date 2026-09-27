import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePublicClient, useWriteContract } from "wagmi";
import { BaseError, TransactionReceipt } from "viem";
import { toast } from "react-toastify";
import { CHAIN } from "../config";

type WriteParams = Parameters<ReturnType<typeof useWriteContract>["writeContractAsync"]>[0];

export function shortError(e: unknown): string {
  if (e instanceof BaseError) {
    // Custom errors (e.g. NotYourTurn) surface as the error name in shortMessage.
    return e.shortMessage.split("\n")[0];
  }
  return e instanceof Error ? e.message : String(e);
}

/**
 * Sends a contract write, waits for it to be mined, and refreshes all on-chain reads.
 * Only one transaction is in flight at a time; `pending` holds its label.
 */
export function useTx() {
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient({ chainId: CHAIN.id });
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<string | null>(null);

  async function send(label: string, params: WriteParams): Promise<TransactionReceipt | null> {
    setPending(label);
    let toastId: ReturnType<typeof toast.loading> | null = null;
    try {
      const hash = await writeContractAsync({ ...params, chainId: CHAIN.id } as WriteParams);
      toastId = toast.loading(`${label}: waiting for confirmation...`);
      const receipt = await publicClient!.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("transaction reverted");
      toast.update(toastId, { render: `${label}: confirmed`, type: "success", isLoading: false, autoClose: 4000 });
      await queryClient.invalidateQueries();
      return receipt;
    } catch (e) {
      const message = `${label} failed: ${shortError(e)}`;
      if (toastId !== null) {
        toast.update(toastId, { render: message, type: "error", isLoading: false, autoClose: 8000 });
      } else {
        toast.error(message);
      }
      return null;
    } finally {
      setPending(null);
    }
  }

  return { send, pending };
}
