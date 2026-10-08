"use client";

import { useCofheClient } from "@cofhe/react";
import { useState } from "react";
import { formatUnits, type Hex } from "viem";
import { useReadContract } from "wagmi";
import { Field, Input, Panel, PillPicker, Stat } from "@/components/forms";
import { SecretValue } from "@/components/SecretValue";
import { TxStatus } from "@/components/TxStatus";
import { Button } from "@/components/ui";
import { useDayze } from "@/hooks/useDayze";
import { useTx } from "@/hooks/useTx";
import { ConfidentialTokenAbi } from "@/lib/contracts/abis";
import { decryptForTx } from "@/lib/fhe";
import { parseConfidential, toUnderlying, type ConfidentialTokenInfo, type TokenKey } from "@/lib/tokens";

type Claim = { id: Hex; to: `0x${string}`; ctHash: Hex; decryptedAmount: bigint; claimed: boolean };

/** §3 Cash out: unshield a confidential balance back to USDC, ARB or ETH */
export function CashOutSection() {
  const { tokens } = useDayze();
  const [key, setKey] = useState<TokenKey>(tokens[0]?.key ?? "cusdc");
  const token = tokens.find((t) => t.key === key) ?? tokens[0];
  if (!token) return null;
  return (
    <Panel
      title="Wallet and cash out"
      help="Withdrawals land in your confidential balance. Cash out to turn it back into the plain token."
      aside={<PillPicker options={tokens.map((t) => ({ value: t.key, label: t.symbol }))} value={token.key} onChange={setKey} />}
    >
      <TokenCashOut key={token.key} token={token} />
    </Panel>
  );
}

function TokenCashOut({ token }: { token: ConfidentialTokenInfo }) {
  const { account } = useDayze();
  const cofhe = useCofheClient();
  const tx = useTx();
  const [amount, setAmount] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);

  const balance = useReadContract({
    address: token.wrapper,
    abi: ConfidentialTokenAbi,
    functionName: "confidentialBalanceOf",
    args: account ? [account] : undefined,
    query: { enabled: !!account },
  });
  const claims = useReadContract({
    address: token.wrapper,
    abi: ConfidentialTokenAbi,
    functionName: "getUserClaims",
    args: account ? [account] : undefined,
    query: { enabled: !!account },
  });
  const pending = ((claims.data ?? []) as readonly Claim[]).filter((c) => !c.claimed);

  let units: bigint | undefined;
  try {
    units = amount ? parseConfidential(amount) : undefined;
  } catch {
    units = undefined;
  }

  /** Decrypts a claim's burned amount for the tx, then claims it */
  const claim = async (c: Claim) => {
    setStep(2);
    tx.setStage("fhe-processing");
    let result: { value: bigint; signature: Hex } | undefined;
    for (let attempt = 0; attempt < 20 && !result; attempt++) {
      try {
        result = await decryptForTx(cofhe, c.ctHash);
      } catch {
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
    if (!result) {
      tx.setError("The cash-out amount isn't ready to decrypt yet. Try Claim again in a minute.");
      tx.setStage("error");
      return;
    }
    setStep(3);
    await tx.run(() => ({
      address: token.wrapper,
      abi: ConfidentialTokenAbi,
      functionName: "claimUnshielded",
      args: [c.id, result.value, result.signature],
    }));
    void claims.refetch();
  };

  const cashOut = async () => {
    setConfirming(false);
    if (!units) return;
    setStep(1);
    const receipt = await tx.run(
      () => ({
        address: token.wrapper,
        abi: ConfidentialTokenAbi,
        functionName: "unshield",
        args: [account!, account!, units!],
      }),
      { keepOpen: true },
    );
    if (!receipt) return;
    const fresh = await claims.refetch();
    const newest = ((fresh.data ?? []) as readonly Claim[]).filter((c) => !c.claimed).at(-1);
    if (newest) await claim(newest);
    setAmount("");
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Stat label={`Your ${token.symbol}`}>
          <SecretValue handle={balance.data} unit={token.symbol} />
        </Stat>
      </div>

      <form
        className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          if (units) setConfirming(true);
        }}
      >
        <Field
          label={`Cash out (${token.symbol})`}
          hint={units ? `You'll receive ${formatUnits(toUnderlying(token, units), token.underlyingDecimals)} ${token.underlyingSymbol}.` : undefined}
        >
          <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="100" />
        </Field>
        <Button type="submit" variant="outline" disabled={!units || tx.busy}>
          Cash out
        </Button>
      </form>

      {step > 0 && (
        <ol className="grid grid-cols-3 gap-2 text-caption">
          {["Unshield", "Decrypt", "Claim"].map((label, i) => (
            <li key={label} className="flex flex-col gap-2">
              <span className={`h-1.5 rounded-pill ${i + 1 < step || (i + 1 === step && tx.stage === "done") ? "bg-gloss-black" : i + 1 === step ? "animate-pulse bg-gloss-black/60" : "bg-gloss-black/10"}`} />
              {label}
            </li>
          ))}
        </ol>
      )}
      <TxStatus stage={tx.stage} error={tx.error} txHash={tx.hash} />

      {pending.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-caption text-mid-grey">Unfinished cash-outs</span>
          {pending.map((c) => (
            <div key={c.id} className="flex items-center justify-between border-t-[1.5px] border-gloss-black/10 py-3">
              <span className="font-mono text-caption">{c.id.slice(0, 10)}…</span>
              <Button variant="outline" disabled={tx.busy} onClick={() => void claim(c)} className="!px-4 !py-1.5 text-caption">
                Claim
              </Button>
            </div>
          ))}
        </div>
      )}

      {confirming && (
        <div role="dialog" aria-modal className="fixed inset-0 z-50 flex items-center justify-center bg-gloss-black/60 p-6">
          <div className="flex max-w-md flex-col gap-5 rounded-3xl bg-pure-white p-8">
            <h3 className="text-heading-sm">Cashing out is public</h3>
            <p className="text-soft-charcoal">
              Cashing out reveals this amount publicly onchain: {amount} {token.symbol} becomes{" "}
              {units ? formatUnits(toUnderlying(token, units), token.underlyingDecimals) : ""} {token.underlyingSymbol} in your
              wallet, and anyone can see it. Your salary and other withdrawals stay private.
            </p>
            <div className="flex gap-3">
              <Button onClick={() => void cashOut()}>Cash out publicly</Button>
              <Button variant="outline" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
