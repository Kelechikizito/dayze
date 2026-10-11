"use client";

import { useCofheClient } from "@cofhe/react";
import { usePrivy } from "@privy-io/react-auth";
import { useEffect, useState } from "react";
import type { Address, Hex } from "viem";
import { useReadContract } from "wagmi";
import { shortAddress } from "@/components/AuthButton";
import { Stat } from "@/components/forms";
import { Badge, Button } from "@/components/ui";
import { deploymentFor, useDayze } from "@/hooks/useDayze";
import { useEnsureACP } from "@/hooks/useEnsureACP";
import { shortError } from "@/hooks/useTx";
import { defaultChain } from "@/lib/chains";
import { DayzePayrollAbi, IncomeCredentialAbi } from "@/lib/contracts/abis";
import { unsealBool } from "@/lib/fhe";
import { formatConfidential, tokensFor } from "@/lib/tokens";

type Credential = {
  payee: Address;
  payer: Address;
  verifier: Address;
  token: Address;
  streamId: bigint;
  threshold: bigint;
  issuedAt: bigint;
  expiresAt: bigint;
  streamActiveSince: bigint;
  revoked: boolean;
  payeeIsHuman: boolean;
  ok: Hex;
};

/** Seconds since the epoch, ticking every second */
function useNow() {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function formatCountdown(seconds: number) {
  if (seconds <= 0) return "now";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`;
}

const formatTime = (t: bigint) => new Date(Number(t) * 1000).toLocaleString();

/**
 * A landlord's view of one income credential (12 A). Everything here but the answer is public, so it reads
 * with no wallet. The answer is an encrypted bit only the named verifier can decrypt.
 */
export function CredentialView({ id }: { id: string }) {
  // Reads go to Dayze's chain even before anyone logs in
  const chainId = defaultChain.id;
  const d = deploymentFor(chainId);
  const validId = /^\d+$/.test(id);
  const credId = validId ? BigInt(id) : BigInt(0);
  const now = useNow();

  const cred = useReadContract({
    chainId,
    address: d?.incomeCredential,
    abi: IncomeCredentialAbi,
    functionName: "get",
    args: [credId],
    query: { enabled: validId && !!d, refetchInterval: 10_000 },
  });
  const c = cred.data as Credential | undefined;
  const org = useReadContract({
    chainId,
    address: d?.payroll,
    abi: DayzePayrollAbi,
    functionName: "orgOf",
    args: c ? [c.payer] : undefined,
    query: { enabled: !!c && !!d },
  });

  if (!d) return <p className="text-soft-charcoal">Dayze isn&apos;t deployed on this network.</p>;
  if (!validId) return <p className="text-soft-charcoal">That isn&apos;t a credential number.</p>;
  if (cred.isLoading) return <p className="text-mid-grey">Loading credential #{id}…</p>;
  if (!c || c.payee === "0x0000000000000000000000000000000000000000") {
    return <p className="text-soft-charcoal">Credential #{id} doesn&apos;t exist.</p>;
  }

  const token = tokensFor(chainId).find((t) => t.wrapper.toLowerCase() === c.token.toLowerCase());
  const unit = token?.underlyingSymbol ?? "tokens";
  // Computed in the browser, so the banner flips to Expired live with no reload
  const status: "valid" | "expired" | "revoked" = c.revoked ? "revoked" : now >= Number(c.expiresAt) ? "expired" : "valid";
  const orgName = (org.data as { name: string; exists: boolean } | undefined)?.name;

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-4">
        <Badge ghost>Income credential #{id}</Badge>
        <h1 className="text-[44px] leading-[0.97] tracking-[-0.03em] md:text-heading-lg">
          Earns at least {formatConfidential(c.threshold)} {unit} a month?
        </h1>
      </div>

      <StatusBanner status={status} secondsLeft={Number(c.expiresAt) - now} />

      <div>
        <Stat label="Paid by">{orgName ?? shortAddress(c.payer)}</Stat>
        <Stat label="Salary stream active since">{c.streamActiveSince > BigInt(0) ? formatTime(c.streamActiveSince) : "not active"}</Stat>
        <Stat label="Issued">{formatTime(c.issuedAt)}</Stat>
        <Stat label="Expires">{formatTime(c.expiresAt)}</Stat>
        <Stat label="Issued to">{shortAddress(c.verifier)}</Stat>
        <Stat label="Issuer">
          {c.payeeIsHuman ? "✓ Issued by a verified human (World ID)" : <span className="text-soft-charcoal">Issuer not verified as a unique human</span>}
        </Stat>
      </div>

      {status === "valid" && <Reveal credential={c} />}

      <p className="text-caption text-soft-charcoal">
        You learn one fact: whether this income meets your threshold. Not the salary.
      </p>
    </div>
  );
}

function StatusBanner({ status, secondsLeft }: { status: "valid" | "expired" | "revoked"; secondsLeft: number }) {
  const styles = {
    valid: "bg-gloss-black text-gloss-white",
    expired: "border-[1.5px] border-gloss-black text-gloss-black",
    revoked: "border-[1.5px] border-gloss-black text-gloss-black",
  };
  const text = {
    valid: `Valid · expires in ${formatCountdown(secondsLeft)}`,
    expired: "Expired. Ask for a new one if you still need it.",
    revoked: "Revoked by the person who issued it.",
  };
  return (
    <div className={`rounded-2xl px-6 py-5 text-subheading ${styles[status]}`} role="status" aria-live="polite">
      {text[status]}
    </div>
  );
}

/** Sign in as the verifier, then decrypt the one bit */
function Reveal({ credential: c }: { credential: Credential }) {
  const { ready, authenticated, login } = usePrivy();
  const { account, chainId } = useDayze();
  const client = useCofheClient();
  const { ensureACP } = useEnsureACP();
  const [state, setState] = useState<{ loading?: boolean; ok?: boolean; error?: string }>({});

  if (!ready) return null;
  if (!authenticated) {
    return (
      <div className="flex flex-col gap-3">
        <p>Was this sent to you? Sign in with the account it was issued to.</p>
        <div>
          <Button onClick={login}>Sign in to reveal</Button>
        </div>
      </div>
    );
  }
  if (!account) return <p className="text-soft-charcoal">Connecting your wallet…</p>;
  if (account.toLowerCase() !== c.verifier.toLowerCase()) {
    return (
      <p className="text-soft-charcoal">
        This credential was issued to {shortAddress(c.verifier)}. You&apos;re signed in as {shortAddress(account)}.
      </p>
    );
  }
  if (chainId !== defaultChain.id) return <p className="text-soft-charcoal">Switch your wallet to {defaultChain.name} to reveal.</p>;

  if (state.ok !== undefined) {
    return (
      <div className="flex items-center gap-6 rounded-2xl bg-pure-white p-8">
        <span className="text-[80px] leading-none">{state.ok ? "✅" : "❌"}</span>
        <p className="text-heading-sm">{state.ok ? "Yes, it meets your threshold." : "No, it's below your threshold."}</p>
      </div>
    );
  }

  const reveal = async () => {
    setState({ loading: true });
    try {
      await ensureACP();
      setState({ ok: await unsealBool(client, c.ok) });
    } catch (e) {
      setState({ error: shortError(e) });
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div>
        <Button onClick={() => void reveal()} disabled={state.loading}>
          {state.loading ? "Decrypting…" : "Reveal result"}
        </Button>
      </div>
      <p className="text-caption text-soft-charcoal">One signature, no gas. The answer is decrypted in your browser.</p>
      {state.error && <p className="text-caption text-soft-charcoal">Couldn&apos;t decrypt: {state.error}</p>}
    </div>
  );
}
