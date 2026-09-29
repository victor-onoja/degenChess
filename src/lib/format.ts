import { formatUnits } from "viem";
import { TOKEN_DECIMALS } from "../config";

export const formatToken = (value: bigint | undefined) =>
  value === undefined
    ? "-"
    : Number(formatUnits(value, TOKEN_DECIMALS)).toLocaleString(undefined, { maximumFractionDigits: 4 });

export const shortAddress = (a: string) => `${a.slice(0, 6)}...${a.slice(-4)}`;

export const sameAddress = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export function formatDuration(seconds: number) {
  if (seconds <= 0) return "0s";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
}
