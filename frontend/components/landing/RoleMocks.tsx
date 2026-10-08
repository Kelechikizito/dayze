"use client";

import { useState } from "react";
import { Ciphertext } from "@/components/motion/Ciphertext";
import { useInView, useInterval, useReducedMotion } from "@/hooks/useMotion";

/*
 * Small live product mocks for the three role cards. Each loops once it scrolls into view.
 * They sit on white inside mint cards, like product captures in DESIGN.md's feature cards.
 */

const frame = "rounded-lg bg-pure-white p-5 text-caption";

/** Employer: a large salary waits for 2 of 3 approvals, then goes live */
export function EmployerMock() {
  const { ref, inView } = useInView<HTMLDivElement>(0.4);
  const reduced = useReducedMotion();
  const [step, setStep] = useState(0); // 0..3 approvals, 4 = active, then loop
  useInterval(() => setStep((s) => (s >= 5 ? 0 : s + 1)), 900, inView);
  const approvals = reduced ? 2 : Math.min(step, 2);
  const active = reduced || step >= 3;

  return (
    <div ref={ref} className={frame}>
      <div className="flex items-center justify-between">
        <span className="text-mid-grey">Stream #14 · cUSDC</span>
        <span
          className={`rounded-lg px-2 py-0.5 transition-colors duration-300 ${
            active ? "bg-gloss-black text-gloss-white" : "border-[1.5px] border-gloss-black"
          }`}
        >
          {active ? "Active" : "Needs approval"}
        </span>
      </div>
      <div className="mt-4 flex items-baseline justify-between">
        <span>Monthly</span>
        <span className="font-mono">
          <Ciphertext plain="12,000.00" revealed />
        </span>
      </div>
      <div className="mt-4 flex gap-1.5">
        {[0, 1].map((i) => (
          <span
            key={i}
            className={`h-1.5 flex-1 rounded-pill transition-colors duration-300 ${
              i < approvals ? "bg-gloss-black" : "bg-gloss-black/10"
            }`}
          />
        ))}
      </div>
      <p className="mt-2 text-mid-grey">{approvals} of 2 required approvals</p>
    </div>
  );
}

/** Worker: a landlord asks one question and gets one encrypted bit back */
export function CredentialMock() {
  const { ref, inView } = useInView<HTMLDivElement>(0.4);
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState(0); // 0 asking, 1 checking, 2 answered, 3 hold
  useInterval(() => setPhase((p) => (p + 1) % 4), 1100, inView);
  const answered = reduced || phase >= 2;

  return (
    <div ref={ref} className={frame}>
      <div className="flex items-center justify-between">
        <span className="text-mid-grey">Credential #7 · expires in 14 days</span>
      </div>
      <p className="mt-4 text-body">Does Alice earn at least 2,500 cUSDC a month?</p>
      <div className="mt-4 flex items-center justify-between">
        <span className="text-mid-grey">Landlord sees</span>
        <span
          className={`min-w-16 rounded-lg px-3 py-1 text-center transition-colors duration-300 ${
            answered ? "bg-solar-yellow text-gloss-black" : "bg-gloss-white"
          }`}
        >
          {answered ? "Yes" : phase === 1 ? "checking…" : "—"}
        </span>
      </div>
      <p className="mt-2 text-mid-grey">Not the salary. Just the answer.</p>
    </div>
  );
}

/** Auditor: ledger rows decrypt one by one for the appointed auditor */
export function AuditorMock() {
  const { ref, inView } = useInView<HTMLDivElement>(0.4);
  const reduced = useReducedMotion();
  const rows = [
    ["Alice", "3,000.00"],
    ["Bola", "4,250.00"],
    ["Chen", "12,000.00"],
  ];
  const [shown, setShown] = useState(0);
  useInterval(() => setShown((n) => (n >= rows.length + 2 ? 0 : n + 1)), 800, inView);
  const revealedCount = reduced ? rows.length : Math.min(shown, rows.length);

  return (
    <div ref={ref} className={frame}>
      <div className="flex items-center justify-between">
        <span className="text-mid-grey">Acme Labs · October payroll</span>
        <span className="text-mid-grey">CSV ↓</span>
      </div>
      <ul className="mt-3">
        {rows.map(([name, amount], i) => (
          <li key={name} className="flex items-baseline justify-between border-t-[1.5px] border-gloss-black/10 py-2">
            <span>{name}</span>
            <Ciphertext plain={amount} revealed={i < revealedCount} />
          </li>
        ))}
      </ul>
    </div>
  );
}
