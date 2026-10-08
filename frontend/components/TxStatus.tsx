export type TxStage = "idle" | "encrypting" | "signing" | "confirming" | "fhe-processing" | "done" | "error";

/** The four working stages, in order. Every FHE action in 10–12 walks through them. */
const STAGES: { stage: Exclude<TxStage, "idle" | "done" | "error">; label: string; help: string }[] = [
  { stage: "encrypting", label: "Encrypting", help: "Encrypting in your browser. The amount never leaves it in plaintext." },
  { stage: "signing", label: "Signing", help: "Confirm in your wallet." },
  { stage: "confirming", label: "Confirming", help: "Waiting for the transaction to land." },
  { stage: "fhe-processing", label: "Processing", help: "The FHE network is computing on the encrypted values." },
];

/**
 * Progress for an FHE transaction: encrypting → signing → confirming → processing → done | error.
 * Flat, ink-only: the current stage is outlined, finished ones are filled.
 */
export function TxStatus({ stage, error, txHash }: { stage: TxStage; error?: string; txHash?: string }) {
  if (stage === "idle") return null;
  const currentIndex = STAGES.findIndex((s) => s.stage === stage);
  const finished = stage === "done";

  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-4 rounded-lg bg-gloss-white p-6">
      <ol className="grid grid-cols-4 gap-2">
        {STAGES.map((s, i) => {
          const done = finished || (currentIndex !== -1 && i < currentIndex);
          const current = i === currentIndex;
          return (
            <li key={s.stage} className="flex flex-col gap-2">
              <span
                className={`h-1.5 rounded-pill ${
                  done ? "bg-gloss-black" : current ? "animate-pulse bg-gloss-black/60" : "bg-gloss-black/10"
                }`}
              />
              <span className={`text-caption ${done || current ? "" : "text-mid-grey"}`}>{s.label}</span>
            </li>
          );
        })}
      </ol>
      <p className="text-caption">
        {stage === "error"
          ? `Something went wrong: ${error ?? "unknown error"}`
          : finished
            ? "Done."
            : STAGES[currentIndex]?.help}
      </p>
      {txHash && <p className="font-mono text-caption break-all text-mid-grey">{txHash}</p>}
    </div>
  );
}
