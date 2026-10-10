"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { OnboardingWizard, StepIcon, type WizardStep } from "@/components/OnboardingWizard";
import type { StepStatus } from "@/components/Stepper";
import { Button } from "@/components/ui";
import { useDayze } from "@/hooks/useDayze";
import { markOnboarded } from "@/lib/routing";
import { AuditorsSection, useAuditors } from "./AuditorsSection";
import { FundSection, useHasFundedVault } from "./FundSection";
import { OrgSection, useOrg } from "./OrgSection";
import { PolicySection, usePolicy } from "./PolicySection";
import { InviteLink, inviteCopied } from "./StreamsSection";

type StepKey = "org" | "fund" | "policy" | "auditor" | "invite";

const skipKey = (account: string, step: StepKey) => `dayze:skipped:employer:${account.toLowerCase()}:${step}`;

function readSkipped(account: string | undefined): Set<StepKey> {
  const out = new Set<StepKey>();
  if (!account) return out;
  try {
    for (const s of ["policy", "auditor", "invite"] as StepKey[]) if (localStorage.getItem(skipKey(account, s)) === "1") out.add(s);
  } catch {}
  return out;
}

/** Which optional steps the employer skipped during onboarding (UX hint, per wallet) */
export function useSkippedSteps() {
  const { account } = useDayze();
  const [skipped, setSkipped] = useState(() => readSkipped(account));
  const skip = (step: StepKey) => {
    if (!account) return;
    try {
      localStorage.setItem(skipKey(account, step), "1");
    } catch {}
    setSkipped(new Set([...skipped, step]));
  };
  return { skipped, skip };
}

/**
 * The employer onboarding stepper (10 §0). Every "done" comes from the chain, so a refresh
 * resumes at the right step. Only the invite step's "done" is local: copying a link isn't onchain.
 */
export function EmployerOnboarding() {
  const router = useRouter();
  const { account } = useDayze();
  const { exists: hasOrg, isLoading } = useOrg();
  const funded = useHasFundedVault();
  const { hasPolicy } = usePolicy();
  const auditors = useAuditors();
  const { skipped, skip } = useSkippedSteps();
  const [copied, setCopied] = useState(() => inviteCopied(account));

  const done: Record<StepKey, boolean> = {
    org: hasOrg,
    fund: funded,
    policy: hasPolicy,
    auditor: auditors.length > 0,
    invite: copied,
  };
  const order: StepKey[] = ["org", "fund", "policy", "auditor", "invite"];
  const activeKey = order.find((k) => !done[k] && !skipped.has(k));
  const statusOf = (k: StepKey): StepStatus =>
    done[k] ? "done" : skipped.has(k) ? "skipped" : k === activeKey ? "active" : "todo";

  const steps: WizardStep[] = [
    {
      key: "signin",
      title: "Sign in",
      help: "Your wallet is your login. Nobody else can act for your organisation.",
      bullets: ["Email, Google or an existing wallet", "New users get a wallet automatically"],
      icon: <StepIcon name="key" />,
      status: "done",
    },
    {
      key: "org",
      title: "Create your organisation",
      help: "A name for your payroll. It shows on the income credentials your employees issue.",
      bullets: ["The name is public", "Salaries never are"],
      icon: <StepIcon name="org" />,
      status: statusOf("org"),
      content: <OrgSection />,
    },
    {
      key: "fund",
      title: "Add funds",
      help: "Shield tokens and move them into your private payroll vault.",
      bullets: ["Shielding is a public deposit", "The vault balance is encrypted", "cUSDC, cARB or cETH"],
      icon: <StepIcon name="vault" />,
      status: statusOf("fund"),
      content: <FundSection />,
    },
    {
      key: "policy",
      title: "Set approval rules",
      help: "Salaries above a hidden limit wait for k of your n approvers before they start paying.",
      bullets: ["Up to 10 approvers", "One encrypted limit per token", "Nobody sees the limit, not even approvers"],
      icon: <StepIcon name="rules" />,
      status: statusOf("policy"),
      content: <PolicySection />,
      onSkip: () => skip("policy"),
    },
    {
      key: "auditor",
      title: "Add an auditor",
      help: "Someone you trust to read the books: every salary, vault balance and withdrawal from now on.",
      bullets: ["Optional", "Remove them any time", "Removal only stops access to new data"],
      icon: <StepIcon name="eye" />,
      status: statusOf("auditor"),
      content: <AuditorsSection />,
      onSkip: () => skip("auditor"),
    },
    {
      key: "invite",
      title: "Invite your first employee",
      help: "Send them this link. They sign up, verify they're human, and ask you to pay them. They'll appear under Join requests in your console.",
      bullets: ["The link holds only your org address", "No salary, no secret", "No wallet addresses to copy"],
      icon: <StepIcon name="invite" />,
      status: statusOf("invite"),
      content: <InviteLink onCopied={() => setCopied(true)} />,
      onSkip: () => skip("invite"),
    },
  ];

  const finished = !isLoading && hasOrg && funded && !activeKey;

  return (
    <OnboardingWizard
      steps={steps}
      footer={
        finished && (
        <div className="flex flex-col gap-4 rounded-2xl bg-gloss-black p-8 text-gloss-white">
          <h2 className="text-heading-sm">Your payroll is set up.</h2>
          <p className="text-gloss-white/80">Create your first salary stream from the console.</p>
          <div>
            <Button
              variant="light"
              onClick={() => {
                markOnboarded("employer");
                router.push("/employer");
              }}
            >
              Go to the console →
            </Button>
          </div>
        </div>
        )
      }
    />
  );
}
