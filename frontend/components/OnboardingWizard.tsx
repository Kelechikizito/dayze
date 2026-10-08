"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { StepStatus } from "./Stepper";
import { Button } from "./ui";

/*
 * Two-panel onboarding: a numbered step list on the left, one large card for the current step on the right.
 * Step status comes from the chain (the caller decides); the wizard only tracks which step is being viewed.
 */

export type WizardStep = {
  key: string;
  title: string;
  /** One or two sentences under the title */
  help: string;
  /** Short facts about the step, shown as a list */
  bullets?: string[];
  icon?: ReactNode;
  status: StepStatus;
  /** The form or action for this step */
  content?: ReactNode;
  /** Called when the visitor skips an optional step */
  onSkip?: () => void;
};

/** True inside the wizard card: console panels drop their own frame and title there */
export const WizardEmbed = createContext(false);
export const useWizardEmbed = () => useContext(WizardEmbed);

export function OnboardingWizard({ steps, footer }: { steps: WizardStep[]; footer?: ReactNode }) {
  const current = Math.max(0, steps.findIndex((s) => s.status === "active"));
  const [viewing, setViewing] = useState<number | null>(null);
  // Follow the chain: when the active step moves on, stop viewing an old one
  const index = viewing !== null && steps[viewing]?.status !== "todo" ? viewing : current;
  const step = steps[index];
  const allDone = steps.every((s) => s.status === "done" || s.status === "skipped");

  return (
    <div className="grid gap-10 lg:grid-cols-[320px_1fr] lg:gap-16">
      {/* Step list */}
      <nav aria-label="Setup steps" className="flex flex-col gap-6">
        <span className="text-caption tracking-[0.2em] text-mid-grey uppercase">
          {allDone ? "All steps done" : `Step ${current + 1} of ${steps.length}`}
        </span>
        <ol className="flex gap-2 overflow-x-auto lg:flex-col lg:gap-1 lg:overflow-visible">
          {steps.map((s, i) => {
            const selected = i === index;
            const reachable = s.status !== "todo";
            return (
              <li key={s.key} className="shrink-0">
                <button
                  type="button"
                  disabled={!reachable}
                  aria-current={selected ? "step" : undefined}
                  onClick={() => setViewing(i === current ? null : i)}
                  className={`flex w-full items-center gap-4 rounded-2xl px-4 py-3 text-left transition-colors ${
                    selected ? "bg-pure-white" : reachable ? "hover:bg-pure-white/60" : ""
                  }`}
                >
                  <StepDot n={i + 1} status={s.status} selected={selected} />
                  <span className={`hidden whitespace-nowrap sm:inline ${s.status === "todo" ? "text-mid-grey" : ""}`}>
                    {s.title}
                    {s.status === "skipped" && <span className="ml-2 text-caption text-mid-grey">skipped</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {/* Current step */}
      <section className="flex min-h-[420px] flex-col gap-8 rounded-3xl bg-pure-white p-6 md:p-12">
        <header className="flex items-start justify-between gap-6">
          <div className="flex flex-col gap-6">
            <span className="text-caption tracking-[0.2em] text-mid-grey uppercase">Step {index + 1}</span>
            <div className="flex flex-col gap-4">
              <h2 className="text-heading">{step.title}</h2>
              <p className="max-w-2xl text-subheading text-soft-charcoal">{step.help}</p>
            </div>
          </div>
          {step.icon && <span className="hidden shrink-0 md:block">{step.icon}</span>}
        </header>

        {step.bullets && step.bullets.length > 0 && (
          <ul className="flex flex-col gap-3">
            {step.bullets.map((b) => (
              <li key={b} className="flex items-center gap-3">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gloss-black" />
                {b}
              </li>
            ))}
          </ul>
        )}

        {step.status === "done" && index !== current && !allDone ? (
          <p className="text-caption">✓ Done. This is saved onchain.</p>
        ) : (
          step.content && (
            <WizardEmbed.Provider value>
              <div className="flex flex-col gap-6">{step.content}</div>
            </WizardEmbed.Provider>
          )
        )}

        <footer className="mt-auto flex flex-wrap items-center justify-between gap-4 border-t-[1.5px] border-gloss-black/10 pt-6">
          <Button
            variant="outline"
            disabled={index === 0}
            onClick={() => setViewing(Math.max(0, index - 1))}
            className="!px-4 !py-2 text-caption"
          >
            ← Back
          </Button>
          <div className="flex items-center gap-4">
            {step.onSkip && step.status === "active" && (
              <button type="button" onClick={step.onSkip} className="text-caption text-soft-charcoal underline underline-offset-4">
                Skip for now
              </button>
            )}
            {index !== current && !allDone && (
              <Button onClick={() => setViewing(null)} className="!px-4 !py-2 text-caption">
                Go to current step →
              </Button>
            )}
          </div>
        </footer>
      </section>

      {footer && <div className="lg:col-start-2">{footer}</div>}
    </div>
  );
}

/** The numbered circle: outline when to-do, ink when current, ink with ✓ when done */
function StepDot({ n, status, selected }: { n: number; status: StepStatus; selected: boolean }) {
  const base = "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-caption transition-colors";
  if (status === "done") return <span className={`${base} bg-gloss-black text-gloss-white`}>✓</span>;
  if (status === "active" || selected) return <span className={`${base} bg-gloss-black text-gloss-white`}>{n}</span>;
  if (status === "skipped") return <span className={`${base} border-[1.5px] border-dashed border-gloss-black/30 text-mid-grey`}>{n}</span>;
  return <span className={`${base} border-[1.5px] border-gloss-black/20 text-mid-grey`}>{n}</span>;
}

/** Thin line icons for the step card, drawn in ink at 1.5px like the rest of the system */
export function StepIcon({ name }: { name: "key" | "org" | "vault" | "rules" | "eye" | "invite" | "human" | "wallet" }) {
  const paths: Record<typeof name, ReactNode> = {
    key: (
      <>
        <circle cx="16" cy="20" r="6" />
        <path d="M21 17l12-8M29 12l3 4M26 14l3 4" />
      </>
    ),
    org: (
      <>
        <path d="M8 34V12l12-5 12 5v22" />
        <path d="M4 34h32M14 16h4M22 16h4M14 22h4M22 22h4M18 34v-6h4v6" />
      </>
    ),
    vault: (
      <>
        <rect x="6" y="8" width="28" height="24" rx="3" />
        <circle cx="20" cy="20" r="5" />
        <path d="M20 15v-2M20 27v-2M25 20h2M13 20h2M10 32v3M30 32v3" />
      </>
    ),
    rules: (
      <>
        <path d="M20 5l12 5v9c0 8-5 13-12 16C13 32 8 27 8 19v-9z" />
        <path d="M15 20l4 4 7-8" />
      </>
    ),
    eye: (
      <>
        <path d="M4 20s6-10 16-10 16 10 16 10-6 10-16 10S4 20 4 20z" />
        <circle cx="20" cy="20" r="4" />
      </>
    ),
    invite: (
      <>
        <rect x="5" y="10" width="30" height="20" rx="3" />
        <path d="M5 13l15 10 15-10" />
      </>
    ),
    human: (
      <>
        <circle cx="20" cy="14" r="6" />
        <path d="M8 34c1-7 6-11 12-11s11 4 12 11" />
      </>
    ),
    wallet: (
      <>
        <rect x="5" y="10" width="30" height="22" rx="3" />
        <path d="M5 16h30M26 23h4" />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 40 40" className="h-10 w-10" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {paths[name]}
    </svg>
  );
}
