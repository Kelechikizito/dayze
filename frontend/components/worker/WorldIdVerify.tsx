"use client";

import { IDKitRequestWidget, selfieCheckLegacy, type IDKitResult } from "@worldcoin/idkit";
import { useRef, useState } from "react";
import { useReadContract } from "wagmi";
import { TxStatus } from "@/components/TxStatus";
import { Button } from "@/components/ui";
import { useDayze } from "@/hooks/useDayze";
import { useTx } from "@/hooks/useTx";
import { HumanRegistryAbi } from "@/lib/contracts/abis";
import { WORLDID_ACTION, signalFor, worldIdErrorMessage, type AttestResponse, type RpSignatureResponse } from "@/lib/worldid";

/** Whether the connected wallet is registered in HumanRegistry */
export function useIsHuman() {
  const { account, d } = useDayze();
  const { data } = useReadContract({
    address: d?.humanRegistry,
    abi: HumanRegistryAbi,
    functionName: "isHuman",
    args: account ? [account] : undefined,
    query: { enabled: !!account && !!d },
  });
  return data ?? false;
}

const pendingKey = (chainId: number | undefined, wallet: string) => `dayze:attestation:${chainId}:${wallet.toLowerCase()}`;

/** An attestation that hasn't been registered yet. Selfie Check is one-time, so never lose it. */
function readPending(chainId: number | undefined, wallet: string | undefined): AttestResponse | undefined {
  if (!wallet) return undefined;
  try {
    const raw = localStorage.getItem(pendingKey(chainId, wallet));
    const a = raw ? (JSON.parse(raw) as AttestResponse) : undefined;
    return a && a.deadline > Date.now() / 1000 ? a : undefined;
  } catch {
    return undefined;
  }
}

function writePending(chainId: number | undefined, wallet: string, a: AttestResponse | undefined) {
  try {
    if (a) localStorage.setItem(pendingKey(chainId, wallet), JSON.stringify(a));
    else localStorage.removeItem(pendingKey(chainId, wallet));
  } catch {}
}

/**
 * World ID Selfie Check (07a): prove you're a unique, live human without saying who you are.
 * Done once and permanent: HumanRegistry never expires it and Dayze never asks again.
 * rp-signature → IDKit widget (selfieCheck, signal = your wallet) → attest → HumanRegistry.register.
 */
export function WorldIdVerify() {
  const { account, chainId, d } = useDayze();
  const isHuman = useIsHuman();
  const tx = useTx();
  const [rp, setRp] = useState<RpSignatureResponse>();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(() => readPending(chainId, account));
  // Why our attest route refused. IDKit swallows it and reports a bare `failed_by_host_app`.
  const hostRejection = useRef<string | null>(null);

  if (isHuman) {
    return <p>✓ You&apos;re a verified human. This is permanent: you won&apos;t be asked again.</p>;
  }
  if (!account || !d) return null;

  const start = async () => {
    tx.reset();
    const res = await fetch("/api/world-id/rp-signature", { method: "POST" });
    if (!res.ok) {
      tx.setError("World ID isn't configured on the server");
      tx.setStage("error");
      return;
    }
    setRp((await res.json()) as RpSignatureResponse);
    setOpen(true);
  };

  // Runs inside the widget: if the backend rejects the proof, the widget shows the failure.
  // The attestation is saved before anything else can go wrong.
  const verifyWithBackend = async (result: IDKitResult) => {
    hostRejection.current = null;
    const res = await fetch("/api/world-id/attest", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idkitResponse: result, wallet: account, chainId }),
    });
    const body = await res.json();
    if (!res.ok) {
      hostRejection.current = body.error ?? "The server rejected the proof";
      throw new Error(hostRejection.current!);
    }
    writePending(chainId, account, body as AttestResponse);
    setPending(body as AttestResponse);
  };

  const register = async (a: AttestResponse | undefined = readPending(chainId, account)) => {
    if (!a) return;
    const receipt = await tx.run(() => ({
      address: d.humanRegistry,
      abi: HumanRegistryAbi,
      functionName: "register",
      args: [BigInt(a.nullifier), BigInt(a.deadline), a.signature],
    }));
    if (receipt) {
      writePending(chainId, account, undefined);
      setPending(undefined);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        {pending ? (
          <Button onClick={() => void register(pending)} disabled={tx.busy}>
            Finish registration
          </Button>
        ) : (
          <Button onClick={() => void start()} disabled={tx.busy}>
            Verify with Selfie Check
          </Button>
        )}
      </div>
      {pending && (
        <p className="text-caption text-soft-charcoal">
          Your Selfie Check passed. One transaction left to save it onchain.
        </p>
      )}
      {rp && (
        <IDKitRequestWidget
          open={open}
          onOpenChange={setOpen}
          app_id={rp.app_id}
          action={WORLDID_ACTION}
          environment={rp.environment}
          rp_context={{
            rp_id: rp.rp_id,
            nonce: rp.nonce,
            created_at: rp.created_at,
            expires_at: rp.expires_at,
            signature: rp.sig,
          }}
          // Selfie Check (Beta) is a World ID 3.0 credential: that's what "Legacy" means. Same as Herit.
          allow_legacy_proofs
          preset={selfieCheckLegacy({ signal: signalFor(account) })}
          handleVerify={verifyWithBackend}
          onSuccess={() => void register()}
          onError={(code, debugReport) => {
            // Our own server's reason beats `failed_by_host_app`, which only says "the app said no"
            tx.setError(hostRejection.current ?? worldIdErrorMessage(code, rp.environment));
            tx.setStage("error");
            if (debugReport) console.error("[dayze] World ID debug report", code, debugReport);
          }}
        />
      )}
      {rp?.environment === "staging" && (
        <p className="text-caption text-soft-charcoal">
          Testnet: scan with the{" "}
          <a href="https://simulator.worldcoin.org" target="_blank" rel="noreferrer" className="underline underline-offset-4">
            World ID simulator
          </a>{" "}
          instead of World App.
        </p>
      )}
      {rp?.environment === "sandbox" && (
        <p className="text-caption text-soft-charcoal">
          Testnet: scan with the <strong>World ID (Sandbox)</strong> app, not the regular World App.
        </p>
      )}
      <TxStatus stage={tx.stage} error={tx.error} txHash={tx.hash} />
    </div>
  );
}
