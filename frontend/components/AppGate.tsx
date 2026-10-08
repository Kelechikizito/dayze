"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useSetActiveWallet } from "@privy-io/wagmi";
import { useState } from "react";
import type { ReactNode } from "react";
import { useSwitchChain } from "wagmi";
import { useDayze } from "@/hooks/useDayze";
import { supportedChains } from "@/lib/chains";
import { deploymentFor } from "@/hooks/useDayze";
import { Button } from "./ui";

/**
 * Renders its children only once there's a logged-in wallet on a chain where Dayze is deployed.
 * Otherwise explains what's missing and offers the one action that fixes it.
 */
export function AppGate({ children }: { children: ReactNode }) {
  const { ready, authenticated, login, connectWallet } = usePrivy();
  const { wallets } = useWallets();
  const { setActiveWallet } = useSetActiveWallet();
  const [activateError, setActivateError] = useState<string>();
  const { account, chainId, d } = useDayze();
  const { switchChain, isPending } = useSwitchChain();

  if (!ready) return <Notice title="Loading…" />;

  if (!authenticated) {
    return (
      <Notice title="Log in to continue" body="Use email, Google or a wallet. New users get a wallet automatically.">
        <Button onClick={login}>Log in</Button>
      </Notice>
    );
  }

  if (!account) {
    // Logged in, but wagmi has no active wallet: usually a locked MetaMask, or one that hasn't approved this site
    return (
      <Notice
        title="Choose a wallet"
        body="You're logged in, but no wallet is active. Unlock your wallet, then pick it here."
      >
        <div className="flex flex-wrap gap-2">
          {wallets.map((w) => (
            <Button
              key={w.address}
              variant="outline"
              onClick={() =>
                setActiveWallet(w)
                  .then(() => setActivateError(undefined))
                  .catch((e: unknown) => setActivateError(e instanceof Error ? e.message : String(e)))
              }
            >
              Use {w.walletClientType === "privy" ? "embedded wallet" : w.walletClientType} {w.address.slice(0, 6)}…
              {w.address.slice(-4)}
            </Button>
          ))}
          <Button onClick={() => connectWallet()}>Connect a wallet</Button>
        </div>
        {activateError && <p className="text-caption text-soft-charcoal">Couldn&apos;t switch: {activateError}</p>}
      </Notice>
    );
  }

  if (!d) {
    const deployed = supportedChains.filter((c) => deploymentFor(c.id));
    return (
      <Notice
        title="Dayze isn't on this network yet"
        body={`Your wallet is on chain ${chainId}. Switch to a network where Dayze is deployed.`}
      >
        <div className="flex flex-wrap gap-2">
          {deployed.map((c) => (
            <Button key={c.id} variant="outline" disabled={isPending} onClick={() => switchChain({ chainId: c.id })}>
              Switch to {c.name}
            </Button>
          ))}
        </div>
      </Notice>
    );
  }

  return <>{children}</>;
}

function Notice({ title, body, children }: { title: string; body?: string; children?: ReactNode }) {
  return (
    <div className="flex max-w-xl flex-col gap-4 py-10">
      <h2 className="text-heading-sm">{title}</h2>
      {body && <p className="text-soft-charcoal">{body}</p>}
      {children}
    </div>
  );
}
