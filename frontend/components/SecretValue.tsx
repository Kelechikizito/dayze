"use client";

import { useCofheClient } from "@cofhe/react";
import { useState } from "react";
import type { Hex } from "viem";
import { useEnsureACP } from "@/hooks/useEnsureACP";
import { shortError } from "@/hooks/useTx";
import { isUnsetHandle, unsealUint64 } from "@/lib/fhe";
import { formatConfidential } from "@/lib/tokens";

/**
 * An encrypted uint64, hidden until the viewer reveals it. Revealing creates the ACP if needed,
 * then decrypts in the browser. A never-set handle shows as 0 without a decrypt.
 * @param handle The euint64 handle from a contract read
 * @param unit Shown after the number, e.g. "cUSDC"
 */
export function SecretValue({ handle, unit = "" }: { handle: Hex | undefined; unit?: string }) {
  const client = useCofheClient();
  const { ensureACP } = useEnsureACP();
  const [state, setState] = useState<{ for?: Hex; value?: bigint; loading?: boolean; error?: string }>({});

  // A new handle (after a write) hides the old value again
  const current = state.for === handle ? state : {};

  if (isUnsetHandle(handle)) {
    return (
      <span className="tabular-nums">
        0 {unit}
      </span>
    );
  }

  const reveal = async () => {
    setState({ for: handle, loading: true });
    try {
      await ensureACP();
      setState({ for: handle, value: await unsealUint64(client, handle!) });
    } catch (e) {
      setState({ for: handle, error: shortError(e) });
    }
  };

  if (current.value !== undefined) {
    return (
      <button
        onClick={() => setState({})}
        title="Hide"
        className="tabular-nums underline decoration-gloss-black/20 underline-offset-4"
      >
        {formatConfidential(current.value)} {unit}
      </button>
    );
  }

  return (
    <button
      onClick={reveal}
      disabled={current.loading}
      title={current.error ?? "Decrypt in your browser"}
      className="inline-flex items-center gap-2 tabular-nums"
    >
      <span className="rounded-lg bg-gloss-black/80 px-2 font-mono text-caption tracking-widest text-gloss-white select-none">
        {current.loading ? "decrypting…" : "••••••"}
      </span>
      <span className="text-caption text-mid-grey">{current.error ? "retry" : "👁 reveal"}</span>
    </button>
  );
}
