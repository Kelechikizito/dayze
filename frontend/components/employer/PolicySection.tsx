"use client";

import { useCofheClient } from "@cofhe/react";
import { useState } from "react";
import { isAddress, type Address } from "viem";
import { useReadContract, useReadContracts } from "wagmi";
import { shortAddress } from "@/components/AuthButton";
import { Field, Input, Panel, Stat } from "@/components/forms";
import { TxStatus } from "@/components/TxStatus";
import { Button } from "@/components/ui";
import { useDayze } from "@/hooks/useDayze";
import { useTx } from "@/hooks/useTx";
import { ApprovalPolicyAbi } from "@/lib/contracts/abis";
import { encryptUint64 } from "@/lib/fhe";
import { parseConfidential, type ConfidentialTokenInfo } from "@/lib/tokens";

/** Reads the connected employer's policy */
export function usePolicy() {
  const { account, d } = useDayze();
  const enabled = !!account && !!d;
  const base = { address: d?.approvalPolicy, abi: ApprovalPolicyAbi } as const;
  const hasPolicy = useReadContract({ ...base, functionName: "hasPolicy", args: account ? [account] : undefined, query: { enabled } });
  const approvers = useReadContract({ ...base, functionName: "approversOf", args: account ? [account] : undefined, query: { enabled } });
  const required = useReadContract({ ...base, functionName: "required", args: account ? [account] : undefined, query: { enabled } });
  return {
    hasPolicy: hasPolicy.data ?? false,
    approvers: (approvers.data ?? []) as readonly Address[],
    required: required.data ?? 0,
  };
}

/** §3 Policy: k-of-n approvers, and an encrypted monthly threshold per token */
export function PolicySection() {
  const { d, account, tokens } = useDayze();
  const { hasPolicy, approvers, required } = usePolicy();
  const thresholds = useReadContracts({
    contracts: tokens.map((t) => ({
      address: d?.approvalPolicy,
      abi: ApprovalPolicyAbi,
      functionName: "hasThreshold" as const,
      args: [account!, t.wrapper] as const,
    })),
    query: { enabled: !!account && !!d },
  });

  return (
    <Panel
      title="Approval rules"
      help="Salaries above a token's hidden threshold wait for approvals before they start. Nobody can see the threshold, not even approvers."
    >
      {hasPolicy && (
        <div>
          <Stat label="Approvers">
            {required} of {approvers.length}: {approvers.map((a) => shortAddress(a)).join(", ")}
          </Stat>
          {tokens.map((t, i) => {
            const set = thresholds.data?.[i]?.result === true;
            return (
              <Stat key={t.key} label={`${t.symbol} threshold`}>
                {set ? "🔒 encrypted" : <span className="text-soft-charcoal">not set: every {t.symbol} salary needs approval</span>}
              </Stat>
            );
          })}
        </div>
      )}
      {/* Keyed so the form refills once the chain read arrives */}
      <ApproversForm key={`${approvers.join()}-${required}`} current={approvers} currentRequired={required} />
      {hasPolicy && (
        <div className="grid gap-6 md:grid-cols-3">
          {tokens.map((t) => (
            <ThresholdForm key={t.key} token={t} />
          ))}
        </div>
      )}
    </Panel>
  );
}

function ApproversForm({ current, currentRequired }: { current: readonly Address[]; currentRequired: number }) {
  const { d } = useDayze();
  const tx = useTx();
  const [text, setText] = useState(() => current.join("\n"));
  const [required, setRequired] = useState(String(currentRequired || 1));

  const list = Array.from(new Set(text.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean)));
  const invalid = list.filter((a) => !isAddress(a));
  const k = Number(required);
  const valid = list.length > 0 && list.length <= 10 && invalid.length === 0 && k >= 1 && k <= list.length;

  const save = () =>
    tx.run(() => ({
      address: d!.approvalPolicy,
      abi: ApprovalPolicyAbi,
      functionName: "setPolicy",
      args: [list as Address[], k],
    }));

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) void save();
      }}
    >
      <div className="grid gap-4 md:grid-cols-[1fr_160px]">
        <Field
          label="Approvers (one address per line, up to 10)"
          hint={invalid.length > 0 ? `Not an address: ${invalid[0]}` : "Saving replaces the list and clears approvals in progress."}
        >
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            spellCheck={false}
            placeholder={"0x…\n0x…"}
            className="w-full rounded-input border-[1.5px] border-gloss-black/20 px-4 py-3 font-mono text-caption outline-none focus:border-gloss-black"
          />
        </Field>
        <Field label="Required approvals">
          <Input type="number" min={1} max={Math.max(1, list.length)} value={required} onChange={(e) => setRequired(e.target.value)} />
        </Field>
      </div>
      <div>
        <Button type="submit" disabled={!valid || tx.busy}>
          Save approvers
        </Button>
      </div>
      <TxStatus stage={tx.stage} error={tx.error} txHash={tx.hash} />
    </form>
  );
}

function ThresholdForm({ token }: { token: ConfidentialTokenInfo }) {
  const { d } = useDayze();
  const cofhe = useCofheClient();
  const tx = useTx();
  const [value, setValue] = useState("");
  let parsed: bigint | undefined;
  try {
    parsed = value ? parseConfidential(value) : undefined;
  } catch {
    parsed = undefined;
  }

  const save = () =>
    tx.run(
      async () => {
        const { handle, proof } = await encryptUint64(cofhe, parsed!, d!.approvalPolicy);
        return {
          address: d!.approvalPolicy,
          abi: ApprovalPolicyAbi,
          functionName: "setThreshold",
          args: [token.wrapper, handle, proof],
        };
      },
      { encrypts: true },
    );

  return (
    <form
      className="flex flex-col gap-3 border-t-[1.5px] border-gloss-black pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (parsed !== undefined) void save().then((r) => r && setValue(""));
      }}
    >
      <Field label={`${token.symbol} monthly threshold`} hint="Encrypted in your browser before it's sent.">
        <Input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="10000" />
      </Field>
      <div>
        <Button type="submit" variant="outline" disabled={parsed === undefined || tx.busy}>
          Set {token.symbol} threshold
        </Button>
      </div>
      <TxStatus stage={tx.stage} error={tx.error} txHash={tx.hash} />
    </form>
  );
}
