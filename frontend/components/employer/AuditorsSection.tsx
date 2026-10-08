"use client";

import { useState } from "react";
import { isAddress, type Address } from "viem";
import { useReadContract } from "wagmi";
import { shortAddress } from "@/components/AuthButton";
import { Field, Input, Panel } from "@/components/forms";
import { TxStatus } from "@/components/TxStatus";
import { Button } from "@/components/ui";
import { useDayze } from "@/hooks/useDayze";
import { useTx } from "@/hooks/useTx";
import { AuditRegistryAbi } from "@/lib/contracts/abis";

/** Reads the connected employer's auditors */
export function useAuditors() {
  const { account, d } = useDayze();
  const { data } = useReadContract({
    address: d?.auditRegistry,
    abi: AuditRegistryAbi,
    functionName: "auditorsOf",
    args: account ? [account] : undefined,
    query: { enabled: !!account && !!d },
  });
  return data ?? [];
}

/** §4 Auditors: add and remove the addresses that can read your payroll */
export function AuditorsSection() {
  const { d } = useDayze();
  const auditors = useAuditors();
  const [input, setInput] = useState("");
  const tx = useTx();
  const valid = isAddress(input.trim());

  const write = (functionName: "addAuditor" | "removeAuditor", who: Address) =>
    tx.run(() => ({ address: d!.auditRegistry, abi: AuditRegistryAbi, functionName, args: [who] }));

  return (
    <Panel
      title="Auditors"
      help="An auditor can read every salary, vault balance and withdrawal you create from now on."
    >
      {auditors.length > 0 && (
        <ul className="flex flex-col">
          {auditors.map((a) => (
            <li key={a} className="flex items-center justify-between border-t-[1.5px] border-gloss-black/10 py-3">
              <span className="font-mono text-caption" title={a}>
                {shortAddress(a)}
              </span>
              <Button variant="outline" disabled={tx.busy} onClick={() => write("removeAuditor", a)} className="!px-4 !py-1.5 text-caption">
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex flex-col gap-4 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) void write("addAuditor", input.trim() as Address).then(() => setInput(""));
        }}
      >
        <div className="flex-1">
          <Field label="Auditor address">
            <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="0x…" spellCheck={false} />
          </Field>
        </div>
        <Button type="submit" variant="dark" disabled={!valid || tx.busy}>
          Add auditor
        </Button>
      </form>
      <p className="text-caption text-soft-charcoal">
        Removing an auditor stops access to <em>new</em> data only. What they could already read stays readable.
      </p>
      <TxStatus stage={tx.stage} error={tx.error} txHash={tx.hash} />
    </Panel>
  );
}
