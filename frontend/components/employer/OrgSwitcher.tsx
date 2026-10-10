"use client";

import { useCreateWallet, useWallets, type ConnectedWallet } from "@privy-io/react-auth";
import { useSetActiveWallet } from "@privy-io/wagmi";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { parseEther, type Address } from "viem";
import { useBalance, usePublicClient, useReadContracts, useSendTransaction } from "wagmi";
import { PillPicker } from "@/components/forms";
import { Button } from "@/components/ui";
import { useDayze } from "@/hooks/useDayze";
import { shortError, useGasSponsored } from "@/hooks/useTx";
import { DayzePayrollAbi } from "@/lib/contracts/abis";

/** Gas sent from the current org's wallet to a new org's wallet, when the current one can spare it */
const GAS_TOP_UP = parseEther("0.003");
const GAS_KEEP = parseEther("0.001");

/**
 * Every org this login owns. The contracts allow one org per address, so each org lives in its own wallet:
 * Privy gives one login several embedded wallets. Returns each wallet with its org name, if it has one.
 */
export function useMyOrgs() {
  const { d } = useDayze();
  const { wallets, ready } = useWallets();
  const { data, isLoading, refetch } = useReadContracts({
    contracts: wallets.map((w) => ({
      address: d?.payroll,
      abi: DayzePayrollAbi,
      functionName: "orgOf",
      args: [w.address as Address],
    })),
    query: { enabled: !!d && ready && wallets.length > 0 },
  });
  const entries = wallets.map((wallet, i) => {
    const org = data?.[i]?.result as { name: string; exists: boolean } | undefined;
    return { wallet, name: org?.exists ? org.name : undefined };
  });
  return { entries, isLoading: !ready || isLoading, refetch };
}

/**
 * Org picker for the employer console, plus "New org". A new org gets a new embedded wallet under the
 * same login, a little gas from the current wallet if Privy doesn't sponsor it, and then the onboarding wizard.
 */
export function OrgSwitcher() {
  const router = useRouter();
  const { account } = useDayze();
  const publicClient = usePublicClient();
  const { entries } = useMyOrgs();
  const { setActiveWallet } = useSetActiveWallet();
  const { createWallet } = useCreateWallet();
  const { sendTransactionAsync } = useSendTransaction();
  const balance = useBalance({ address: account });
  const sponsored = useGasSponsored();
  const [status, setStatus] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  // A wallet just created: it shows up in useWallets a moment later
  const pending = useRef<Address>(undefined);

  const orgs = entries.filter((e) => e.name);
  const activeOrg = orgs.find((e) => e.wallet.address.toLowerCase() === account?.toLowerCase());

  const switchTo = async (wallet: ConnectedWallet) => {
    setError(undefined);
    try {
      await setActiveWallet(wallet);
    } catch (e) {
      setError(shortError(e));
    }
  };

  const startOnboarding = useCallback(
    (wallet: ConnectedWallet) =>
      setActiveWallet(wallet)
        .then(() => router.push("/onboarding/employer"))
        .catch((e: unknown) => {
          setError(shortError(e));
          setBusy(false);
        }),
    [setActiveWallet, router],
  );

  // Once a just-created wallet is connected: switch to it and start onboarding
  useEffect(() => {
    const address = pending.current;
    if (!address) return;
    const wallet = entries.find((e) => e.wallet.address.toLowerCase() === address.toLowerCase())?.wallet;
    if (!wallet) return;
    pending.current = undefined;
    void startOnboarding(wallet);
  }, [entries, startOnboarding]);

  const newOrg = async () => {
    setError(undefined);
    setBusy(true);
    try {
      // Reuse an embedded wallet left without an org (an abandoned setup) before creating another
      const spare = entries.find((e) => !e.name && e.wallet.walletClientType === "privy")?.wallet;
      let address: Address;
      if (spare) address = spare.address as Address;
      else {
        setStatus("Creating a wallet for the new org…");
        const hasEmbedded = entries.some((e) => e.wallet.walletClientType === "privy");
        address = (await createWallet({ createAdditional: hasEmbedded })).address as Address;
      }

      // New wallets start with 0 ETH. Unless Privy sponsors gas, send some from this org's wallet if it can spare it.
      const current = balance.data?.value ?? BigInt(0);
      if (!sponsored && publicClient && account && current >= GAS_TOP_UP + GAS_KEEP) {
        const have = await publicClient.getBalance({ address });
        if (have < GAS_TOP_UP / BigInt(2)) {
          setStatus("Sending 0.003 ETH for gas to the new org's wallet. Approve it in your wallet.");
          const gasPrice = await publicClient.getGasPrice();
          const hash = await sendTransactionAsync({
            to: address,
            value: GAS_TOP_UP,
            type: "legacy",
            gasPrice: (gasPrice * BigInt(5)) / BigInt(4),
          });
          await publicClient.waitForTransactionReceipt({ hash });
        }
      }

      setStatus("Switching to the new org…");
      if (spare) void startOnboarding(spare);
      else pending.current = address;
    } catch (e) {
      console.error("[dayze] new org failed", e);
      setError(shortError(e));
      setStatus(undefined);
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        {(orgs.length > 1 || (orgs.length > 0 && !activeOrg)) && (
          <PillPicker
            options={orgs.map((o) => ({ value: o.wallet.address, label: o.name! }))}
            value={activeOrg?.wallet.address ?? ""}
            onChange={(address) => {
              const target = orgs.find((o) => o.wallet.address === address);
              if (target) void switchTo(target.wallet);
            }}
          />
        )}
        <Button variant="outline" className="!px-4 !py-2 text-caption" disabled={busy} onClick={() => void newOrg()}>
          + New org
        </Button>
      </div>
      {busy && status && <p className="text-caption text-soft-charcoal">{status}</p>}
      {error && <p className="text-caption text-soft-charcoal">Something went wrong: {error}</p>}
    </div>
  );
}
