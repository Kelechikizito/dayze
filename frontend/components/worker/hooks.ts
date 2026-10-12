"use client";

import { useCofheClient } from "@cofhe/react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { Address, Hex } from "viem";
import { usePublicClient, useReadContract, useReadContracts } from "wagmi";
import type { StreamRow } from "@/components/employer/streams";
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

/** The chain's current time in whole seconds, refreshed every `everyMs` */
export function useChainNow(everyMs = 1000): bigint {
  const offset = useChainClockOffset();
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() / 1000), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return BigInt(Math.floor(now + offset));
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

export type LivePay = {
  /** Streamed and not yet withdrawn: what a withdrawal can take */
  available: bigint;
  /** Streamed so far from this period's allocation */
  thisPeriod: bigint;
  /** This period's allocation, or undefined if payroll hasn't funded this period */
  thisPeriodTotal: bigint | undefined;
  /** Streamed in earlier periods and not withdrawn yet */
  unclaimedEarlier: bigint;
};

/**
 * A stream's pay, ticking locally. Same maths as DayzePayroll._streamed: everything banked, plus the
 * live allocation streamed linearly from allocStart to allocEnd. Once the period ends the allocation
 * counts as earlier pay, and the stream waits for the next payroll run.
 * No transactions: the numbers only change on screen.
 */
export function useLiveBalance(
  stream: StreamRow,
  amounts: { allocated: bigint | undefined; banked: bigint | undefined; withdrawn: bigint | undefined },
): LivePay | undefined {
  const offset = useChainClockOffset();
  const reduced = useReducedMotion();
  const [now, setNow] = useState(() => Date.now() / 1000);

  useEffect(() => {
    // Ticks 10x a second; with reduced motion, once a second
    const id = setInterval(() => setNow(Date.now() / 1000), reduced ? 1000 : 100);
    return () => clearInterval(id);
  }, [reduced]);

  const { allocated, banked, withdrawn } = amounts;
  if (allocated === undefined || banked === undefined || withdrawn === undefined) return undefined;

  const zero = BigInt(0);
  // Milliseconds, so the number moves smoothly between blocks
  const nowMs = BigInt(Math.floor((now + offset) * 1000));
  const startMs = stream.allocStart * BigInt(1000);
  const endMs = stream.allocEnd * BigInt(1000);
  const live = stream.allocEnd > zero && nowMs < endMs;

  const earlier = banked + (stream.allocEnd > zero && !live ? allocated : zero);
  const thisPeriod = live && endMs > startMs ? (allocated * (nowMs - startMs)) / (endMs - startMs) : zero;
  const streamed = earlier + thisPeriod;

  return {
    available: streamed > withdrawn ? streamed - withdrawn : zero,
    thisPeriod,
    thisPeriodTotal: live ? allocated : undefined,
    unclaimedEarlier: earlier > withdrawn ? earlier - withdrawn : zero,
  };
}
