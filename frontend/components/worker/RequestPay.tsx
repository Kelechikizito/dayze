"use client";

import { usePrivy } from "@privy-io/react-auth";
import type { Address } from "viem";
import { useReadContract } from "wagmi";
import { TxStatus } from "@/components/TxStatus";
import { Button } from "@/components/ui";
import { useDayze } from "@/hooks/useDayze";
import { useTx } from "@/hooks/useTx";
import { JoinRequestsAbi } from "@/lib/contracts/abis";

/** Whether the connected worker has a pending request to `employer` */
export function useHasRequested(employer: Address | undefined) {
  const { account, d } = useDayze();
  const { data } = useReadContract({
    address: d?.joinRequests,
    abi: JoinRequestsAbi,
    functionName: "hasRequested",
    args: employer && account ? [employer, account] : undefined,
    query: { enabled: !!employer && !!account && !!d?.joinRequests },
  });
  return data ?? false;
}

/** The email Privy holds for this user, from an email login or Google */
export function useNotificationEmail() {
  const { user } = usePrivy();
  return user?.email?.address ?? user?.google?.email;
}

/** a•••@gmail.com: enough to recognise, not enough to copy */
function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  return `${name.slice(0, 1)}•••@${domain}`;
}

/**
 * The in-app replacement for "send your address by hand": one transaction that puts the worker in the
 * employer's console. Also shows where pay notifications will be emailed, with a way to add an email.
 */
export function RequestPay({ employer, employerName }: { employer: Address | undefined; employerName?: string }) {
  const { d } = useDayze();
  const { linkEmail } = usePrivy();
  const email = useNotificationEmail();
  const requested = useHasRequested(employer);
  const tx = useTx();
  const name = employerName ?? "your employer";
  const available = !!employer && !!d?.joinRequests;

  const send = (functionName: "requestToJoin" | "cancelRequest") =>
    tx.run(() => ({ address: d!.joinRequests!, abi: JoinRequestsAbi, functionName, args: [employer!] }));

  return (
    <div className="flex flex-col gap-5">
      {available ? (
        requested ? (
          <div className="flex flex-col gap-2">
            <p>✓ Request sent. You&apos;re in {name}&apos;s console, waiting for them to set your salary.</p>
            <button
              type="button"
              onClick={() => void send("cancelRequest")}
              disabled={tx.busy}
              className="w-fit text-caption text-soft-charcoal underline underline-offset-4"
            >
              Withdraw request
            </button>
          </div>
        ) : (
          <div>
            <Button onClick={() => void send("requestToJoin")} disabled={tx.busy}>
              Ask {name} to pay you
            </Button>
          </div>
        )
      ) : (
        <p className="text-caption text-soft-charcoal">
          {employer ? "Join requests aren't set up on this network yet." : "Open your employer's invite link to ask them directly."} Use one of
          the other ways below.
        </p>
      )}
      <TxStatus stage={tx.stage} error={tx.error} txHash={tx.hash} />

      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-gloss-white px-5 py-4 text-caption">
        {email ? (
          <span>We&apos;ll email {maskEmail(email)} when your pay starts. Never the amount.</span>
        ) : (
          <>
            <span>Get an email when your pay starts?</span>
            <button type="button" onClick={linkEmail} className="underline underline-offset-4">
              Add an email
            </button>
          </>
        )}
      </div>
    </div>
  );
}
