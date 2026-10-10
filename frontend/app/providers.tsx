"use client";

import { CofheProvider, createCofheConfig } from "@cofhe/react";
import { baseSepolia as cofheBaseSepolia } from "@cofhe/sdk/chains";
import { PrivyProvider, usePrivy, useWallets } from "@privy-io/react-auth";
import { WagmiProvider, createConfig, useSetActiveWallet } from "@privy-io/wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { http, useAccount, usePublicClient, useWalletClient } from "wagmi";
import { defaultChain, rpcUrls, supportedChains } from "@/lib/chains";
import { privyChains } from "@/lib/privyChains";

/*
 * Order matters: Privy → React Query → wagmi → CoFHE.
 * `createConfig` and `WagmiProvider` come from @privy-io/wagmi, not wagmi, so the
 * wallet Privy logs in with becomes wagmi's active account.
 */

const wagmiConfig = createConfig({
  chains: supportedChains,
  transports: {
    [supportedChains[0].id]: http(rpcUrls[supportedChains[0].id]),
  },
  ssr: true,
});

const cofheConfig = createCofheConfig({
  supportedChains: [cofheBaseSepolia],
});

/**
 * Makes sure wagmi has an active wallet once Privy is logged in.
 * With an injected wallet (MetaMask) present next to the embedded one, @privy-io/wagmi can leave
 * wagmi with no account. Prefer the embedded wallet: it's the one Dayze created for this user.
 */
function ActiveWalletSync() {
  const { authenticated } = usePrivy();
  const { wallets, ready } = useWallets();
  const { address } = useAccount();
  const { setActiveWallet } = useSetActiveWallet();

  useEffect(() => {
    if (!authenticated || !ready || address || wallets.length === 0) return;
    const preferred = wallets.find((w) => w.walletClientType === "privy") ?? wallets[0];
    // An injected wallet that's locked or hasn't approved this site rejects here; AppGate then offers a retry
    setActiveWallet(preferred).catch((e) => console.warn("[dayze] couldn't activate wallet", preferred.address, e));
  }, [authenticated, ready, address, wallets, setActiveWallet]);

  return null;
}

/** Hands wagmi's current clients to CoFHE, which reconnects whenever the wallet or chain changes */
function CofheBridge({ children, queryClient }: { children: ReactNode; queryClient: QueryClient }) {
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  return (
    <CofheProvider
      config={cofheConfig}
      queryClient={queryClient}
      publicClient={publicClient}
      walletClient={walletClient ?? undefined}
    >
      {children}
    </CofheProvider>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  if (!appId) {
    return <MissingPrivyAppId />;
  }

  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["email", "google", "wallet"],
        defaultChain: privyChains.find((c) => c.id === defaultChain.id) ?? defaultChain,
        supportedChains: privyChains,
        embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" } },
        appearance: { theme: "light", accentColor: "#17150e" },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>
          <ActiveWalletSync />
          <CofheBridge queryClient={queryClient}>{children}</CofheBridge>
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}

/** Shown in development when the Privy App ID isn't configured */
function MissingPrivyAppId() {
  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 px-6">
      <h1 className="text-heading">Privy isn&apos;t configured</h1>
      <p className="text-soft-charcoal">
        Add <code>NEXT_PUBLIC_PRIVY_APP_ID</code> to <code>frontend/.env.local</code> and restart <code>npm run dev</code>.
        The App ID is public. Never prefix the App Secret with <code>NEXT_PUBLIC_</code>.
      </p>
    </div>
  );
}
