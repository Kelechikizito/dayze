import { baseSepolia } from "viem/chains";

/*
 * Dayze runs on Base Sepolia only, where Fhenix CoFHE is live.
 * The RPC URL is optional. Without it, viem uses the chain's public RPC.
 * If you set an Alchemy URL here, it ships to the browser: restrict its allowed
 * origins in the Alchemy dashboard.
 */

export const supportedChains = [baseSepolia] as const;

export type SupportedChain = (typeof supportedChains)[number];

export const defaultChain = baseSepolia;

export const rpcUrls: Record<SupportedChain["id"], string | undefined> = {
  [baseSepolia.id]: process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC || undefined,
};

/** Whether a chain id is one Dayze runs on */
export function isSupportedChainId(id: number | undefined): id is SupportedChain["id"] {
  return supportedChains.some((c) => c.id === id);
}
