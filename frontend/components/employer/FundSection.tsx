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
import { formatConfidential, parseConfidential, toConfidentialUnits, type ConfidentialTokenInfo, type TokenKey } from "@/lib/tokens";

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

/** §2 Fund: one amount, one button. Shielding, allowing payroll and funding the vault run behind it. */
export function FundSection() {
  const { tokens } = useDayze();
  const [key, setKey] = useState<TokenKey>(tokens[0]?.key ?? "cusdc");
  const token = tokens.find((t) => t.key === key) ?? tokens[0];
  if (!token) return null;

  return (
    <Panel
      title="Payroll vault"
      help="Add money to pay salaries from. It's encrypted on the way in: the deposit is public, every salary stays private."
      aside={
        <PillPicker
          options={tokens.map((t) => ({ value: t.key, label: t.underlyingSymbol }))}
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
  const [amount, setAmount] = useState("");
  const [progress, setProgress] = useState<string>();

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

  const parsed = safeParse(amount, token.underlyingDecimals);
  // The wrapper keeps whole confidential units and refunds the rest, so fund exactly what lands
  const units = parsed === undefined ? undefined : toConfidentialUnits(token, parsed).units;
  const shortfall = parsed !== undefined && publicBalance !== undefined && parsed > publicBalance ? parsed - publicBalance : BigInt(0);
  // Testnet: top up the mock token instead of sending the employer to a faucet. ETH can't be minted.
  const canMint = !token.native && !!token.underlying;

  /** Mint (testnet) → approve → shield → allow payroll → fund, each only if needed, one click */
  const addFunds = async () => {
    if (!parsed || !units) return;
    const keep = { keepOpen: true };
    const steps: { label: string; run: () => Promise<unknown> }[] = [];

    if (shortfall > BigInt(0) && canMint) {
      steps.push({
        label: `Getting test ${token.underlyingSymbol}`,
        run: () => tx.run(() => ({ address: token.underlying!, abi: ERC20_HarnessAbi, functionName: "mint", args: [account!, shortfall] }), keep),
      });
    }
    if (!token.native && (allowance.data ?? BigInt(0)) < parsed) {
      steps.push({
        label: `Approving ${token.underlyingSymbol}`,
        run: () =>
          tx.run(() => ({ address: token.underlying!, abi: ERC20_HarnessAbi, functionName: "approve", args: [token.wrapper, maxUint256] }), keep),
      });
    }
    steps.push({
      label: "Encrypting your deposit",
      run: () =>
        tx.run(
          () =>
            token.native
              ? { address: token.wrapper, abi: ConfidentialNativeAbi, functionName: "shieldNative", args: [account!], value: parsed }
              : { address: token.wrapper, abi: ConfidentialTokenAbi, functionName: "shield", args: [account!, parsed] },
          keep,
        ),
    });
    if (!isOperator.data) {
      steps.push({
        label: "Connecting it to payroll",
        run: () =>
          tx.run(() => ({ address: token.wrapper, abi: ConfidentialTokenAbi, functionName: "setOperator", args: [d!.payroll, OPERATOR_FOREVER] }), keep),
      });
    }
    steps.push({
      label: "Moving it into your vault",
      run: () =>
        tx.run(
          async () => {
            const { handle, proof } = await encryptUint64(cofhe, units, d!.payroll);
            return { address: d!.payroll, abi: DayzePayrollAbi, functionName: "fundVault", args: [token.wrapper, handle, proof] };
          },
          { encrypts: true },
        ),
    });

    for (const [i, step] of steps.entries()) {
      setProgress(`Step ${i + 1} of ${steps.length}: ${step.label}…`);
      if (!(await step.run())) {
        setProgress(undefined);
        return;
      }
    }
    setProgress(`✓ Added ${formatConfidential(units)} ${token.underlyingSymbol} to your payroll vault.`);
    setAmount("");
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Stat label="Payroll vault">
          <SecretValue handle={vaultHandle.data} unit={token.underlyingSymbol} />
        </Stat>
        <Stat label={`In your wallet`}>
          {publicBalance === undefined ? "…" : `${trim(formatUnits(publicBalance, token.underlyingDecimals))} ${token.underlyingSymbol}`}
        </Stat>
      </div>

      <form
        className="flex flex-col gap-4 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          void addFunds();
        }}
      >
        <div className="flex-1">
          <Field
            label={`Amount (${token.underlyingSymbol})`}
            hint={
              shortfall > BigInt(0)
                ? canMint
                  ? `Testnet: the missing ${trim(formatUnits(shortfall, token.underlyingDecimals))} ${token.underlyingSymbol} is minted for you.`
                  : `You only have ${trim(formatUnits(publicBalance ?? BigInt(0), token.underlyingDecimals))} ${token.underlyingSymbol}.`
                : undefined
            }
          >
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="5000" />
          </Field>
        </div>
        <Button type="submit" disabled={!units || tx.busy || (shortfall > BigInt(0) && !canMint)}>
          Add to payroll
        </Button>
      </form>

      {progress && <p className="text-caption">{progress}</p>}
      <TxStatus stage={tx.stage} error={tx.error} txHash={tx.hash} />
    </div>
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
