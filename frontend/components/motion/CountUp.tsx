"use client";

import { useEffect, useState } from "react";
import { useInView, useReducedMotion } from "@/hooks/useMotion";

/**
 * Counts from 0 to `to` with an ease-out once scrolled into view.
 * Takes plain options, not a format function, so server components can render it.
 * @param to Final value
 * @param suffix Text after the number, e.g. " bit"
 * @param grouped Adds thousands separators
 */
export function CountUp({
  to,
  duration = 1400,
  suffix = "",
  grouped = false,
  className = "",
}: {
  to: number;
  duration?: number;
  suffix?: string;
  grouped?: boolean;
  className?: string;
}) {
  const format = (n: number) => (grouped ? Math.round(n).toLocaleString("en-US") : String(Math.round(n))) + suffix;
  const { ref, inView } = useInView<HTMLSpanElement>(0.5);
  const reduced = useReducedMotion();
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!inView || reduced) return;
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setValue(to * (1 - Math.pow(1 - t, 3)));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [inView, reduced, to, duration]);

  return (
    <span ref={ref} className={`tabular-nums ${className}`}>
      {format(reduced && inView ? to : value)}
    </span>
  );
}
