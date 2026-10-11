"use client";

import { useCofheClient, useCofheConnection } from "@cofhe/react";
import { useCallback, useState } from "react";
import { usePublicClient } from "wagmi";
import { isKernelSignature, kernelDomainOf } from "@/lib/kernelSignature";

/** Shown before the signature prompt */
export const ACP_EXPLAINER = "Sign once so the network knows it's you. Nothing is sent onchain.";

type AcpStatus = "idle" | "signing" | "ready" | "error";

/**
 * Makes sure the connected account has a self ACP before it unseals anything.
 * The ACP is an EIP-712 signature, not a transaction. The SDK stores it per chain and account.
 */
export function useEnsureACP() {
  const client = useCofheClient();
  const connection = useCofheConnection();
  const [status, setStatus] = useState<AcpStatus>("idle");
  const [error, setError] = useState<Error | null>(null);

  const hasACP = connection.connected && client.acp.getActiveACP() !== undefined;

  const publicClient = usePublicClient();

  const ensureACP = useCallback(async () => {
    const active = client.acp.getActiveACP();
    if (active) {
      // A permit signed before gas sponsorship upgraded this wallet (EIP-7702) has a plain signature, which the
      // network now rejects with 401. Drop it and sign a new one in the wallet's ERC-1271 format.
      const account = connection.account as `0x${string}` | undefined;
      const delegated = publicClient && account ? await kernelDomainOf(publicClient, account) : undefined;
      if (!delegated || isKernelSignature(active.issuerSignature)) {
        setStatus("ready");
        return;
      }
      client.acp.removeActiveACP();
    }
    setStatus("signing");
    setError(null);
    try {
      await client.acp.getOrCreateSelfACP();
      setStatus("ready");
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
      setStatus("error");
      throw e;
    }
  }, [client, connection.account, publicClient]);

  return { hasACP: hasACP || status === "ready", status, error, ensureACP };
}
