"use client";

import Link from "next/link";
import { useState } from "react";
import QRCode from "react-qr-code";
import { useReadContract } from "wagmi";
import { Panel } from "@/components/forms";
import { Button } from "@/components/ui";
import { useDayze } from "@/hooks/useDayze";
import { IncomeCredentialAbi } from "@/lib/contracts/abis";

/**
 * /verify: a landlord's address to hand to the worker (a credential is issued to one address),
 * and the income proofs already sent to it.
 */
export function VerifierHome() {
  const { account, d } = useDayze();
  const [copied, setCopied] = useState(false);
  const ids = useReadContract({
    address: d?.incomeCredential,
    abi: IncomeCredentialAbi,
    functionName: "credentialsFor",
    args: account ? [account] : undefined,
    query: { enabled: !!account && !!d, refetchInterval: 15_000 },
  });
  const list = [...((ids.data as readonly bigint[] | undefined) ?? [])].reverse();

  if (!account) return null;
  return (
    <div className="flex flex-col gap-8">
      <Panel title="Your address" help="Send this to the person whose income you want to check. They issue the proof to it.">
        <div className="flex flex-col gap-6 md:flex-row md:items-center">
          <div className="w-fit rounded-2xl bg-pure-white p-4">
            <QRCode value={account} size={140} fgColor="#17150e" />
          </div>
          <div className="flex flex-col gap-3">
            <code className="font-mono text-caption break-all">{account}</code>
            <div>
              <Button variant="outline" onClick={() => void navigator.clipboard.writeText(account).then(() => setCopied(true))}>
                {copied ? "✓ Copied" : "Copy address"}
              </Button>
            </div>
          </div>
        </div>
      </Panel>
      <Panel title="Proofs sent to you" help="Open one to see whether the income meets your threshold.">
        {list.length === 0 ? (
          <p className="text-caption text-mid-grey">None yet. They appear here once issued to your address.</p>
        ) : (
          <ul className="flex flex-col">
            {list.map((id) => (
              <li key={String(id)} className="border-t-[1.5px] border-gloss-black/10 py-3">
                <Link href={`/verify/${id}`} className="underline underline-offset-4">
                  Income proof #{String(id)} →
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
