"use client";

import type { Address } from "viem";
import { useReadContract } from "wagmi";
import { shortAddress } from "@/components/AuthButton";
import { TxStatus } from "@/components/TxStatus";
import { Button } from "@/components/ui";
import { useDayze } from "@/hooks/useDayze";
import { useTx } from "@/hooks/useTx";
import { JoinRequestsAbi } from "@/lib/contracts/abis";
import { HumanBadge } from "./StreamsSection";
import { StreamStatus, useStreamsOfPayer } from "./streams";

/**
 * Workers who asked this employer to pay them (JoinRequests). Anyone already paid by this employer is
 * hidden, so starting a stream clears the request from view without a second transaction.
 * @param onSetSalary Pre-fills the New stream form with the worker's address
 */
export function JoinRequestsList({ onSetSalary }: { onSetSalary: (employee: Address) => void }) {
  const { account, d } = useDayze();
  const { rows } = useStreamsOfPayer();
  const tx = useTx();
  const { data } = useReadContract({
    address: d?.joinRequests,
    abi: JoinRequestsAbi,
    functionName: "pendingFor",
    args: account ? [account] : undefined,
    query: { enabled: !!account && !!d?.joinRequests, refetchInterval: 15_000 },
  });

  const paid = new Set(rows.filter((s) => s.status !== StreamStatus.Cancelled).map((s) => s.payee.toLowerCase()));
  const pending = (data ?? []).filter((a) => !paid.has(a.toLowerCase()));
  if (!d?.joinRequests || pending.length === 0) return null;

  const dismiss = (employee: Address) =>
    tx.run(() => ({ address: d.joinRequests!, abi: JoinRequestsAbi, functionName: "dismiss", args: [employee] }));

  return (
    <div className="flex flex-col gap-3 rounded-2xl border-[1.5px] border-gloss-black p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-body">Join requests</h3>
        <span className="rounded-lg bg-gloss-black px-2 py-0.5 text-caption text-gloss-white">{pending.length}</span>
      </div>
      <ul className="flex flex-col">
        {pending.map((employee) => (
          <li key={employee} className="flex flex-wrap items-center justify-between gap-3 border-t-[1.5px] border-gloss-black/10 py-3">
            <div className="flex items-center gap-3">
              <span className="font-mono text-caption" title={employee}>
                {shortAddress(employee)}
              </span>
              <HumanBadge address={employee} />
            </div>
            <div className="flex gap-2">
              <Button onClick={() => onSetSalary(employee)} className="!px-4 !py-1.5 text-caption">
                Set salary
              </Button>
              <Button variant="outline" disabled={tx.busy} onClick={() => void dismiss(employee)} className="!px-4 !py-1.5 text-caption">
                Dismiss
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <TxStatus stage={tx.stage} error={tx.error} txHash={tx.hash} />
    </div>
  );
}
