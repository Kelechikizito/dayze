"use client";

import { useCofheClient } from "@cofhe/react";
import { useState } from "react";
import { usePublicClient } from "wagmi";
import { Field, Input } from "@/components/forms";
import { HumanBadge } from "@/components/employer/StreamsSection";
import { StreamStatus, statusLabel, type StreamRow } from "@/components/employer/streams";
import { TxStatus } from "@/components/TxStatus";
import { Badge, Button } from "@/components/ui";
import { useDayze } from "@/hooks/useDayze";
import { useTx } from "@/hooks/useTx";
import { DayzePayrollAbi } from "@/lib/contracts/abis";
import { encryptUint64, unsealUint64 } from "@/lib/fhe";
import { formatConfidential, parseConfidential } from "@/lib/tokens";
import { useLiveBalance, useOrgName, useUnsealed } from "./hooks";

/**
 * One stream: who pays, the live balance (the demo moment), and withdraw.
 * `unlocked` means the worker has an ACP, so `monthly` and `withdrawn` can be unsealed.
 */
export function StreamCard({ stream, unlocked }: { stream: StreamRow; unlocked: boolean }) {
  const { tokens } = useDayze();
  const org = useOrgName(stream.payer);
  const symbol = tokens.find((t) => t.wrapper.toLowerCase() === stream.token.toLowerCase())?.symbol ?? "";
  const monthly = useUnsealed(stream.monthly, unlocked);
  const withdrawn = useUnsealed(stream.withdrawn, unlocked);
  const available = useLiveBalance(stream, monthly.data, withdrawn.data);
  const live = stream.status === StreamStatus.Active;

  const [whole, fraction] = available !== undefined ? formatSixDp(available).split(".") : ["", ""];

  return (
    <article className="flex flex-col gap-8 rounded-3xl bg-pure-white p-6 md:p-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {live && <span className="pulse-dot inline-block h-2 w-2 rounded-full bg-gloss-black" />}
          <span>Paid by {org ?? "your employer"}</span>
          <HumanBadge address={stream.payee} />
        </div>
        <Badge>{statusLabel[stream.status]}</Badge>
      </header>

      <div className="flex flex-col gap-2">
        <span className="text-caption text-mid-grey">Available to withdraw</span>
        {available === undefined ? (
          <span className="font-classic text-[56px] leading-none text-mid-grey">
            {unlocked ? "decrypting…" : "••••••"}
          </span>
        ) : (
          <div className="flex flex-wrap items-baseline gap-3 font-classic text-[56px] leading-none tracking-[-0.03em] md:text-display">
            <span className="tabular-nums">
              {whole}
              <span className="text-mid-grey">.{fraction}</span>
            </span>
            <span className="font-grotesk text-subheading">{symbol}</span>
          </div>
        )}
        {live && available !== undefined && (
          <span className="text-caption text-soft-charcoal">Updating live. 0 transactions.</span>
        )}
        {stream.status === StreamStatus.Pending && (
          <span className="text-caption text-soft-charcoal">Waiting for your employer&apos;s approvers. Pay starts when they approve.</span>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-4 border-t-[1.5px] border-gloss-black pt-5 md:grid-cols-3">
        <div className="flex flex-col gap-1">
          <dt className="text-caption text-mid-grey">Monthly salary</dt>
          <dd>{monthly.data !== undefined ? `${formatConfidential(monthly.data)} ${symbol}` : "••••••"}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-caption text-mid-grey">Withdrawn so far</dt>
          <dd>{withdrawn.data !== undefined ? `${formatConfidential(withdrawn.data)} ${symbol}` : "••••••"}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-caption text-mid-grey">Started</dt>
          <dd>{stream.startTime > BigInt(0) ? new Date(Number(stream.startTime) * 1000).toLocaleString() : "—"}</dd>
        </div>
      </dl>

      {unlocked && (stream.status === StreamStatus.Active || stream.status === StreamStatus.Cancelled) && (
        <WithdrawForm stream={stream} symbol={symbol} available={available} withdrawnBefore={withdrawn.data} />
      )}
    </article>
  );
}

function WithdrawForm({
  stream,
  symbol,
  available,
  withdrawnBefore,
}: {
  stream: StreamRow;
  symbol: string;
  available: bigint | undefined;
  withdrawnBefore: bigint | undefined;
}) {
  const { d } = useDayze();
  const cofhe = useCofheClient();
  const publicClient = usePublicClient();
  const tx = useTx();
  const [amount, setAmount] = useState("");
  const [result, setResult] = useState<string>();

  let parsed: bigint | undefined;
  try {
    parsed = amount ? parseConfidential(amount) : undefined;
  } catch {
    parsed = undefined;
  }

  const withdraw = async () => {
    setResult(undefined);
    // Default: everything available right now
    const value = parsed ?? available;
    if (!value || value <= BigInt(0)) return;
    const receipt = await tx.run(
      async () => {
        const { handle, proof } = await encryptUint64(cofhe, value, d!.payroll);
        return { address: d!.payroll, abi: DayzePayrollAbi, functionName: "withdraw", args: [stream.id, handle, proof] };
      },
      { encrypts: true, keepOpen: true },
    );
    if (!receipt) return;

    // Unseal the new `withdrawn` to see what actually moved. Over-withdrawals pay 0 instead of reverting.
    tx.setStage("fhe-processing");
    try {
      const after = await waitForNewWithdrawn(stream.id, stream.withdrawn);
      const moved = withdrawnBefore !== undefined ? after - withdrawnBefore : undefined;
      setResult(
        moved === undefined || moved > BigInt(0)
          ? `Withdrew ${moved !== undefined ? formatConfidential(moved) : ""} ${symbol} to your wallet.`
          : "Request was more than available, so nothing moved. (We don't revert, because that would leak information.)",
      );
      setAmount("");
      tx.setStage("done");
    } catch (e) {
      tx.setError(e instanceof Error ? e.message : String(e));
      tx.setStage("error");
    }
  };

  // Reads the stream until its `withdrawn` handle changes (every withdraw writes a new one), then unseals it
  const waitForNewWithdrawn = async (id: bigint, oldHandle: string): Promise<bigint> => {
    for (let i = 0; i < 10; i++) {
      const s = (await publicClient!.readContract({
        address: d!.payroll,
        abi: DayzePayrollAbi,
        functionName: "getStream",
        args: [id],
      })) as Omit<StreamRow, "id">;
      if (s.withdrawn !== oldHandle) return unsealUint64(cofhe, s.withdrawn);
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    throw new Error("Couldn't read the new balance yet. Refresh in a moment.");
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void withdraw();
      }}
    >
      <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
        <Field label={`Amount (${symbol})`} hint="Leave empty to withdraw everything available. Encrypted before it's sent.">
          <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="All available" />
        </Field>
        <Button type="submit" disabled={tx.busy || (!parsed && !available)}>
          Withdraw
        </Button>
      </div>
      <TxStatus stage={tx.stage} error={tx.error} txHash={tx.hash} />
      {result && <p className="text-caption">{result}</p>}
    </form>
  );
}

/** 6 decimals with thousands separators, so the cents visibly move */
function formatSixDp(units: bigint): string {
  const s = formatConfidential(units);
  const [w, f = ""] = s.split(".");
  return `${Number(w).toLocaleString("en-US")}.${f.padEnd(6, "0")}`;
}
