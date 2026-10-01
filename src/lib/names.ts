import { useMemo } from "react";
import { isAddress, zeroAddress } from "viem";
import { useReadContract } from "wagmi";
import { CHAIN, NAMES_ADDRESS } from "../config";
import { playerNamesAbi } from "../contracts/abi";
import { shortAddress } from "./format";

export const namesContract = { address: NAMES_ADDRESS, abi: playerNamesAbi, chainId: CHAIN.id } as const;

/** Usernames are 3-16 characters: lowercase letters, digits and underscore (enforced by the contract). */
export const NAME_RULE = /^[a-z0-9_]{3,16}$/;
export const cleanName = (input: string) => input.trim().toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 16);

/** Looks up usernames for a set of addresses. Returns a function that renders a name or a short address. */
export function useNames(addresses: readonly (string | null | undefined)[]) {
  const unique = useMemo(
    () =>
      Array.from(new Set(addresses.filter((a): a is string => !!a && isAddress(a) && a !== zeroAddress).map((a) => a.toLowerCase()))).sort(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [addresses.join(",")]
  ) as `0x${string}`[];

  const { data } = useReadContract({
    ...namesContract,
    functionName: "namesOf",
    args: [unique],
    query: { enabled: !!NAMES_ADDRESS && unique.length > 0, staleTime: 30_000 },
  });

  return useMemo(() => {
    const byAddress = new Map<string, string>();
    unique.forEach((a, i) => data?.[i] && byAddress.set(a, data[i]));
    const nameOf = (address: string | null | undefined) => (address ? byAddress.get(address.toLowerCase()) : undefined);
    const label = (address: string) => nameOf(address) ?? shortAddress(address);
    return { nameOf, label };
  }, [unique, data]);
}
