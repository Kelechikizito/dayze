"use client";

import { useSendTransaction, useWallets } from "@privy-io/react-auth";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { encodeFunctionData, type Hex, type TransactionReceipt } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import type { TxStage } from "@/components/TxStatus";

// wagmi's un-narrowed param type has `value: undefined`; replace it so payable calls (shieldNative) type-check
type WriteParams = Omit<Parameters<ReturnType<typeof useWriteContract>["writeContractAsync"]>[0], "value"> & {
  value?: bigint;
};

/**
 * Privy pays gas for embedded wallets (Fee sponsorship in the Privy dashboard, chain enabled there,
 * "Allow transactions from the client" on). Set NEXT_PUBLIC_SPONSOR_GAS=false to make users pay again.
 */
const SPONSOR_GAS = process.env.NEXT_PUBLIC_SPONSOR_GAS !== "false";

/** Whether Privy pays gas for the active wallet: only embedded wallets; MetaMask and others pay their own */
export function useGasSponsored(): boolean {
  const { address } = useAccount();
  const { wallets } = useWallets();
  return (
    SPONSOR_GAS &&
    wallets.some((w) => w.walletClientType === "privy" && w.address.toLowerCase() === address?.toLowerCase())
  );
}

/** A readable one-line error from viem, wallet or SDK errors */
export function shortError(e: unknown): string {
  // The most common testnet failure: a new embedded wallet with no ETH for gas
  const text = fullText(e);
  if (/sponsor|paymaster|credits/i.test(text)) {
    return `Gas sponsorship failed. Check Fee sponsorship in the Privy dashboard. (${text.trim().split("\n")[0].slice(0, 160)})`;
  }
  if (/insufficient funds/i.test(text)) {
    return "Your wallet has no ETH for gas. Send it a little testnet ETH (0.005 is plenty), then try again.";
  }
  // Privy's embedded wallet signs only with a live login session; it expires during long detours (World App, idle tabs)
  if (/invalid auth token|session.*expired|not authenticated/i.test(text)) {
    return "Your login session expired. Log out, log back in with the same account, then try again.";
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
  const { address, chainId } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { sendTransaction: sendWithPrivy } = useSendTransaction();
  const sponsored = useGasSponsored();
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

        // Estimate gas and price it with our RPC, so the wallet's own (often rate-limited) RPC does less.
        // - Gas: FHE calls fan out to the TaskManager, and estimates can come in low: +50%.
        // - Price: a legacy gasPrice with 25% headroom. MetaMask can treat Base Sepolia as
        //   non-EIP-1559: it rejects maxFeePerGas outright, and its own price has no headroom, so a base
        //   fee tick fails the send ("max fee per gas less than block base fee"). Every wallet accepts a
        //   legacy gasPrice.
        const [estimate, gasPrice] = await Promise.all([
          publicClient.estimateContractGas({ ...(params as object), account: address } as never).catch((e) => {
            console.warn("[dayze] gas estimate failed; the wallet will estimate", e);
            return undefined;
          }),
          publicClient.getGasPrice().catch(() => undefined),
        ]);
        const gas = estimate ? (estimate * BigInt(3)) / BigInt(2) : undefined;
        let txHash: Hex;
        if (sponsored) {
          // Privy upgrades the wallet with EIP-7702 and a paymaster pays: same address, no ETH needed
          const p = params as unknown as { address: Hex; abi: never; functionName: string; args?: unknown[]; value?: bigint };
          ({ hash: txHash } = await sendWithPrivy(
            {
              to: p.address,
              data: encodeFunctionData({ abi: p.abi, functionName: p.functionName, args: p.args } as never),
              value: p.value,
              chainId,
              gasLimit: gas,
            },
            { sponsor: true, address },
          ));
        } else {
          txHash = await writeContractAsync({
            ...params,
            ...(gas ? { gas } : {}),
            ...(gasPrice ? { type: "legacy", gasPrice: (gasPrice * BigInt(5)) / BigInt(4) } : {}),
          } as never); // see WriteParams: wagmi passes `value` through for payable functions
        }
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
    [address, chainId, publicClient, writeContractAsync, sendWithPrivy, sponsored, queryClient],
  );

  const reset = useCallback(() => {
    setStage("idle");
    setError(undefined);
    setHash(undefined);
  }, []);

  return { stage, setStage, error, setError, hash, run, reset, busy: stage !== "idle" && stage !== "done" && stage !== "error" };
}
