"use client";

import { useCofheClient } from "@cofhe/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { isAddress, type Address, type Hex } from "viem";
import { usePublicClient } from "wagmi";
import { shortAddress } from "@/components/AuthButton";
import { scanAllStreams, StreamStatus, statusLabel, type StreamRow } from "@/components/employer/streams";
import { Field, Input, Panel, PillPicker } from "@/components/forms";
import { Button } from "@/components/ui";
import { useDayze } from "@/hooks/useDayze";
import { useEnsureACP } from "@/hooks/useEnsureACP";
import { shortError } from "@/hooks/useTx";
import { AuditRegistryAbi, DayzePayrollAbi } from "@/lib/contracts/abis";
import { isUnsetHandle, unsealUint64 } from "@/lib/fhe";
import { formatConfidential } from "@/lib/tokens";

/** A decrypted amount, or why there isn't one */
type Cell = bigint | "no-access" | "pending";

type Books = {
  orgName: string;
  streams: StreamRow[];
  vaults: { symbol: string; handle: Hex }[];
};

/**
 * The auditor view (12 B). Lists the orgs that appointed the connected wallet, then unseals that org's
 * salaries, withdrawals and vaults in the browser. The CSV is built locally: this page uploads nothing.
 */
export function AuditorView() {
  const { account, d } = useDayze();
  const publicClient = usePublicClient();
  const [typed, setTyped] = useState("");
  const [picked, setPicked] = useState<Address>();

  // Orgs that name me as auditor. No index of "orgs I audit" and no log search (RPC block-range caps),
  // so it checks every employer that has a stream. One with no streams yet: type its address below.
  const appointed = useQuery({
    queryKey: ["audit-orgs", d?.auditRegistry, account],
    enabled: !!publicClient && !!account && !!d,
    queryFn: async () => {
      const streams = await scanAllStreams(publicClient!, d!.payroll);
      const payers = [...new Set(streams.map((s) => s.payer))];
      const rows = await Promise.all(
        payers.map(async (payer) => {
          const [still, org] = await Promise.all([
            publicClient!.readContract({ address: d!.auditRegistry, abi: AuditRegistryAbi, functionName: "isAuditor", args: [payer, account!] }),
            publicClient!.readContract({ address: d!.payroll, abi: DayzePayrollAbi, functionName: "orgOf", args: [payer] }),
          ]);
          return still ? { payer, name: org.exists ? org.name : shortAddress(payer) } : undefined;
        }),
      );
      return rows.filter((r): r is { payer: Address; name: string } => !!r);
    },
  });

  const orgs = appointed.data ?? [];
  const payer = picked ?? (orgs.length === 1 ? orgs[0].payer : undefined);

  return (
    <div className="flex flex-col gap-8">
      <Panel title="Organisations you audit" help="An employer adds you as their auditor. You can read their payroll from that moment on.">
        {appointed.isLoading ? (
          <p className="text-caption text-mid-grey">Looking for organisations…</p>
        ) : appointed.error ? (
          <p className="text-caption text-soft-charcoal">Couldn&apos;t look for organisations: {shortError(appointed.error)}</p>
        ) : orgs.length === 0 ? (
          <p className="text-caption text-mid-grey">
            No employer with salary streams has named you yet. Send them your address: {account}. If they have no streams
            yet, enter their address below.
          </p>
        ) : (
          <PillPicker
            options={orgs.map((o) => ({ value: o.payer, label: o.name }))}
            value={payer ?? ("" as Address)}
            onChange={(p) => setPicked(p)}
          />
        )}
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            if (isAddress(typed.trim())) setPicked(typed.trim() as Address);
          }}
        >
          <div className="flex-1">
            <Field label="Or enter an employer's address">
              <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="0x…" />
            </Field>
          </div>
          <Button type="submit" variant="outline" disabled={!isAddress(typed.trim())}>
            Open
          </Button>
        </form>
      </Panel>
      {payer && <OrgBooks key={payer} payer={payer} />}
    </div>
  );
}

/** One org's books: check access, unseal on request, export CSV */
function OrgBooks({ payer }: { payer: Address }) {
  const { account, d, tokens } = useDayze();
  const publicClient = usePublicClient();
  const client = useCofheClient();
  const { ensureACP } = useEnsureACP();
  const [cells, setCells] = useState<Record<string, Cell>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const books = useQuery({
    queryKey: ["audit-books", d?.payroll, payer, account],
    enabled: !!publicClient && !!account && !!d,
    queryFn: async (): Promise<Books & { allowed: boolean }> => {
      const read = publicClient!.readContract;
      const [allowed, org, ids] = await Promise.all([
        read({ address: d!.auditRegistry, abi: AuditRegistryAbi, functionName: "isAuditor", args: [payer, account!] }),
        read({ address: d!.payroll, abi: DayzePayrollAbi, functionName: "orgOf", args: [payer] }),
        read({ address: d!.payroll, abi: DayzePayrollAbi, functionName: "streamsOfPayer", args: [payer] }),
      ]);
      const streams = await Promise.all(
        ids.map(async (id) => ({
          id,
          ...((await read({ address: d!.payroll, abi: DayzePayrollAbi, functionName: "getStream", args: [id] })) as Omit<StreamRow, "id">),
        })),
      );
      const vaults = await Promise.all(
        tokens.map(async (t) => ({
          symbol: t.symbol,
          handle: (await read({ address: d!.payroll, abi: DayzePayrollAbi, functionName: "vaultOf", args: [payer, t.wrapper] })) as Hex,
        })),
      );
      return {
        allowed,
        orgName: org.exists ? org.name : shortAddress(payer),
        streams: streams.reverse(),
        vaults,
      };
    },
  });

  const b = books.data;
  if (books.isLoading) return <p className="text-caption text-mid-grey">Reading {shortAddress(payer)}&apos;s payroll…</p>;
  if (!b) {
    return (
      <p className="text-caption text-soft-charcoal">
        Couldn&apos;t read this payroll{books.error ? `: ${shortError(books.error)}` : "."}
      </p>
    );
  }
  if (!b.allowed) {
    return (
      <Panel title={b.orgName} help="">
        <p className="text-soft-charcoal">You aren&apos;t an auditor for this organisation, so its amounts stay encrypted to you.</p>
      </Panel>
    );
  }

  const symbolOf = (wrapper: Address) => tokens.find((t) => t.wrapper.toLowerCase() === wrapper.toLowerCase())?.symbol ?? "?";

  const unsealAll = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await ensureACP();
      const jobs: [string, Hex][] = [
        ...b.streams.flatMap((s): [string, Hex][] => [
          [`m${s.id}`, s.monthly],
          [`w${s.id}`, s.withdrawn],
        ]),
        ...b.vaults.map((v): [string, Hex] => [`v${v.symbol}`, v.handle]),
      ];
      for (const [key, handle] of jobs) {
        if (isUnsetHandle(handle)) {
          setCells((c) => ({ ...c, [key]: BigInt(0) }));
          continue;
        }
        setCells((c) => ({ ...c, [key]: "pending" }));
        // A handle made before you were added, or after you were removed, isn't readable: that's expected
        const value: Cell = await unsealUint64(client, handle).catch(() => "no-access" as const);
        setCells((c) => ({ ...c, [key]: value }));
      }
    } catch (e) {
      setError(shortError(e));
    } finally {
      setBusy(false);
    }
  };

  // `withdrawn` starts as an encrypted 0 that auditors aren't granted; every withdrawal re-grants it.
  // So if you could read the salary (you were auditor at creation) but not `withdrawn`, nothing was withdrawn yet.
  const withdrawnCell = (s: StreamRow): Cell | undefined => {
    const w = cells[`w${s.id}`];
    return w === "no-access" && typeof cells[`m${s.id}`] === "bigint" ? BigInt(0) : w;
  };
  const show = (cell: Cell | undefined) =>
    cell === undefined ? "••••••" : cell === "pending" ? "decrypting…" : cell === "no-access" ? "🔒 no access" : formatConfidential(cell);
  const csvValue = (cell: Cell | undefined) => (typeof cell === "bigint" ? formatConfidential(cell) : cell === "no-access" ? "no access" : "");

  const exportCsv = () => {
    const header = ["stream", "payee", "token", "status", "monthly", "withdrawn", "started"];
    const rows = b.streams.map((s) => [
      String(s.id),
      s.payee,
      symbolOf(s.token),
      statusLabel[s.status] ?? String(s.status),
      csvValue(cells[`m${s.id}`]),
      csvValue(withdrawnCell(s)),
      s.startTime > BigInt(0) ? new Date(Number(s.startTime) * 1000).toISOString() : "",
    ]);
    const vaultRows = b.vaults.map((v) => [`vault`, payer, v.symbol, "", "", "", "", csvValue(cells[`v${v.symbol}`])]);
    const csv = [
      header,
      ...rows,
      [],
      ["vault", "payer", "token", "", "", "", "", "balance"],
      ...vaultRows,
    ]
      .map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    // Built and saved in the browser: no request leaves this page
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${b.orgName.replace(/[^\w-]+/g, "-")}-payroll.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Panel title={b.orgName} help="Amounts are decrypted in your browser. Only what you were granted can be read.">
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => void unsealAll()} disabled={busy}>
          {busy ? "Decrypting…" : "Decrypt the books"}
        </Button>
        <Button variant="outline" onClick={exportCsv} disabled={busy}>
          Export CSV
        </Button>
      </div>
      <p className="text-caption text-soft-charcoal">The CSV is made on your computer. Nothing is uploaded.</p>
      {error && <p className="text-caption text-soft-charcoal">Couldn&apos;t decrypt: {error}</p>}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left">
          <thead className="text-caption text-mid-grey">
            <tr>
              <th className="py-2 font-normal">#</th>
              <th className="py-2 font-normal">Employee</th>
              <th className="py-2 font-normal">Token</th>
              <th className="py-2 font-normal">Status</th>
              <th className="py-2 font-normal">Monthly</th>
              <th className="py-2 font-normal">Withdrawn</th>
            </tr>
          </thead>
          <tbody>
            {b.streams.length === 0 ? (
              <tr>
                <td colSpan={6} className="border-t-[1.5px] border-gloss-black/10 py-4 text-caption text-mid-grey">
                  No salary streams yet.
                </td>
              </tr>
            ) : (
              b.streams.map((s) => (
                <tr key={String(s.id)} className="border-t-[1.5px] border-gloss-black/10">
                  <td className="py-3">{String(s.id)}</td>
                  <td className="py-3 font-mono text-caption">{shortAddress(s.payee)}</td>
                  <td className="py-3">{symbolOf(s.token)}</td>
                  <td className="py-3">{s.status === StreamStatus.None ? "—" : statusLabel[s.status]}</td>
                  <td className="py-3 tabular-nums">{show(cells[`m${s.id}`])}</td>
                  <td className="py-3 tabular-nums">{show(withdrawnCell(s))}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-x-8 gap-y-2">
        {b.vaults.map((v) => (
          <span key={v.symbol} className="text-caption">
            {v.symbol} vault: <span className="tabular-nums">{show(cells[`v${v.symbol}`])}</span>
          </span>
        ))}
      </div>
    </Panel>
  );
}
