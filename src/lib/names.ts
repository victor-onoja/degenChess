import { useEffect, useMemo, useState } from "react";
import { isAddress, keccak256, toBytes, zeroAddress } from "viem";
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

export type NameStatus = "empty" | "invalid" | "checking" | "available" | "yours" | "taken";

/** Whether a username can be claimed by `me`, checked against the contract as the player types. */
export function useNameStatus(name: string, me: string | null | undefined): NameStatus {
  const [settled, setSettled] = useState(name);
  useEffect(() => {
    const t = setTimeout(() => setSettled(name), 300);
    return () => clearTimeout(t);
  }, [name]);
  const valid = NAME_RULE.test(settled);
  const { data: holder, isFetching } = useReadContract({
    ...namesContract,
    functionName: "ownerOfName",
    args: [keccak256(toBytes(valid ? settled : "_"))],
    query: { enabled: !!NAMES_ADDRESS && valid, staleTime: 5_000 },
  });
  if (!name) return "empty";
  if (!NAME_RULE.test(name)) return "invalid";
  if (name !== settled || isFetching || holder === undefined) return "checking";
  if (holder === zeroAddress) return "available";
  return me && holder.toLowerCase() === me.toLowerCase() ? "yours" : "taken";
}

export const NAME_HINT: Record<NameStatus, string> = {
  empty: "3 to 16 letters, numbers or _",
  invalid: "3 to 16 letters, numbers or _",
  checking: "Checking...",
  available: "Available. It's yours if you want it",
  yours: "That's already your name",
  taken: "Someone has that name. Try another",
};
