"use client";

import { useCofheClient } from "@cofhe/react";
import { useCallback } from "react";
import type { Address, Hex } from "viem";
import { usePublicClient, useReadContract, useReadContracts } from "wagmi";
import { useDayze } from "@/hooks/useDayze";
import type { useTx } from "@/hooks/useTx";
import { DayzePayrollAbi } from "@/lib/contracts/abis";
import { decryptForTx } from "@/lib/fhe";

/** Mirrors IDayzePayroll.Status */
export const StreamStatus = { None: 0, AwaitingPolicy: 1, Pending: 2, Active: 3, Cancelled: 4 } as const;

export const statusLabel: Record<number, string> = {
  0: "—",
  1: "Checking policy",
  2: "Needs approval",
  3: "Active",
  4: "Cancelled",
};

export type StreamRow = {
  id: bigint;
  payer: Address;
  payee: Address;
  token: Address;
  monthly: Hex;
  withdrawn: Hex;
  startTime: bigint;
  endTime: bigint;
  status: number;
  needsApproval: Hex;
};

/**
 * The connected employer's streams, newest first.
 * Reads `streamsOfPayer` then each stream. Fine at demo scale; checkpoint 13 swaps in a subgraph.
 */
export function useStreamsOfPayer() {
  const { account, d } = useDayze();
  const ids = useReadContract({
    address: d?.payroll,
    abi: DayzePayrollAbi,
    functionName: "streamsOfPayer",
    args: account ? [account] : undefined,
    query: { enabled: !!account && !!d },
  });
  const list = [...(ids.data ?? [])].reverse();
  const streams = useReadContracts({
    contracts: list.map((id) => ({
      address: d?.payroll,
      abi: DayzePayrollAbi,
      functionName: "getStream" as const,
      args: [id] as const,
    })),
    query: { enabled: list.length > 0 },
  });
  const rows: StreamRow[] = list.flatMap((id, i) => {
    const r = streams.data?.[i];
    return r?.status === "success" ? [{ id, ...(r.result as Omit<StreamRow, "id">) }] : [];
  });
  return { rows, isLoading: ids.isLoading || streams.isLoading };
}

/**
 * Resolves a stream's policy check: publicly decrypts its `needsApproval` bit, then calls
 * `resolvePolicy` with the decrypt signature. Retries the decrypt while the FHE network is
 * still computing the bit (it lands a few seconds after createStream).
 */
export function useResolvePolicy(tx: ReturnType<typeof useTx>) {
  const { d } = useDayze();
  const cofhe = useCofheClient();
  const publicClient = usePublicClient();

  return useCallback(
    async (id: bigint) => {
      if (!d || !publicClient) return;
      tx.setStage("fhe-processing");
      const stream = (await publicClient.readContract({
        address: d.payroll,
        abi: DayzePayrollAbi,
        functionName: "getStream",
        args: [id],
      })) as Omit<StreamRow, "id">;

      let result: { value: bigint; signature: Hex } | undefined;
      let lastError: unknown;
      for (let attempt = 0; attempt < 20 && !result; attempt++) {
        try {
          result = await decryptForTx(cofhe, stream.needsApproval);
        } catch (e) {
          lastError = e;
          await new Promise((r) => setTimeout(r, 3000));
        }
      }
      if (!result) {
        tx.setError(`Policy check didn't finish: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
        tx.setStage("error");
        return;
      }

      const needsApproval = result.value === BigInt(1);
      await tx.run(() => ({
        address: d.payroll,
        abi: DayzePayrollAbi,
        functionName: "resolvePolicy",
        args: [id, needsApproval, result.signature],
      }));
      return needsApproval;
    },
    [d, publicClient, cofhe, tx],
  );
}
