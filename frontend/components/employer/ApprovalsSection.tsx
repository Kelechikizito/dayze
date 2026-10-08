"use client";

import { useQuery } from "@tanstack/react-query";
import { getAbiItem, type Address } from "viem";
import { usePublicClient } from "wagmi";
import { shortAddress } from "@/components/AuthButton";
import { Panel } from "@/components/forms";
import { TxStatus } from "@/components/TxStatus";
import { Button } from "@/components/ui";
import { useDayze } from "@/hooks/useDayze";
import { useTx } from "@/hooks/useTx";
import { ApprovalPolicyAbi, DayzePayrollAbi } from "@/lib/contracts/abis";
import { notifyStreamPayee } from "@/lib/notify";
import { StreamStatus, type StreamRow } from "./streams";

type QueueItem = { stream: StreamRow; count: number; required: number; approved: boolean };

/**
 * Pending streams, across every org, where the connected account is an approver.
 * There's no onchain index of "orgs I approve for", so it reads StreamPending events since the
 * deploy block and checks each one. Fine at demo scale; checkpoint 13 swaps in a subgraph.
 */
export function useApprovalQueue() {
  const { account, d } = useDayze();
  const publicClient = usePublicClient();

  return useQuery({
    queryKey: ["approval-queue", d?.payroll, account],
    enabled: !!publicClient && !!account && !!d,
    refetchInterval: 15_000,
    queryFn: async (): Promise<QueueItem[]> => {
      const logs = await publicClient!.getLogs({
        address: d!.payroll,
        event: getAbiItem({ abi: DayzePayrollAbi, name: "StreamPending" }),
        fromBlock: BigInt(d!.deployBlock),
        toBlock: "latest",
      });
      const ids = [...new Set(logs.map((l) => l.args.id).filter((id): id is bigint => id !== undefined))];

      const items = await Promise.all(
        ids.map(async (id): Promise<QueueItem | undefined> => {
          const s = (await publicClient!.readContract({
            address: d!.payroll,
            abi: DayzePayrollAbi,
            functionName: "getStream",
            args: [id],
          })) as Omit<StreamRow, "id">;
          if (s.status !== StreamStatus.Pending) return undefined;
          const read = <F extends "isApprover" | "approvalCount" | "required" | "hasApproved">(functionName: F, args: readonly unknown[]) =>
            publicClient!.readContract({ address: d!.approvalPolicy, abi: ApprovalPolicyAbi, functionName, args } as never);
          const isApprover = (await read("isApprover", [s.payer, account])) as boolean;
          if (!isApprover) return undefined;
          const [count, required, approved] = await Promise.all([
            read("approvalCount", [s.payer, id]) as Promise<number>,
            read("required", [s.payer]) as Promise<number>,
            read("hasApproved", [s.payer, id, account]) as Promise<boolean>,
          ]);
          return { stream: { id, ...s }, count: Number(count), required: Number(required), approved };
        }),
      );
      return items.filter((i): i is QueueItem => !!i);
    },
  });
}

/** §6 Approvals: approve pending streams, then activate them once they have enough approvals */
export function ApprovalsSection() {
  const { d, tokens, chainId } = useDayze();
  const { data: queue, isLoading, refetch } = useApprovalQueue();
  const tx = useTx();
  const symbolOf = (wrapper: Address) => tokens.find((t) => t.wrapper.toLowerCase() === wrapper.toLowerCase())?.symbol ?? "?";

  const approve = async (payer: Address, id: bigint) => {
    await tx.run(() => ({ address: d!.approvalPolicy, abi: ApprovalPolicyAbi, functionName: "approve", args: [payer, id] }));
    void refetch();
  };
  const activate = async (id: bigint) => {
    const receipt = await tx.run(() => ({ address: d!.payroll, abi: DayzePayrollAbi, functionName: "activateApproved", args: [id] }));
    if (receipt) notifyStreamPayee(chainId, id);
    void refetch();
  };

  return (
    <Panel
      title="Approvals"
      help="Streams above an org's hidden threshold, where you're one of the approvers. You never see the salary or the threshold."
    >
      {isLoading ? (
        <p className="text-caption text-mid-grey">Looking for pending streams…</p>
      ) : !queue || queue.length === 0 ? (
        <p className="text-caption text-mid-grey">Nothing waiting for your approval.</p>
      ) : (
        <ul className="flex flex-col">
          {queue.map(({ stream: s, count, required, approved }) => (
            <li key={String(s.id)} className="flex flex-wrap items-center justify-between gap-4 border-t-[1.5px] border-gloss-black/10 py-4">
              <div className="flex flex-col gap-1">
                <span>
                  Stream #{String(s.id)} · {symbolOf(s.token)}
                </span>
                <span className="text-caption text-soft-charcoal">
                  {shortAddress(s.payer)} → {shortAddress(s.payee)}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-caption">
                  {count} of {required} approvals
                </span>
                {count >= required ? (
                  <Button disabled={tx.busy} onClick={() => void activate(s.id)}>
                    Activate
                  </Button>
                ) : approved ? (
                  <span className="text-caption text-mid-grey">✓ You approved</span>
                ) : (
                  <Button variant="outline" disabled={tx.busy} onClick={() => void approve(s.payer, s.id)}>
                    Approve
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <TxStatus stage={tx.stage} error={tx.error} txHash={tx.hash} />
    </Panel>
  );
}
