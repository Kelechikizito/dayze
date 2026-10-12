"use client";

import { useCofheClient } from "@cofhe/react";
import { useState } from "react";
import { useReadContract } from "wagmi";
import { Field, Input, Panel, PillPicker } from "@/components/forms";
import { TxLinks, TxStatus } from "@/components/TxStatus";
import { Button } from "@/components/ui";
import { useChainNow } from "@/components/worker/hooks";
import { useDayze } from "@/hooks/useDayze";
import { useTx } from "@/hooks/useTx";
import { DayzePayrollAbi } from "@/lib/contracts/abis";
import { encryptUint64, isUnsetHandle } from "@/lib/fhe";
import { parseConfidential, type TokenKey } from "@/lib/tokens";
import { fundedThisPeriod, periodEndOf, StreamStatus, useStreamsOfPayer } from "./streams";

/**
 * Run payroll: once per pay period, set money aside from the vault for every active stream.
 * Each stream gets min(its salary for the rest of the period, what's left of the budget), in order.
 * Employees stream only what was set aside, so pay never outruns the money.
 */
export function RunPayrollSection() {
  const { d, tokens } = useDayze();
  const cofhe = useCofheClient();
  const tx = useTx("payroll");
  const now = useChainNow();
  const { rows } = useStreamsOfPayer();
  const [key, setKey] = useState<TokenKey>(tokens[0]?.key ?? "cusdc");
  const [budget, setBudget] = useState("");
  const token = tokens.find((t) => t.key === key) ?? tokens[0];
  const { account } = useDayze();

  const vault = useReadContract({
    address: d?.payroll,
    abi: DayzePayrollAbi,
    functionName: "vaultOf",
    args: account && token ? [account, token.wrapper] : undefined,
    query: { enabled: !!account && !!d && !!token },
  });

  if (!d || !token) return null;

  const end = periodEndOf(now, d.period);
  const active = rows.filter((s) => s.status === StreamStatus.Active && s.token.toLowerCase() === token.wrapper.toLowerCase());
  const unfunded = active.filter((s) => !fundedThisPeriod(s, now, d.period));
  const vaultFunded = !isUnsetHandle(vault.data);

  let parsed: bigint | undefined;
  try {
    parsed = budget ? parseConfidential(budget) : undefined;
  } catch {
    parsed = undefined;
  }

  const run = async () => {
    const ids = unfunded.map((s) => s.id);
    const done = await tx.run(
      async () => {
        const { handle, proof } = await encryptUint64(cofhe, parsed!, d.payroll);
        return { address: d.payroll, abi: DayzePayrollAbi, functionName: "runPayroll", args: [token.wrapper, handle, proof, ids] };
      },
      { encrypts: true, label: `Ran payroll for ${ids.length} stream${ids.length === 1 ? "" : "s"} (${token.symbol})` },
    );
    if (done) setBudget("");
  };

  return (
    <Panel
      title="Run payroll"
      help="Once each pay period, set this period's pay aside from your vault. Employees stream only what's set aside. Whatever you don't use stays in the vault."
      aside={<PillPicker options={tokens.map((t) => ({ value: t.key, label: t.symbol }))} value={token.key} onChange={setKey} />}
    >
      <p className="text-caption text-soft-charcoal">
        This pay period ends at {new Date(Number(end) * 1000).toLocaleTimeString()} (in {countdown(end - now)}).{" "}
        {active.length === 0
          ? `You have no active ${token.symbol} streams.`
          : unfunded.length === 0
            ? `✓ All ${active.length} active ${token.symbol} stream${active.length === 1 ? " is" : "s are"} funded for this period.`
            : `${unfunded.length} of ${active.length} active ${token.symbol} stream${active.length === 1 ? "" : "s"} not funded yet.`}
      </p>

      {unfunded.length > 0 && (
        <form
          className="flex flex-col gap-4 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            if (parsed !== undefined) void run();
          }}
        >
          <div className="flex-1">
            <Field
              label={`Budget for this period (${token.symbol})`}
              hint={
                vaultFunded
                  ? "Encrypted in your browser. Capped at your vault. A stream started mid-period gets pay for the time left."
                  : `Fund your ${token.symbol} vault first.`
              }
            >
              <Input inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="5000" />
            </Field>
          </div>
          <Button type="submit" disabled={parsed === undefined || !vaultFunded || tx.busy}>
            Run payroll for {unfunded.length} stream{unfunded.length === 1 ? "" : "s"}
          </Button>
        </form>
      )}

      <TxStatus stage={tx.stage} error={tx.error} txHash={tx.hash} />
      {!tx.busy && <TxLinks scope="payroll" />}
    </Panel>
  );
}

/** "4m 05s" from seconds */
function countdown(seconds: bigint): string {
  const s = Number(seconds);
  const days = Math.floor(s / 86400);
  if (days > 0) return `${days}d ${Math.floor((s % 86400) / 3600)}h`;
  const m = Math.floor(s / 60);
  return `${m}m ${String(s % 60).padStart(2, "0")}s`;
}
