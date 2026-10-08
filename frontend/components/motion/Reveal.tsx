"use client";

import type { ReactNode } from "react";
import { useInView } from "@/hooks/useMotion";

/**
 * Fades and lifts its children in the first time they scroll into view.
 * @param delay Stagger in ms, for lists that reveal one item after another
 */
export function Reveal({
  children,
  delay = 0,
  className = "",
  as: Tag = "div",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: "div" | "li" | "article" | "section";
}) {
  const { ref, inView } = useInView<HTMLElement>(0.15);
  return (
    <Tag
      ref={ref as never}
      data-visible={inView}
      style={{ transitionDelay: `${delay}ms` }}
      className={`reveal ${className}`}
    >
      {children}
    </Tag>
  );
}

/** Splits a headline into words that rise in one after another on load */
export function RiseWords({ text, className = "" }: { text: string; className?: string }) {
  return (
    <span className={className} aria-label={text}>
      {text.split(" ").map((word, i) => (
        <span key={i} aria-hidden className="inline-block overflow-hidden pb-[0.08em] align-bottom">
          <span className="rise-word inline-block" style={{ animationDelay: `${120 + i * 90}ms` }}>
            {word}
            {" "}
          </span>
        </span>
      ))}
    </span>
  );
}
