"use client";

import { useCofheClient, useCofheConnection } from "@cofhe/react";
import { useCreateWallet, usePrivy, useWallets } from "@privy-io/react-auth";
import { useState } from "react";
import type { Address, Hex } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { Badge, Button, Section } from "@/components/ui";
import { ACP_EXPLAINER, useEnsureACP } from "@/hooks/useEnsureACP";
import { ConfidentialTokenAbi } from "@/lib/contracts/abis";
import { encryptUint64, isUnsetHandle, unsealUint64 } from "@/lib/fhe";
import { formatConfidential, tokensFor } from "@/lib/tokens";

/**
 * Checkpoint 09 checks: CoFHE connection, ACP signature, encrypt 42, unseal a confidential balance.
 * Not linked from the app. Delete it before the demo or keep it behind this URL.
 */
export default function DebugPage() {
  const { authenticated, user } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const { createWallet } = useCreateWallet();
  const hasEmbedded = wallets.some((w) => w.walletClientType === "privy");
  const { address, chainId } = useAccount();
  const publicClient = usePublicClient();
  const client = useCofheClient();
  const connection = useCofheConnection();
  const { hasACP, status: acpStatus, error: acpError, ensureACP } = useEnsureACP();
  const [log, setLog] = useState<string[]>([]);
  const tokens = tokensFor(chainId);

  const append = (line: string) => setLog((l) => [...l, line]);

  const run = async (label: string, fn: () => Promise<string>) => {
    append(`→ ${label}`);
    try {
      append(`  ${await fn()}`);
    } catch (e) {
      append(`  error: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const encrypt42 = () =>
    run("encrypt 42", async () => {
      // The handle only works in the consuming contract. Without a deployment, bind it to your own address.
      const consumer = (tokens[0]?.wrapper ?? address) as Address;
      const { handle, proof } = await encryptUint64(client, BigInt(42), consumer);
      console.log("[dayze] encrypt 42", { handle, proof });
      return `handle ${handle.slice(0, 18)}…, proof ${proof.length / 2 - 1} bytes (full values in the console)`;
    });

  const unsealBalance = (wrapper: Address, symbol: string) =>
    run(`unseal ${symbol} balance`, async () => {
      await ensureACP();
      const handle = (await publicClient!.readContract({
        address: wrapper,
        abi: ConfidentialTokenAbi,
        functionName: "confidentialBalanceOf",
        args: [address!],
      })) as Hex;
      if (isUnsetHandle(handle)) return `no ${symbol} balance yet (shield some first)`;
      return `${formatConfidential(await unsealUint64(client, handle))} ${symbol}`;
    });

  return (
    <>
      <SiteHeader />
      <Section tone="tint" className="flex-1">
        <div className="flex max-w-3xl flex-col gap-8">
          <Badge ghost>Checkpoint 09 · debug</Badge>
          <h1 className="text-heading">Wallet and FHE checks</h1>

          <dl className="grid grid-cols-[160px_1fr] gap-y-3 border-t-[1.5px] border-gloss-black pt-6">
            <dt className="text-mid-grey">Logged in</dt>
            <dd>{authenticated ? "yes" : "no"}</dd>
            <dt className="text-mid-grey">Privy wallets</dt>
            <dd className="break-all">
              {!walletsReady
                ? "loading…"
                : wallets.length
                  ? wallets.map((w) => `${w.walletClientType} ${w.address.slice(0, 10)}…`).join(", ")
                  : `none (linked: ${user?.linkedAccounts.map((a) => a.type).join(", ") ?? "—"})`}
            </dd>
            <dt className="text-mid-grey">wagmi wallet</dt>
            <dd className="break-all">{address ?? "—"}</dd>
            <dt className="text-mid-grey">Chain</dt>
            <dd>{chainId ?? "—"}</dd>
            <dt className="text-mid-grey">CoFHE</dt>
            <dd>{connection.connected ? "connected" : connection.connecting ? "connecting…" : "not connected"}</dd>
            <dt className="text-mid-grey">ACP</dt>
            <dd>
              {hasACP ? "ready" : acpStatus}
              {acpError ? ` (${acpError.message})` : ""}
            </dd>
            <dt className="text-mid-grey">Dayze deployed</dt>
            <dd>{tokens.length ? "yes" : "not on this chain yet"}</dd>
          </dl>

          <div className="flex flex-col gap-3">
            <p className="text-caption text-soft-charcoal">{ACP_EXPLAINER}</p>
            <div className="flex flex-wrap gap-3">
              {authenticated && walletsReady && !hasEmbedded && (
                <Button variant="outline" onClick={() => run("create embedded wallet", async () => (await createWallet()).address)}>
                  Create embedded wallet
                </Button>
              )}
              <Button variant="outline" disabled={!connection.connected} onClick={() => run("create ACP", async () => (await ensureACP(), "ACP ready"))}>
                Create ACP
              </Button>
              <Button variant="dark" disabled={!connection.connected} onClick={encrypt42}>
                Encrypt 42
              </Button>
              {tokens.map((t) => (
                <Button key={t.key} variant="outline" disabled={!connection.connected} onClick={() => unsealBalance(t.wrapper, t.symbol)}>
                  Unseal {t.symbol}
                </Button>
              ))}
            </div>
          </div>

          <pre className="min-h-32 overflow-x-auto rounded-lg bg-gloss-black p-6 font-mono text-caption whitespace-pre-wrap text-gloss-white">
            {log.length ? log.join("\n") : "Output appears here."}
          </pre>
        </div>
      </Section>
      <SiteFooter />
    </>
  );
}
