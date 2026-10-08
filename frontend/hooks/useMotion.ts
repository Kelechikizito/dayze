"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  const mq = window.matchMedia(REDUCED_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/** True when the user asked the OS for less motion. Animations then show their final state. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_QUERY).matches,
    () => false,
  );
}

/**
 * Becomes true the first time the element scrolls into view, and stays true.
 * @param threshold How much of the element must be visible
 */
export function useInView<T extends Element>(threshold = 0.25) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [inView, threshold]);
  return { ref, inView };
}

/**
 * Calls `fn` every `ms` while mounted, unless motion is reduced.
 * @param fn Called on every tick
 * @param ms Interval in milliseconds
 * @param enabled Pause without unmounting
 */
export function useInterval(fn: () => void, ms: number, enabled = true) {
  const saved = useRef(fn);
  const reduced = useReducedMotion();
  useEffect(() => {
    saved.current = fn;
  }, [fn]);
  useEffect(() => {
    if (!enabled || reduced) return;
    const id = setInterval(() => saved.current(), ms);
    return () => clearInterval(id);
  }, [ms, enabled, reduced]);
}
