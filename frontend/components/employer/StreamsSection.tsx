"use client";

import { useCofheClient } from "@cofhe/react";
import { useState } from "react";
import { decodeEventLog, isAddress, type Address } from "viem";
import { useReadContract } from "wagmi";
import { shortAddress } from "@/components/AuthButton";
import { Field, Input, Panel, PillPicker } from "@/components/forms";
import { SecretValue } from "@/components/SecretValue";
import { TxStatus } from "@/components/TxStatus";
import { Badge, Button } from "@/components/ui";
import { useDayze } from "@/hooks/useDayze";
import { useTx } from "@/hooks/useTx";
import { DayzePayrollAbi, HumanRegistryAbi } from "@/lib/contracts/abis";
import { encryptUint64 } from "@/lib/fhe";
import { notifyStreamPayee } from "@/lib/notify";
import { parseConfidential, type TokenKey } from "@/lib/tokens";
import { JoinRequestsList } from "./JoinRequestsList";
import { StreamStatus, statusLabel, useResolvePolicy, useStreamsOfPayer } from "./streams";

/** "✓ verified human" or "not verified", from HumanRegistry (07a). A hint against ghost employees, not a block. */
export function HumanBadge({ address }: { address: Address | undefined }) {
  const { d } = useDayze();
  const { data } = useReadContract({
    address: d?.humanRegistry,
    abi: HumanRegistryAbi,
    functionName: "isHuman",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!d },
  });
  if (data === undefined) return null;
  return data ? (
    <span className="rounded-lg bg-gloss-black px-2 py-0.5 text-caption text-gloss-white">✓ verified human</span>
  ) : (
    <span className="rounded-lg border-[1.5px] border-gloss-black/20 px-2 py-0.5 text-caption text-soft-charcoal">
      not verified
    </span>
  );
}

const inviteKey = (payer: string) => `dayze:invite-copied:${payer.toLowerCase()}`;

/** Whether this employer copied their invite link before (a UX hint only) */
export function inviteCopied(payer: string | undefined): boolean {
  if (!payer) return false;
  try {
    return localStorage.getItem(inviteKey(payer)) === "1";
  } catch {
    return false;
  }
}

/** Copies `<app>/onboarding/employee?org=<payer>`. The link holds only the org address. */
export function InviteLink({ onCopied }: { onCopied?: () => void }) {
  const { account } = useDayze();
  const [copied, setCopied] = useState(false);
  if (!account || typeof window === "undefined") return null;
  const link = `${window.location.origin}/onboarding/employee?org=${account}`;

  const copy = async () => {
    await navigator.clipboard.writeText(link);
    try {
      localStorage.setItem(inviteKey(account), "1");
    } catch {}
    setCopied(true);
    onCopied?.();
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-gloss-white p-5">
      <span className="text-caption text-mid-grey">Invite link: no salary, no secret, just your org</span>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <code className="flex-1 truncate font-mono text-caption">{link}</code>
        <Button variant="outline" onClick={copy}>
          {copied ? "✓ Copied" : "Copy invite link"}
        </Button>
      </div>
    </div>
  );
}

/**
 * §5 Streams: invite, create a stream, and the streams table.
 * @param initialPayee From a worker's "pay me" link (/employer?payee=0x…): pre-fills the New stream form
 */
export function StreamsSection({ initialPayee }: { initialPayee?: string }) {
  // A join request's "Set salary" (or a pay-me link) pre-fills New stream. Keyed so the form takes the new value.
  const [prefill, setPrefill] = useState(initialPayee);
  return (
    <Panel
      title="Salary streams"
      help="Each salary is encrypted in your browser. It accrues every second once the stream is active."
    >
      <InviteLink />
      <JoinRequestsList
        onSetSalary={(employee) => {
          setPrefill(employee);
          document.getElementById("new-stream")?.scrollIntoView({ behavior: "smooth", block: "center" });
        }}
      />
      <CreateStreamForm key={prefill ?? "new"} initialPayee={prefill} />
      <StreamsTable />
    </Panel>
  );
}

function CreateStreamForm({ initialPayee }: { initialPayee?: string }) {
  const { d, tokens, chainId } = useDayze();
  const cofhe = useCofheClient();
  const tx = useTx();
  const resolve = useResolvePolicy(tx);
  const [payee, setPayee] = useState(initialPayee && isAddress(initialPayee) ? initialPayee : "");
  const [key, setKey] = useState<TokenKey>(tokens[0]?.key ?? "cusdc");
  const [monthly, setMonthly] = useState("");
  const [outcome, setOutcome] = useState<string>();
  const token = tokens.find((t) => t.key === key);

  let parsed: bigint | undefined;
  try {
    parsed = monthly ? parseConfidential(monthly) : undefined;
  } catch {
    parsed = undefined;
  }
  const payeeOk = isAddress(payee.trim());
  const valid = payeeOk && !!token && parsed !== undefined && parsed > BigInt(0);

  const create = async () => {
    setOutcome(undefined);
    const receipt = await tx.run(
      async () => {
        const { handle, proof } = await encryptUint64(cofhe, parsed!, d!.payroll);
        return {
          address: d!.payroll,
          abi: DayzePayrollAbi,
          functionName: "createStream",
          args: [payee.trim() as Address, token!.wrapper, handle, proof],
        };
      },
      { encrypts: true, keepOpen: true },
    );
    if (!receipt) return;

    // The new id is in the StreamCreated event
    const created = receipt.logs
      .map((log) => {
        try {
          return decodeEventLog({ abi: DayzePayrollAbi, data: log.data, topics: log.topics });
        } catch {
          return undefined;
        }
      })
      .find((e) => e?.eventName === "StreamCreated");
    const id = created && "id" in created.args ? (created.args.id as bigint) : undefined;
    if (id === undefined) {
      tx.setStage("done");
      return;
    }

    const needsApproval = await resolve(id);
    if (needsApproval === undefined) return;
    notifyStreamPayee(chainId, id);
    setOutcome(
      needsApproval
        ? `Stream #${id} is above your hidden threshold. It's waiting for approvals.`
        : `Stream #${id} is active and paying by the second.`,
    );
    setPayee("");
    setMonthly("");
  };

  return (
    <form
      id="new-stream"
      className="flex flex-col gap-4 border-t-[1.5px] border-gloss-black pt-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) void create();
      }}
    >
      <h3 className="text-body">New stream</h3>
      <div className="grid gap-4 md:grid-cols-[1.4fr_auto_1fr]">
        <Field label="Employee wallet" hint={payeeOk ? <HumanBadge address={payee.trim() as Address} /> : "They send it to you after signing up."}>
          <Input value={payee} onChange={(e) => setPayee(e.target.value)} placeholder="0x…" spellCheck={false} />
        </Field>
        <Field label="Token">
          <PillPicker options={tokens.map((t) => ({ value: t.key, label: t.symbol }))} value={key} onChange={setKey} />
        </Field>
        <Field label={`Monthly salary (${token?.symbol ?? ""})`} hint="Encrypted before it leaves your browser.">
          <Input inputMode="decimal" value={monthly} onChange={(e) => setMonthly(e.target.value)} placeholder="3000" />
        </Field>
      </div>
      <div>
        <Button type="submit" disabled={!valid || tx.busy}>
          Start stream
        </Button>
      </div>
      {tx.stage === "fhe-processing" && <p className="text-caption">Checking policy privately…</p>}
      <TxStatus stage={tx.stage} error={tx.error} txHash={tx.hash} />
      {outcome && <p className="text-caption">{outcome}</p>}
    </form>
  );
}

function StreamsTable() {
  const { d, tokens } = useDayze();
  const { rows, isLoading } = useStreamsOfPayer();
  const tx = useTx();
  const resolve = useResolvePolicy(tx);
  const symbolOf = (wrapper: Address) => tokens.find((t) => t.wrapper.toLowerCase() === wrapper.toLowerCase())?.symbol ?? "?";

  if (isLoading) return <p className="text-caption text-mid-grey">Loading streams…</p>;
  if (rows.length === 0) return <p className="text-caption text-mid-grey">No streams yet.</p>;

  const cancel = (id: bigint) =>
    tx.run(() => ({ address: d!.payroll, abi: DayzePayrollAbi, functionName: "cancelStream", args: [id] }));

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-caption">
          <thead className="text-mid-grey">
            <tr>
              {["#", "Employee", "Token", "Status", "Monthly", "Started", ""].map((h) => (
                <th key={h} className="pb-3 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={String(s.id)} className="border-t-[1.5px] border-gloss-black/10">
                <td className="py-3">{String(s.id)}</td>
                <td className="py-3">
                  <div className="flex flex-col gap-1">
                    <span className="font-mono" title={s.payee}>
                      {shortAddress(s.payee)}
                    </span>
                    <HumanBadge address={s.payee} />
                  </div>
                </td>
                <td className="py-3">{symbolOf(s.token)}</td>
                <td className="py-3">
                  <Badge>{statusLabel[s.status]}</Badge>
                </td>
                <td className="py-3">
                  <SecretValue handle={s.monthly} unit={symbolOf(s.token)} />
                </td>
                <td className="py-3">
                  {s.startTime > BigInt(0) ? new Date(Number(s.startTime) * 1000).toLocaleString() : "—"}
                </td>
                <td className="py-3 text-right">
                  <div className="flex justify-end gap-2">
                    {s.status === StreamStatus.AwaitingPolicy && (
                      <Button variant="outline" disabled={tx.busy} onClick={() => void resolve(s.id)} className="!px-3 !py-1 text-caption">
                        Check policy
                      </Button>
                    )}
                    {s.status !== StreamStatus.Cancelled && (
                      <Button variant="outline" disabled={tx.busy} onClick={() => void cancel(s.id)} className="!px-3 !py-1 text-caption">
                        Cancel
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <TxStatus stage={tx.stage} error={tx.error} txHash={tx.hash} />
    </div>
  );
}
