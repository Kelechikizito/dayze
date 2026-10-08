import type { ReactNode } from "react";

export type StepStatus = "todo" | "active" | "done" | "skipped";

export type Step = {
  title: string;
  /** One line of help */
  help: string;
  /** Read from the chain, never from clicks, so a refresh keeps progress */
  status: StepStatus;
  /** The control for this step, shown while it's active */
  action?: ReactNode;
};

const statusLabel: Record<StepStatus, string> = {
  todo: "To do",
  active: "Now",
  done: "Done",
  skipped: "Skipped",
};

/** Onboarding steps for both flows: a numbered list with hairline rules */
export function Stepper({ steps }: { steps: Step[] }) {
  return (
    <ol className="flex flex-col">
      {steps.map((step, i) => {
        const active = step.status === "active";
        const muted = step.status === "todo" || step.status === "skipped";
        return (
          <li
            key={step.title}
            aria-current={active ? "step" : undefined}
            className={`grid grid-cols-[48px_1fr_auto] gap-x-4 gap-y-4 border-t-[1.5px] border-gloss-black py-6 ${
              muted ? "opacity-50" : ""
            }`}
          >
            <span className="text-caption text-mid-grey">{String(i + 1).padStart(2, "0")}</span>
            <div className="flex flex-col gap-1">
              <h3 className="text-subheading">{step.title}</h3>
              <p className="text-soft-charcoal">{step.help}</p>
            </div>
            <span
              className={`h-fit rounded-lg px-3 py-1 text-caption ${
                step.status === "done"
                  ? "bg-gloss-black text-gloss-white"
                  : active
                    ? "border-[1.5px] border-gloss-black"
                    : "bg-gloss-white"
              }`}
            >
              {step.status === "done" ? "✓ " : ""}
              {statusLabel[step.status]}
            </span>
            {active && step.action && <div className="col-start-2 col-end-4">{step.action}</div>}
          </li>
        );
      })}
    </ol>
  );
}
