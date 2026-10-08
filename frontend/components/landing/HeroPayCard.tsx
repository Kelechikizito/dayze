"use client";

import { useEffect, useState } from "react";
import { Ciphertext } from "@/components/motion/Ciphertext";
import { useInterval, useReducedMotion } from "@/hooks/useMotion";

/*
 * The hero's live product mock: a worker's pay, ticking by the second.
 * Every few seconds it flips to what a block explorer sees: the same card, all ciphertext.
 * Illustrative numbers: 3,000 cUSDC a month, a 30-day period.
 */

const MONTHLY = 3000;
const PER_SECOND = MONTHLY / (30 * 24 * 60 * 60);
const START = 1284.3679; // accrued when the page opens

type View = "you" | "explorer";

function money(n: number, decimals = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** A rising sparkline that draws itself on load */
function Sparkline() {
  const points = [4, 9, 8, 14, 18, 17, 24, 29, 31, 38, 44, 47];
  const w = 260;
  const h = 56;
  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${(i / (points.length - 1)) * w} ${h - (p / 50) * h}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-14 w-full overflow-visible" aria-hidden>
      <path d={d} pathLength={1} fill="none" stroke="currentColor" strokeWidth={1.5} className="draw-line" />
      <circle cx={w} cy={h - (47 / 50) * h} r={3.5} fill="currentColor" className="pulse-dot" />
    </svg>
  );
}

export function HeroPayCard() {
  const reduced = useReducedMotion();
  const [view, setView] = useState<View>("you");
  const [balance, setBalance] = useState(START);
  const [auto, setAuto] = useState(true);

  // Tick the balance smoothly
  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      setBalance(START + ((now - t0) / 1000) * PER_SECOND);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);

  // Flip between views until the visitor picks one
  useInterval(() => setView((v) => (v === "you" ? "explorer" : "you")), 4200, auto);

  const revealed = view === "you";
  const [whole, fraction] = money(balance, 6).split(".");

  const choose = (v: View) => {
    setAuto(false);
    setView(v);
  };

  return (
    <div className="relative rounded-2xl bg-pure-white p-6 md:p-8">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-caption">
          <span className="pulse-dot inline-block h-2 w-2 rounded-full bg-gloss-black" />
          Streaming · Acme Labs
        </div>
        <div role="tablist" aria-label="Who is looking" className="flex rounded-pill bg-gloss-white p-1 text-caption">
          {(["you", "explorer"] as const).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              onClick={() => choose(v)}
              className={`rounded-pill px-3 py-1 transition-colors duration-300 ${
                view === v ? "bg-gloss-black text-gloss-white" : "text-soft-charcoal hover:text-gloss-black"
              }`}
            >
              {v === "you" ? "Your view" : "Explorer view"}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-8 flex flex-col gap-2">
        <span className="text-caption text-mid-grey">Earned this month</span>
        <div className="flex min-h-[64px] items-baseline gap-2 font-classic text-[52px] leading-none tracking-[-0.03em] md:text-[64px]">
          {revealed ? (
            <span className="tabular-nums">
              {whole}
              <span className="text-mid-grey">.{fraction}</span>
            </span>
          ) : (
            <Ciphertext plain={whole} revealed={false} minLength={14} className="text-[28px] md:text-[34px]" />
          )}
          <span className="font-grotesk text-subheading">cUSDC</span>
        </div>
      </div>

      <div className={`mt-6 transition-opacity duration-500 ${revealed ? "opacity-100" : "opacity-20"}`}>
        <Sparkline />
      </div>

      <dl className="mt-6 grid grid-cols-3 gap-4 border-t-[1.5px] border-gloss-black pt-5">
        {[
          ["Monthly", money(MONTHLY)],
          ["Withdrawn", money(900)],
          ["Vault", "funded"],
        ].map(([label, value]) => (
          <div key={label} className="flex flex-col gap-1">
            <dt className="text-caption text-mid-grey">{label}</dt>
            <dd className="text-body">
              <Ciphertext plain={value} revealed={revealed} />
            </dd>
          </div>
        ))}
      </dl>

      <p className="mt-6 text-caption text-soft-charcoal">
        {revealed
          ? "Decrypted in your browser. Only you, your employer and their auditor can do this."
          : "What everyone else sees onchain: handles, not amounts."}
      </p>
    </div>
  );
}
