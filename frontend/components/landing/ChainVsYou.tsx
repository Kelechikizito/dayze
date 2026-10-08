"use client";

import { useState } from "react";
import { Ciphertext } from "@/components/motion/Ciphertext";
import { useInView, useInterval, useReducedMotion } from "@/hooks/useMotion";

/*
 * Two ledgers side by side: the block explorer's view and Alice's.
 * Rows land one at a time; the left column's amounts never resolve, the right column's do.
 */

const TXS = [
  { action: "withdraw", who: "Alice", amount: "412.50 cUSDC", age: "12s" },
  { action: "fundVault", who: "Acme Labs", amount: "18,000.00 cUSDC", age: "1m" },
  { action: "withdraw", who: "Alice", amount: "96.10 cUSDC", age: "6m" },
  { action: "createStream", who: "Acme Labs → Alice", amount: "3,000.00 / month", age: "2d" },
];

function Ledger({ title, caption, revealed, shown }: { title: string; caption: string; revealed: boolean; shown: number }) {
  return (
    <div className={`flex flex-col gap-6 rounded-2xl p-6 md:p-8 ${revealed ? "bg-gloss-white" : "bg-gloss-black text-gloss-white"}`}>
      <div className="flex flex-col gap-1">
        <span className={`text-caption uppercase tracking-[0.063em] text-mid-grey`}>{caption}</span>
        <h3 className="text-heading-sm">{title}</h3>
      </div>
      <ul className="flex flex-col">
        {TXS.map((tx, i) => (
          <li
            key={i}
            className={`grid grid-cols-[1fr_auto] items-baseline gap-x-4 gap-y-1 border-t-[1.5px] py-4 transition-all duration-500 ${
              revealed ? "border-gloss-black" : "border-gloss-white/20"
            } ${i < shown ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"}`}
          >
            <span className="font-mono text-caption">{tx.action}</span>
            <span className="text-caption text-mid-grey">{tx.age} ago</span>
            <span className={`text-caption ${revealed ? "text-soft-charcoal" : "text-gloss-white/70"}`}>{tx.who}</span>
            <span className="text-right text-body">
              <Ciphertext plain={tx.amount} revealed={revealed && i < shown} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ChainVsYou() {
  const { ref, inView } = useInView<HTMLDivElement>(0.3);
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(0);
  useInterval(() => setShown((n) => Math.min(TXS.length, n + 1)), 650, inView && shown < TXS.length);

  // With reduced motion the interval never runs, so show every row once in view
  const count = !inView ? 0 : reduced ? TXS.length : shown;

  return (
    <div ref={ref} className="grid gap-4 md:grid-cols-2">
      <Ledger title="Arbiscan" caption="What the chain shows" revealed={false} shown={count} />
      <Ledger title="Alice's app" caption="What Alice sees" revealed shown={count} />
    </div>
  );
}
