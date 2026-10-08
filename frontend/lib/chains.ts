import { addRpcUrlOverrideToChain } from "@privy-io/react-auth";
import type { Chain } from "viem";
import { arbitrumSepolia, baseSepolia } from "viem/chains";

/*
 * Chains Dayze runs on: the testnets where Fhenix CoFHE is live.
 * RPC URLs are optional. Without them, viem uses each chain's public RPC.
 * If you set an Alchemy URL here, it ships to the browser: restrict its allowed
 * origins in the Alchemy dashboard.
 */

export const supportedChains = [arbitrumSepolia, baseSepolia] as const;

export type SupportedChain = (typeof supportedChains)[number];

export const defaultChain = arbitrumSepolia;

export const rpcUrls: Record<SupportedChain["id"], string | undefined> = {
  [arbitrumSepolia.id]: process.env.NEXT_PUBLIC_ARB_SEPOLIA_RPC || undefined,
  [baseSepolia.id]: process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC || undefined,
};

/**
 * The chains with our RPC URL attached, for Privy. Without this the embedded wallet sends through
 * Privy's default testnet RPC, whose limits fail sends with "Request exceeds defined limit".
 */
export const privyChains: Chain[] = supportedChains.map((c) => {
  const url = rpcUrls[c.id];
  return url ? addRpcUrlOverrideToChain(c, url) : c;
});

/** Whether a chain id is one Dayze runs on */
export function isSupportedChainId(id: number | undefined): id is SupportedChain["id"] {
  return supportedChains.some((c) => c.id === id);
}
