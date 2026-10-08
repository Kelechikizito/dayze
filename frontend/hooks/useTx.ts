"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import type { Hex, TransactionReceipt } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import type { TxStage } from "@/components/TxStatus";

// wagmi's un-narrowed param type has `value: undefined`; replace it so payable calls (shieldNative) type-check
type WriteParams = Omit<Parameters<ReturnType<typeof useWriteContract>["writeContractAsync"]>[0], "value"> & {
  value?: bigint;
};

/** A readable one-line error from viem, wallet or SDK errors */
export function shortError(e: unknown): string {
  // The most common testnet failure: a new embedded wallet with no ETH for gas
  if (/insufficient funds/i.test(fullText(e))) {
    return "Your wallet has no ETH for gas. Send it a little testnet ETH (0.005 is plenty), then try again.";
  }
  if (e && typeof e === "object") {
    const err = e as { shortMessage?: string; details?: string; message?: string };
    // RPC errors put the provider's own words in `details`; show them, they say which limit was hit
    if (err.shortMessage) return err.details && err.details !== err.shortMessage ? `${err.shortMessage} (${err.details})` : err.shortMessage;
    if (err.message) return err.message.split("\n")[0];
  }
  return String(e);
}

/** Every message in an error and its causes, for matching */
function fullText(e: unknown): string {
  const parts: string[] = [];
  let cur: unknown = e;
  for (let i = 0; cur && i < 5; i++) {
    const c = cur as { message?: string; details?: string; shortMessage?: string; cause?: unknown };
    parts.push(c.shortMessage ?? "", c.details ?? "", c.message ?? "");
    cur = c.cause;
  }
  return parts.join(" ");
}

/**
 * Runs one transaction through the TxStatus stages:
 * encrypting (if `build` encrypts) → signing → confirming → done | error.
 * Callers that wait on the FHE network afterwards can call `setStage("fhe-processing")`.
 * On success, every contract read is refetched so the UI shows the new state.
 */
export function useTx() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const queryClient = useQueryClient();
  const [stage, setStage] = useState<TxStage>("idle");
  const [error, setError] = useState<string>();
  const [hash, setHash] = useState<Hex>();

  const run = useCallback(
    async (
      build: () => WriteParams | Promise<WriteParams>,
      opts: { encrypts?: boolean; keepOpen?: boolean } = {},
    ): Promise<TransactionReceipt | undefined> => {
      setError(undefined);
      setHash(undefined);
      try {
        if (!publicClient || !address) throw new Error("Connect a wallet first");
        setStage(opts.encrypts ? "encrypting" : "signing");
        const params = await build();
        setStage("signing");

        // Estimate gas with our RPC, so the wallet's own (often rate-limited) RPC does less.
        // FHE calls fan out to the TaskManager, and estimates on Arbitrum can come in low: add 50%.
        // Don't pass fee fields: MetaMask can treat Arbitrum Sepolia as non-EIP-1559 and rejects
        // maxFeePerGas with "params specify an EIP-1559 transaction". Each wallet prices it itself.
        const estimate = await publicClient
          .estimateContractGas({ ...(params as object), account: address } as never)
          .catch((e) => {
            console.warn("[dayze] gas estimate failed; the wallet will estimate", e);
            return undefined;
          });
        const txHash = await writeContractAsync({
          ...params,
          ...(estimate ? { gas: (estimate * BigInt(3)) / BigInt(2) } : {}),
        } as never); // see WriteParams: wagmi passes `value` through for payable functions
        setHash(txHash);

        setStage("confirming");
        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
        if (receipt.status !== "success") throw new Error("Transaction reverted");

        await queryClient.invalidateQueries();
        if (!opts.keepOpen) setStage("done");
        return receipt;
      } catch (e) {
        console.error("[dayze] transaction failed", e);
        setError(shortError(e));
        setStage("error");
        return undefined;
      }
    },
    [address, publicClient, writeContractAsync, queryClient],
  );

  const reset = useCallback(() => {
    setStage("idle");
    setError(undefined);
    setHash(undefined);
  }, []);

  return { stage, setStage, error, setError, hash, run, reset, busy: stage !== "idle" && stage !== "done" && stage !== "error" };
}
