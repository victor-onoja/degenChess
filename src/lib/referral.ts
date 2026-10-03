import { isAddress, keccak256, toBytes, zeroAddress, type PublicClient } from "viem";
import { NAMES_ADDRESS } from "../config";
import { playerNamesAbi } from "../contracts/abi";
import { NAME_RULE } from "./names";

// Invites. A shared link carries `ref=<username or address>`. The first one a visitor arrives with is
// remembered, and at sign-up it is recorded on-chain (DegenChess.setReferrer), so the person who
// invited them earns part of the fee on their games.

const KEY = "degenchess.ref";

/** Remember who sent this visitor, the first time only. */
export function rememberReferrer() {
  try {
    const ref = new URLSearchParams(window.location.search).get("ref");
    if (ref && !localStorage.getItem(KEY)) localStorage.setItem(KEY, ref);
  } catch {}
}

/** The address that invited this visitor, if any (a username is looked up). */
export async function referrerAddress(client: PublicClient): Promise<`0x${string}` | null> {
  let ref: string | null = null;
  try {
    ref = localStorage.getItem(KEY);
  } catch {}
  if (!ref) return null;
  if (isAddress(ref)) return ref;
  if (!NAME_RULE.test(ref) || !NAMES_ADDRESS) return null;
  const holder = await client.readContract({
    address: NAMES_ADDRESS,
    abi: playerNamesAbi,
    functionName: "ownerOfName",
    args: [keccak256(toBytes(ref))],
  });
  return holder === zeroAddress ? null : holder;
}
