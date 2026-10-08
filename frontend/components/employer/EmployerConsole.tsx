"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Badge, ButtonLink } from "@/components/ui";
import { useDayze } from "@/hooks/useDayze";
import { ApprovalsSection } from "./ApprovalsSection";
import { AuditorsSection, useAuditors } from "./AuditorsSection";
import { useSkippedSteps } from "./EmployerOnboarding";
import { FundSection } from "./FundSection";
import { useOrg } from "./OrgSection";
import { PolicySection, usePolicy } from "./PolicySection";
import { StreamsSection, inviteCopied } from "./StreamsSection";

/**
 * The employer dashboard (10): streams first, then approvals, vault, rules and auditors.
 * @param payee From a worker's "pay me" link: pre-fills New stream and scrolls to it
 */
export function EmployerConsole({ payee }: { payee?: string }) {
  const { account } = useDayze();
  const { org, exists, isLoading } = useOrg();
  const { hasPolicy } = usePolicy();
  const auditors = useAuditors();
  const { skipped } = useSkippedSteps();

  // From a pay-me link: the form renders after the wallet check, so the #streams jump needs a nudge
  useEffect(() => {
    if (payee && exists) document.getElementById("streams")?.scrollIntoView({ behavior: "smooth" });
  }, [payee, exists]);

  if (isLoading) return <p className="py-10 text-mid-grey">Loading your organisation…</p>;

  if (!exists) {
    return (
      <div className="flex max-w-xl flex-col gap-4 py-10">
        <h2 className="text-heading-sm">No organisation yet</h2>
        <p className="text-soft-charcoal">Set up your payroll first. It takes a few minutes.</p>
        <div>
          <ButtonLink href="/onboarding/employer">Start setup</ButtonLink>
        </div>
      </div>
    );
  }

  // Optional steps still open: the "Finish setup" card
  const todo = [
    !hasPolicy && { label: "Set approval rules", href: "#policy", skipped: skipped.has("policy") },
    auditors.length === 0 && { label: "Add an auditor", href: "#auditors", skipped: skipped.has("auditor") },
    !inviteCopied(account) && { label: "Invite your first employee", href: "#streams", skipped: skipped.has("invite") },
  ].filter(Boolean) as { label: string; href: string; skipped: boolean }[];

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-3">
          <Badge ghost>Employer console</Badge>
          <h1 className="text-[44px] leading-[0.97] tracking-[-0.03em] md:text-heading-lg">{org?.name}</h1>
        </div>
        <Badge>Private payroll</Badge>
      </header>

      {todo.length > 0 && (
        <div className="flex flex-col gap-3 rounded-2xl border-[1.5px] border-gloss-black p-6">
          <h2 className="text-subheading">Finish setup</h2>
          <ul className="flex flex-wrap gap-3">
            {todo.map((t) => (
              <li key={t.label}>
                <Link href={t.href} className="inline-flex rounded-pill border-[1.5px] border-gloss-black px-4 py-2 text-caption hover:bg-gloss-white">
                  {t.label}
                  {t.skipped ? " (skipped)" : ""} →
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div id="streams">
        <StreamsSection initialPayee={payee} />
      </div>
      <ApprovalsSection />
      <div id="vault">
        <FundSection />
      </div>
      <div id="policy">
        <PolicySection />
      </div>
      <div id="auditors">
        <AuditorsSection />
      </div>
    </div>
  );
}
