"use client";

import { useCofheClient } from "@cofhe/react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { Address, Hex } from "viem";
import { usePublicClient, useReadContract, useReadContracts } from "wagmi";
import { StreamStatus, type StreamRow } from "@/components/employer/streams";
import { useDayze } from "@/hooks/useDayze";
import { useEnsureACP } from "@/hooks/useEnsureACP";
import { useReducedMotion } from "@/hooks/useMotion";
import { DayzePayrollAbi } from "@/lib/contracts/abis";
import { isUnsetHandle, unsealUint64 } from "@/lib/fhe";

/** The connected worker's streams (as payee), newest first */
export function useStreamsOfPayee(pollMs?: number) {
  const { account, d } = useDayze();
  const ids = useReadContract({
    address: d?.payroll,
    abi: DayzePayrollAbi,
    functionName: "streamsOfPayee",
    args: account ? [account] : undefined,
    query: { enabled: !!account && !!d, refetchInterval: pollMs },
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
  return { rows, count: ids.data?.length ?? 0, isLoading: ids.isLoading || streams.isLoading };
}

/** An org's display name, for "Paid by Acme Labs" */
export function useOrgName(payer: Address | undefined) {
  const { d } = useDayze();
  const { data } = useReadContract({
    address: d?.payroll,
    abi: DayzePayrollAbi,
    functionName: "orgOf",
    args: payer ? [payer] : undefined,
    query: { enabled: !!payer && !!d },
  });
  return data?.exists ? data.name : undefined;
}

/**
 * Seconds to add to the browser clock to match the chain. Read once.
 * Without it the balance can briefly go negative right after activation.
 */
export function useChainClockOffset() {
  const publicClient = usePublicClient();
  const { data } = useQuery({
    queryKey: ["chain-clock-offset", publicClient?.chain?.id],
    enabled: !!publicClient,
    staleTime: Infinity,
    queryFn: async () => {
      const block = await publicClient!.getBlock();
      return Number(block.timestamp) - Date.now() / 1000;
    },
  });
  return data ?? 0;
}

/**
 * Unseals one encrypted uint64 once per handle (a new handle after a write unseals again).
 * Runs only when `enabled`, so the ACP prompt appears when the worker asks to see their pay.
 */
export function useUnsealed(handle: Hex | undefined, enabled: boolean) {
  const client = useCofheClient();
  const { ensureACP } = useEnsureACP();
  return useQuery({
    queryKey: ["unsealed", handle],
    enabled: enabled && handle !== undefined,
    staleTime: Infinity,
    retry: 2,
    queryFn: async () => {
      if (isUnsetHandle(handle)) return BigInt(0);
      await ensureACP();
      return unsealUint64(client, handle!);
    },
  });
}

/**
 * A stream's withdrawable balance, ticking locally. Same formula as DayzePayroll._accrued:
 * accrued = monthly × elapsed / PERIOD, with elapsed stopping at endTime for cancelled streams.
 * No transactions: the numbers only change on screen.
 */
export function useLiveBalance(stream: StreamRow, monthly: bigint | undefined, withdrawn: bigint | undefined) {
  const { d } = useDayze();
  const offset = useChainClockOffset();
  const reduced = useReducedMotion();
  const [now, setNow] = useState(() => Date.now() / 1000);

  useEffect(() => {
    // Ticks 10x a second; with reduced motion, once a second
    const id = setInterval(() => setNow(Date.now() / 1000), reduced ? 1000 : 100);
    return () => clearInterval(id);
  }, [reduced]);

  if (monthly === undefined || withdrawn === undefined || !d) return undefined;
  if (stream.status !== StreamStatus.Active && stream.status !== StreamStatus.Cancelled) return BigInt(0);

  const period = BigInt(d.period);
  const chainNow = BigInt(Math.floor(now + offset));
  const end = stream.status === StreamStatus.Cancelled ? stream.endTime : chainNow;
  const elapsed = end > stream.startTime ? end - stream.startTime : BigInt(0);
  const accrued = (monthly * elapsed) / period;
  return accrued > withdrawn ? accrued - withdrawn : BigInt(0);
}
