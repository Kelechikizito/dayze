"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "@/hooks/useMotion";

const HEX = "0123456789abcdef";

function randomHex(length: number) {
  let s = "";
  for (let i = 0; i < length; i++) s += HEX[Math.floor(Math.random() * 16)];
  return s;
}

/**
 * Shows `plain` when revealed, and scrambling hex when not. Switching to revealed resolves
 * the characters left to right, like a value being unsealed.
 * @param plain The decrypted text
 * @param revealed Whether the viewer is allowed to see it
 * @param minLength Shortest hex shown while hidden, including "0x"
 */
export function Ciphertext({
  plain,
  revealed,
  minLength = 8,
  className = "",
}: {
  plain: string;
  revealed: boolean;
  minLength?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const length = Math.max(plain.length, minLength);
  const [scramble, setScramble] = useState(() => "0x" + "0".repeat(length - 2));
  // How many characters have resolved since the last reveal. Starts full so SSR shows plaintext.
  const [progress, setProgress] = useState(revealed ? plain.length : 0);

  // Keep the hex moving while hidden, and reset progress for the next reveal
  useEffect(() => {
    if (revealed || reduced) return;
    const id = setInterval(() => {
      setScramble("0x" + randomHex(length - 2));
      setProgress(0);
    }, 70);
    return () => clearInterval(id);
  }, [revealed, reduced, length]);

  // Resolve one character every 35ms after a reveal
  useEffect(() => {
    if (!revealed || reduced) return;
    const start = performance.now();
    const id = setInterval(() => {
      const n = Math.min(plain.length, Math.floor((performance.now() - start) / 35) + 1);
      setProgress(n);
      if (n >= plain.length) clearInterval(id);
    }, 35);
    return () => clearInterval(id);
  }, [revealed, reduced, plain]);

  const resolved = reduced ? plain.length : progress;
  const text = revealed
    ? plain.slice(0, resolved) + (resolved < plain.length ? randomHex(plain.length - resolved) : "")
    : scramble;

  return (
    <span className={`tabular-nums ${revealed ? "" : "font-mono text-[0.85em] tracking-tight"} ${className}`}>
      <span className="sr-only">{revealed ? plain : "encrypted"}</span>
      <span aria-hidden>{text}</span>
    </span>
  );
}
