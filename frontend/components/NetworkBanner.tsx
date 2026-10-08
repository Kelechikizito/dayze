"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useAccount, useSwitchChain } from "wagmi";
import { isSupportedChainId, supportedChains } from "@/lib/chains";

/**
 * Wrong-network prompt. Shows only when a logged-in user's wallet is on a chain Dayze doesn't run on.
 * An injected wallet (MetaMask) can connect to wagmi without a Privy login, so check both.
 */
export function NetworkBanner() {
  const { authenticated } = usePrivy();
  const { isConnected, chainId } = useAccount();
  const { switchChain, isPending } = useSwitchChain();

  if (!authenticated || !isConnected || isSupportedChainId(chainId)) return null;

  return (
    <div className="bg-gloss-black py-3 text-caption text-gloss-white">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-3 px-6">
        <span>Your wallet is on a network Dayze doesn&apos;t support. Switch to continue.</span>
        <div className="flex gap-2">
          {supportedChains.map((c) => (
            <button
              key={c.id}
              disabled={isPending}
              onClick={() => switchChain({ chainId: c.id })}
              className="rounded-pill border-[1.5px] border-pure-white px-4 py-1 hover:bg-pure-white/10 disabled:opacity-50"
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
