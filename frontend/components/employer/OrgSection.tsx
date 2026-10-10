"use client";

import { useState } from "react";
import { useBalance, useReadContract } from "wagmi";
import { Field, Input, Panel } from "@/components/forms";
import { TxStatus } from "@/components/TxStatus";
import { Badge, Button } from "@/components/ui";
import { useDayze } from "@/hooks/useDayze";
import { useGasSponsored, useTx } from "@/hooks/useTx";
import { DayzePayrollAbi } from "@/lib/contracts/abis";

/** Reads the connected account's org */
export function useOrg() {
  const { account, d } = useDayze();
  const { data, isLoading } = useReadContract({
    address: d?.payroll,
    abi: DayzePayrollAbi,
    functionName: "orgOf",
    args: account ? [account] : undefined,
    query: { enabled: !!account && !!d },
  });
  return { org: data, exists: data?.exists ?? false, isLoading };
}

/** §1 Organisation: a name form until the org exists, then the name and a badge */
export function OrgSection() {
  const { account, d } = useDayze();
  const { org, exists } = useOrg();
  const sponsored = useGasSponsored();
  const balance = useBalance({ address: account, query: { enabled: !!account && !exists && !sponsored } });
  const [name, setName] = useState("");
  const tx = useTx();

  if (exists && org) {
    return (
      <Panel title={org.name} help="Your organisation. Its name appears on the income credentials your employees issue.">
        <div className="flex gap-2">
          <Badge>Private payroll</Badge>
        </div>
      </Panel>
    );
  }

  const create = () =>
    tx.run(() => ({ address: d!.payroll, abi: DayzePayrollAbi, functionName: "createOrg", args: [name.trim()] }));

  return (
    <Panel title="Create your organisation" help="Your org name is public. Salaries never are.">
      <form
        className="flex flex-col gap-4 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <div className="flex-1">
          <Field label="Organisation name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Labs" maxLength={64} required />
          </Field>
        </div>
        <Button type="submit" disabled={!name.trim() || tx.busy}>
          Create organisation
        </Button>
      </form>
      {!sponsored && balance.data?.value === BigInt(0) && account && (
        <p className="text-caption text-soft-charcoal">
          This wallet has no ETH for gas. Send it a little Base Sepolia ETH (0.005 is plenty):{" "}
          <span className="break-all font-mono">{account}</span>
        </p>
      )}
      <TxStatus stage={tx.stage} error={tx.error} txHash={tx.hash} />
    </Panel>
  );
}
