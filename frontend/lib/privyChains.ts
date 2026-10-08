"use client";

import { addRpcUrlOverrideToChain } from "@privy-io/react-auth";
import type { Chain } from "viem";
import { rpcUrls, supportedChains } from "./chains";

/*
 * Client-only: imports Privy's React package, so it lives apart from lib/chains.ts, which server routes use.
 */

/**
 * The chains with our RPC URL attached, for Privy. Without this the embedded wallet sends through
 * Privy's default testnet RPC, whose limits fail sends with "Request exceeds defined limit".
 */
export const privyChains: Chain[] = supportedChains.map((c) => {
  const url = rpcUrls[c.id];
  return url ? addRpcUrlOverrideToChain(c, url) : c;
});

