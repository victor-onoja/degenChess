import { useMemo } from "react";
import { isAddress, zeroAddress } from "viem";
import { useReadContract } from "wagmi";
import { CHAIN, RATINGS_ADDRESS } from "../config";
import { chessRatingsAbi } from "../contracts/abi";
import { POLL_MS } from "./contract";
import { headline } from "./rating";

// chess.com ratings, as verified and written on-chain by the rating workflow (cre/rating).

export const ratingsContract = { address: RATINGS_ADDRESS, abi: chessRatingsAbi, chainId: CHAIN.id } as const;

export interface LinkedRating {
  handle: string;
  rapid: number;
  blitz: number;
  bullet: number;
}

/** Verified ratings for a set of addresses. Returns a lookup that gives the one number to show, or null. */
export function useRatings(addresses: readonly (string | null | undefined)[]) {
  const unique = useMemo(
    () => Array.from(new Set(addresses.filter((a): a is string => !!a && isAddress(a) && a !== zeroAddress).map((a) => a.toLowerCase()))).sort(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [addresses.join(",")]
  ) as `0x${string}`[];
  const { data } = useReadContract({
    ...ratingsContract,
    functionName: "getRatings",
    args: [unique],
    query: { enabled: !!RATINGS_ADDRESS && unique.length > 0, staleTime: 60_000 },
  });
  return useMemo(() => {
    const byAddress = new Map<string, LinkedRating>();
    unique.forEach((a, i) => {
      const r = data?.[i];
      if (r && r.handle) byAddress.set(a, { handle: r.handle, rapid: r.rapid, blitz: r.blitz, bullet: r.bullet });
    });
    const ratingOf = (address: string | null | undefined) => (address ? byAddress.get(address.toLowerCase()) ?? null : null);
    /** " (1450)" for a player with a verified rating, "" otherwise: goes straight after a name. */
    const rated = (address: string | null | undefined) => {
      const r = ratingOf(address);
      return r && headline(r) ? ` (${headline(r)})` : "";
    };
    return { ratingOf, rated };
  }, [unique, data]);
}

/** The signed-in player's own link: what is verified, what is waiting to be checked, and why the last try failed. */
export function useMyRating(address: string | null | undefined, watching: boolean) {
  const query = { enabled: !!RATINGS_ADDRESS && !!address, refetchInterval: watching ? POLL_MS / 2 : false } as const;
  const args = [(address ?? zeroAddress) as `0x${string}`] as const;
  const { data: rating, refetch: refetchRating } = useReadContract({ ...ratingsContract, functionName: "ratingOf", args, query });
  const { data: pending, refetch: refetchPending } = useReadContract({ ...ratingsContract, functionName: "pending", args, query });
  const { data: failure, refetch: refetchFailure } = useReadContract({ ...ratingsContract, functionName: "lastFailure", args, query });
  return {
    rating: rating && rating.handle ? (rating as LinkedRating) : null,
    pending: pending ?? "",
    failure: failure ?? 0,
    refetch: () => Promise.all([refetchRating(), refetchPending(), refetchFailure()]),
  };
}
