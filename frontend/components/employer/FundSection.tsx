"use client";

import { useCofheClient } from "@cofhe/react";
import { useState } from "react";
import { formatUnits, maxUint256, parseUnits, type Address } from "viem";
import { useBalance, useReadContract, useReadContracts } from "wagmi";
import { Field, Input, Panel, PillPicker, Stat } from "@/components/forms";
import { SecretValue } from "@/components/SecretValue";
import { TxStatus } from "@/components/TxStatus";
import { Button } from "@/components/ui";
import { useDayze } from "@/hooks/useDayze";
import { useTx } from "@/hooks/useTx";
import { ConfidentialNativeAbi, ConfidentialTokenAbi, DayzePayrollAbi, ERC20_HarnessAbi } from "@/lib/contracts/abis";
import { encryptUint64 } from "@/lib/fhe";
import { parseConfidential, type ConfidentialTokenInfo, type TokenKey } from "@/lib/tokens";

const OPERATOR_FOREVER = 2 ** 48 - 1;

/** Whether the connected employer has funded any vault (a non-zero handle) */
export function useHasFundedVault() {
  const { account, d, tokens } = useDayze();
  const { data } = useReadContracts({
    contracts: tokens.map((t) => ({
      address: d?.payroll,
      abi: DayzePayrollAbi,
      functionName: "vaultOf" as const,
      args: [account!, t.wrapper] as const,
    })),
    query: { enabled: !!account && !!d },
  });
  return (data ?? []).some((r) => r.status === "success" && BigInt(r.result as string) !== BigInt(0));
}

/** §2 Fund: shield public tokens, let payroll pull them, then move them into the private vault */
export function FundSection() {
  const { tokens } = useDayze();
  const [key, setKey] = useState<TokenKey>(tokens[0]?.key ?? "cusdc");
  const token = tokens.find((t) => t.key === key) ?? tokens[0];
  if (!token) return null;

  return (
    <Panel
      title="Payroll vault"
      help="Shield tokens and move them into your private payroll vault. Deposits are public. Individual salaries stay private."
      aside={
        <PillPicker
          options={tokens.map((t) => ({ value: t.key, label: t.symbol }))}
          value={token.key}
          onChange={setKey}
        />
      }
    >
      <TokenFunding key={token.key} token={token} />
    </Panel>
  );
}

function TokenFunding({ token }: { token: ConfidentialTokenInfo }) {
  const { account, d } = useDayze();
  const cofhe = useCofheClient();
  const tx = useTx();
  const [shieldAmount, setShieldAmount] = useState("");
  const [fundAmount, setFundAmount] = useState("");

  // Public balance: native ETH for cETH, the ERC20 otherwise
  const nativeBalance = useBalance({ address: account, query: { enabled: token.native && !!account } });
  const erc20Balance = useReadContract({
    address: token.underlying,
    abi: ERC20_HarnessAbi,
    functionName: "balanceOf",
    args: account ? [account] : undefined,
    query: { enabled: !token.native && !!account && !!token.underlying },
  });
  const allowance = useReadContract({
    address: token.underlying,
    abi: ERC20_HarnessAbi,
    functionName: "allowance",
    args: account ? [account, token.wrapper] : undefined,
    query: { enabled: !token.native && !!account && !!token.underlying },
  });
  const publicBalance = token.native ? nativeBalance.data?.value : erc20Balance.data;

  const walletHandle = useReadContract({
    address: token.wrapper,
    abi: ConfidentialTokenAbi,
    functionName: "confidentialBalanceOf",
    args: account ? [account] : undefined,
    query: { enabled: !!account },
  });
  const vaultHandle = useReadContract({
    address: d?.payroll,
    abi: DayzePayrollAbi,
    functionName: "vaultOf",
    args: account ? [account, token.wrapper] : undefined,
    query: { enabled: !!account && !!d },
  });
  const isOperator = useReadContract({
    address: token.wrapper,
    abi: ConfidentialTokenAbi,
    functionName: "isOperator",
    args: account && d ? [account, d.payroll] : undefined,
    query: { enabled: !!account && !!d },
  });

  const parsedShield = safeParse(shieldAmount, token.underlyingDecimals);
  const parsedFund = safeParse(fundAmount, 6);

  const mintTestTokens = () =>
    tx.run(() => ({
      address: token.underlying!,
      abi: ERC20_HarnessAbi,
      functionName: "mint",
      args: [account!, parseUnits("10000", token.underlyingDecimals)],
    }));

  const shield = async () => {
    if (!parsedShield) return;
    if (token.native) {
      await tx.run(() => ({
        address: token.wrapper,
        abi: ConfidentialNativeAbi,
        functionName: "shieldNative",
        args: [account!],
        value: parsedShield,
      }));
    } else {
      if ((allowance.data ?? BigInt(0)) < parsedShield) {
        const ok = await tx.run(
          () => ({
            address: token.underlying!,
            abi: ERC20_HarnessAbi,
            functionName: "approve",
            args: [token.wrapper, maxUint256],
          }),
          { keepOpen: true },
        );
        if (!ok) return;
      }
      await tx.run(() => ({
        address: token.wrapper,
        abi: ConfidentialTokenAbi,
        functionName: "shield",
        args: [account!, parsedShield],
      }));
    }
    setShieldAmount("");
  };

  const allowPayroll = () =>
    tx.run(() => ({
      address: token.wrapper,
      abi: ConfidentialTokenAbi,
      functionName: "setOperator",
      args: [d!.payroll, OPERATOR_FOREVER],
    }));

  const fund = async () => {
    if (!parsedFund) return;
    const done = await tx.run(
      async () => {
        const { handle, proof } = await encryptUint64(cofhe, parsedFund, d!.payroll);
        return {
          address: d!.payroll,
          abi: DayzePayrollAbi,
          functionName: "fundVault",
          args: [token.wrapper, handle, proof],
        };
      },
      { encrypts: true },
    );
    if (done) setFundAmount("");
  };

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Stat label={`Public ${token.underlyingSymbol}`}>
          {publicBalance === undefined ? "…" : `${trim(formatUnits(publicBalance, token.underlyingDecimals))} ${token.underlyingSymbol}`}
        </Stat>
        <Stat label={`Your ${token.symbol}`}>
          <SecretValue handle={walletHandle.data} unit={token.symbol} />
        </Stat>
        <Stat label="Payroll vault">
          <SecretValue handle={vaultHandle.data} unit={token.symbol} />
        </Stat>
      </div>

      {!token.native && (
        <p className="text-caption text-soft-charcoal">
          Testnet only: need {token.underlyingSymbol}?{" "}
          <button onClick={mintTestTokens} disabled={tx.busy} className="underline underline-offset-4">
            Mint 10,000 test {token.underlyingSymbol}
          </button>
        </p>
      )}

      <ol className="grid gap-6 md:grid-cols-3">
        <Step n={1} title="Shield" help={`Wrap ${token.underlyingSymbol} into ${token.symbol}. This deposit is public.`}>
          <Field label={`Amount of ${token.underlyingSymbol}`}>
            <Input inputMode="decimal" value={shieldAmount} onChange={(e) => setShieldAmount(e.target.value)} placeholder="5000" />
          </Field>
          <Button onClick={shield} disabled={!parsedShield || tx.busy}>
            Shield
          </Button>
        </Step>

        <Step n={2} title="Allow payroll" help={`Let payroll pull ${token.symbol} into your vault. Once per token.`}>
          {isOperator.data ? (
            <p className="text-caption">✓ Payroll can pull your {token.symbol}</p>
          ) : (
            <Button variant="outline" onClick={allowPayroll} disabled={tx.busy}>
              Allow payroll
            </Button>
          )}
        </Step>

        <Step n={3} title="Fund vault" help="Encrypted in your browser. Funding more than you hold moves 0, silently.">
          <Field label={`Amount of ${token.symbol}`}>
            <Input inputMode="decimal" value={fundAmount} onChange={(e) => setFundAmount(e.target.value)} placeholder="5000" />
          </Field>
          <Button onClick={fund} disabled={!parsedFund || !isOperator.data || tx.busy}>
            Fund privately
          </Button>
        </Step>
      </ol>

      <TxStatus stage={tx.stage} error={tx.error} txHash={tx.hash} />
    </div>
  );
}

function Step({ n, title, help, children }: { n: number; title: string; help: string; children: React.ReactNode }) {
  return (
    <li className="flex flex-col gap-3 border-t-[1.5px] border-gloss-black pt-4">
      <span className="text-caption text-mid-grey">0{n}</span>
      <h3 className="text-body">{title}</h3>
      <p className="text-caption text-soft-charcoal">{help}</p>
      {children}
    </li>
  );
}

/** Parses a typed amount, or undefined if it's empty, invalid or zero */
function safeParse(value: string, decimals: number): bigint | undefined {
  try {
    const v = decimals === 6 ? parseConfidential(value) : parseUnits(value, decimals);
    return v > BigInt(0) ? v : undefined;
  } catch {
    return undefined;
  }
}

/** Drops trailing zeros: "10000.000000" → "10000" */
function trim(s: string) {
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
}

export type { Address };
