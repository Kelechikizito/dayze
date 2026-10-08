"use client";

import { useCofheClient, useCofheConnection } from "@cofhe/react";
import { useCallback, useState } from "react";

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

  const ensureACP = useCallback(async () => {
    if (client.acp.getActiveACP()) {
      setStatus("ready");
      return;
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
  }, [client]);

  return { hasACP: hasACP || status === "ready", status, error, ensureACP };
}
