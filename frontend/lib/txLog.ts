import { useSyncExternalStore } from "react";
import type { Address, Hex } from "viem";

/*
 * Confirmed transactions per wallet and section ("fund", "policy"…), kept in localStorage.
 * TxStatus forgets its hash when a step finishes or a form remounts; this log keeps the
 * explorer links around after that.
 */

export type TxLogEntry = { label: string; hash: Hex };

const MAX_ENTRIES = 6;
const EVENT = "dayze:txlog";
const EMPTY: TxLogEntry[] = [];

const storageKey = (account: Address, scope: string) => `dayze:txlog:${account.toLowerCase()}:${scope}`;

// useSyncExternalStore needs a stable snapshot, so cache the parsed list per raw string
const cache = new Map<string, { raw: string; entries: TxLogEntry[] }>();

function read(key: string): TxLogEntry[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return EMPTY;
    const hit = cache.get(key);
    if (hit?.raw === raw) return hit.entries;
    const entries = JSON.parse(raw) as TxLogEntry[];
    cache.set(key, { raw, entries });
    return entries;
  } catch {
    return EMPTY;
  }
}

function write(key: string, entries: TxLogEntry[]) {
  try {
    localStorage.setItem(key, JSON.stringify(entries.slice(-MAX_ENTRIES)));
  } catch {
    // Storage blocked: the links just won't persist
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Adds a confirmed transaction to a section's log */
export function addTx(account: Address, scope: string, entry: TxLogEntry) {
  const key = storageKey(account, scope);
  write(key, [...read(key), entry]);
}

/** Empties a section's log, so it shows one run's transactions only */
export function clearTxLog(account: Address, scope: string) {
  write(storageKey(account, scope), []);
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** The confirmed transactions logged for a section, oldest first */
export function useTxLog(account: Address | undefined, scope: string): TxLogEntry[] {
  return useSyncExternalStore(
    subscribe,
    () => (account ? read(storageKey(account, scope)) : EMPTY),
    () => EMPTY,
  );
}
