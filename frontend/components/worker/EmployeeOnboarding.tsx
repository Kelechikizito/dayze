"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import QRCode from "react-qr-code";
import { isAddress, type Address } from "viem";
import { OnboardingWizard, StepIcon, type WizardStep } from "@/components/OnboardingWizard";
import type { StepStatus } from "@/components/Stepper";
import { Button } from "@/components/ui";
import { useDayze } from "@/hooks/useDayze";
import { ACP_EXPLAINER, useEnsureACP } from "@/hooks/useEnsureACP";
import { markOnboarded } from "@/lib/routing";
import { useOrgName, useStreamsOfPayee } from "./hooks";
import { RequestPay, useHasRequested } from "./RequestPay";
import { WorldIdVerify, useIsHuman } from "./WorldIdVerify";

const localFlag = (account: string, name: string) => `dayze:employee:${account.toLowerCase()}:${name}`;

function readFlag(account: string | undefined, name: string) {
  if (!account) return false;
  try {
    return localStorage.getItem(localFlag(account, name)) === "1";
  } catch {
    return false;
  }
}

function writeFlag(account: string | undefined, name: string) {
  if (!account) return;
  try {
    localStorage.setItem(localFlag(account, name), "1");
  } catch {}
}

/**
 * Employee onboarding (11 §0), opened from the employer's invite link.
 * Chain reads decide each step; the "address shared" step and skips are local UX hints.
 */
export function EmployeeOnboarding({ org }: { org?: string }) {
  const router = useRouter();
  const { account } = useDayze();
  const orgAddress = org && isAddress(org) ? (org as Address) : undefined;
  const orgName = useOrgName(orgAddress);
  const isHuman = useIsHuman();
  const requested = useHasRequested(orgAddress);
  const { hasACP, status: acpStatus, error: acpError, ensureACP } = useEnsureACP();
  const { count } = useStreamsOfPayee(10_000);
  const [skippedHuman, setSkippedHuman] = useState(() => readFlag(account, "skip-human"));
  const [shared, setShared] = useState(() => readFlag(account, "shared-address"));

  // A stream exists: onboarding is over
  useEffect(() => {
    if (count > 0) {
      markOnboarded("employee");
      router.push("/worker");
    }
  }, [count, router]);

  const done = { human: isHuman, acp: hasACP, address: requested || shared };
  const order = ["human", "acp", "address", "wait"] as const;
  const activeKey = order.find((k) => (k === "wait" ? true : !done[k] && !(k === "human" && skippedHuman)));
  const statusOf = (k: (typeof order)[number]): StepStatus =>
    k !== "wait" && done[k] ? "done" : k === "human" && skippedHuman ? "skipped" : k === activeKey ? "active" : "todo";

  const steps: WizardStep[] = [
    {
      key: "signin",
      title: "Sign in",
      help: orgName ? `${orgName} invited you to get paid with Dayze.` : "You're signed in. Your wallet was created for you.",
      icon: <StepIcon name="key" />,
      status: "done",
    },
    {
      key: "human",
      title: "Verify you're human",
      help: "Optional. A quick World ID Selfie Check proves you're a real person without sharing who you are. Landlords will see it on your income proofs.",
      bullets: ["Selfie Check in World App, no Orb needed", "Once, and permanent: no repeat checks", "Your face and name never leave World App"],
      icon: <StepIcon name="human" />,
      status: statusOf("human"),
      content: <WorldIdVerify />,
      onSkip: () => {
        writeFlag(account, "skip-human");
        setSkippedHuman(true);
      },
    },
    {
      key: "acp",
      title: "Unlock your private data",
      help: "Your salary is encrypted. One signature lets this browser decrypt what's yours.",
      bullets: ["A signature, not a transaction", "No gas, nothing sent onchain"],
      icon: <StepIcon name="eye" />,
      status: statusOf("acp"),
      content: (
        <div className="flex flex-col gap-3">
          <p className="text-caption text-soft-charcoal">{ACP_EXPLAINER}</p>
          <div>
            <Button onClick={() => void ensureACP().catch(() => undefined)} disabled={acpStatus === "signing"}>
              {acpStatus === "signing" ? "Waiting for signature…" : "Unlock"}
            </Button>
          </div>
          {acpError && <p className="text-caption text-soft-charcoal">{acpError.message}</p>}
        </div>
      ),
    },
    {
      key: "address",
      title: orgName ? `Ask ${orgName} to pay you` : "Ask your employer to pay you",
      help: "One tap puts you in your employer's console. They set your salary there. No addresses to copy.",
      bullets: ["Your employer sees your wallet and your ✓ human badge", "They set your salary from their console"],
      icon: <StepIcon name="wallet" />,
      status: statusOf("address"),
      content: account && (
        <div className="flex flex-col gap-6">
          <RequestPay employer={orgAddress} employerName={orgName} />
          <details className="group">
            <summary className="cursor-pointer text-caption text-soft-charcoal underline underline-offset-4">
              Other ways: a pay-me link or your address
            </summary>
            <div className="pt-4">
              <AddressShare
                address={account}
                onShared={() => {
                  writeFlag(account, "shared-address");
                  setShared(true);
                }}
              />
            </div>
          </details>
        </div>
      ),
    },
    {
      key: "wait",
      title: "Wait for your first stream",
      help: "As soon as your employer starts your salary, this page moves on by itself.",
      bullets: ["Checking every 10 seconds", "Your pay starts accruing the moment it's active"],
      icon: <StepIcon name="vault" />,
      status: count > 0 ? "done" : statusOf("wait"),
      content: (
        <p className="flex items-center gap-3 text-caption">
          <span className="pulse-dot inline-block h-2 w-2 rounded-full bg-gloss-black" />
          Waiting for {orgName ?? "your employer"}…
        </p>
      ),
    },
  ];

  return <OnboardingWizard steps={steps} />;
}

/** The worker's address, big, with copy, a QR code, and a "pay me" link that pre-fills the employer's form */
function AddressShare({ address, onShared }: { address: Address; onShared: () => void }) {
  const [copied, setCopied] = useState<"address" | "link" | null>(null);
  const payMeLink = typeof window === "undefined" ? "" : `${window.location.origin}/employer?payee=${address}#streams`;
  const copy = (text: string, what: "address" | "link") =>
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(what);
      onShared();
    });
  return (
    <div className="flex flex-col gap-6 md:flex-row md:items-center">
      <div className="w-fit rounded-2xl bg-gloss-white p-4">
        <QRCode value={address} size={140} fgColor="#17150e" bgColor="#f0f7f6" />
      </div>
      <div className="flex flex-col gap-4">
        <code className="font-mono text-subheading break-all">{address}</code>
        <p className="text-caption text-soft-charcoal">
          The pay-me link opens your employer&apos;s console with your address already filled in.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => copy(payMeLink, "link")}>{copied === "link" ? "✓ Link copied" : "Copy pay-me link"}</Button>
          <Button variant="outline" onClick={() => copy(address, "address")}>
            {copied === "address" ? "✓ Copied" : "Copy address"}
          </Button>
          <Button variant="outline" onClick={onShared}>
            I&apos;ve shared it
          </Button>
        </div>
      </div>
    </div>
  );
}
