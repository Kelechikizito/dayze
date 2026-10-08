import { formatUnits, parseUnits, type Address } from "viem";
import { addresses } from "./contracts/addresses";

/*
 * The three confidential wrappers. Every confidential amount (balances, salaries, vaults,
 * withdrawals) is in 6-decimal units. `rate` converts: underlying = units * rate.
 * cUSDC: USDC has 6 decimals, rate 1. cARB and cETH: 18 decimals, rate 1e12.
 * Shielding drops anything below one unit ("dust") back to the sender.
 */

/** Decimals of every confidential amount */
export const CONFIDENTIAL_DECIMALS = 6;

export type TokenKey = "cusdc" | "carb" | "ceth";

export type ConfidentialTokenInfo = {
  key: TokenKey;
  symbol: string;
  underlyingSymbol: string;
  underlyingDecimals: number;
  /** Underlying wei per confidential unit */
  rate: bigint;
  /** True for cETH: shield with native ETH, not an ERC20 approve */
  native: boolean;
  wrapper: Address;
  /** The ERC20 the wrapper holds; for cETH, the chain's WETH is internal to the wrapper */
  underlying?: Address;
};

const META: Record<TokenKey, Omit<ConfidentialTokenInfo, "wrapper" | "underlying">> = {
  cusdc: { key: "cusdc", symbol: "cUSDC", underlyingSymbol: "USDC", underlyingDecimals: 6, rate: BigInt(1), native: false },
  carb: { key: "carb", symbol: "cARB", underlyingSymbol: "ARB", underlyingDecimals: 18, rate: BigInt(1e12), native: false },
  ceth: { key: "ceth", symbol: "cETH", underlyingSymbol: "ETH", underlyingDecimals: 18, rate: BigInt(1e12), native: true },
};

type DeploymentRecord = Partial<Record<string, string | number>>;

/**
 * Returns the wrappers deployed on a chain, or [] before deploy.
 * @param chainId The connected chain
 */
export function tokensFor(chainId: number | undefined): ConfidentialTokenInfo[] {
  const d = (addresses as Record<string, DeploymentRecord>)[String(chainId)];
  if (!d) return [];
  const underlyingOf: Record<TokenKey, string | undefined> = { cusdc: "usdc", carb: "arb", ceth: undefined };
  return (Object.keys(META) as TokenKey[])
    .filter((k) => typeof d[k] === "string")
    .map((k) => ({
      ...META[k],
      wrapper: d[k] as Address,
      underlying: underlyingOf[k] ? (d[underlyingOf[k]!] as Address) : undefined,
    }));
}

/** Parses a user-typed amount ("1500.25") into confidential units */
export function parseConfidential(value: string): bigint {
  return parseUnits(value, CONFIDENTIAL_DECIMALS);
}

/** Formats confidential units for display */
export function formatConfidential(units: bigint): string {
  return formatUnits(units, CONFIDENTIAL_DECIMALS);
}

/**
 * Converts an underlying amount to confidential units, rounding down like the wrapper does.
 * @returns units, and the dust the wrapper would refund
 */
export function toConfidentialUnits(token: ConfidentialTokenInfo, underlyingAmount: bigint) {
  const units = underlyingAmount / token.rate;
  return { units, dust: underlyingAmount - units * token.rate };
}

/** Converts confidential units to the underlying amount */
export function toUnderlying(token: ConfidentialTokenInfo, units: bigint): bigint {
  return units * token.rate;
}

/** Whether Dayze is deployed on a chain */
export function isDeployedOn(chainId: number | undefined): boolean {
  return chainId !== undefined && String(chainId) in addresses;
}
