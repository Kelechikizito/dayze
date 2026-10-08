"use client";

import { Badge, Button, ButtonLink } from "@/components/ui";
import { ACP_EXPLAINER, useEnsureACP } from "@/hooks/useEnsureACP";
import { CashOutSection } from "./CashOutSection";
import { CredentialsSection } from "./CredentialsSection";
import { useStreamsOfPayee } from "./hooks";
import { StreamCard } from "./StreamCard";

/** The worker app (11): live pay first, then cash out and income proofs */
export function WorkerApp() {
  const { rows, isLoading } = useStreamsOfPayee(15_000);
  const { hasACP, status, error, ensureACP } = useEnsureACP();

  if (isLoading) return <p className="py-10 text-mid-grey">Loading your pay…</p>;

  if (rows.length === 0) {
    return (
      <div className="flex max-w-xl flex-col gap-4 py-10">
        <h2 className="text-heading-sm">No salary stream yet</h2>
        <p className="text-soft-charcoal">
          Send your wallet address to your employer. Your pay shows up here as soon as they start it.
        </p>
        <div>
          <ButtonLink href="/onboarding/employee">Set up your account</ButtonLink>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-3">
          <Badge ghost>Your pay</Badge>
          <h1 className="text-[44px] leading-[0.97] tracking-[-0.03em] md:text-heading-lg">Paid by the second.</h1>
        </div>
      </header>

      {!hasACP && (
        <div className="flex flex-col gap-4 rounded-3xl border-[1.5px] border-gloss-black p-6 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-1">
            <span className="text-subheading">Your amounts are encrypted</span>
            <span className="text-caption text-soft-charcoal">{ACP_EXPLAINER}</span>
            {error && <span className="text-caption text-soft-charcoal">{error.message}</span>}
          </div>
          <Button onClick={() => void ensureACP().catch(() => undefined)} disabled={status === "signing"}>
            {status === "signing" ? "Waiting for signature…" : "Show my pay"}
          </Button>
        </div>
      )}

      {rows.map((s) => (
        <StreamCard key={String(s.id)} stream={s} unlocked={hasACP} />
      ))}

      <CashOutSection />
      <CredentialsSection streams={rows} />
    </div>
  );
}
