import type { Address, PublicClient } from "viem";
import { DayzePayrollAbi } from "./contracts/abis";
import { addresses } from "./contracts/addresses";

export type Role = "employer" | "employee";

const ROLE_KEY = "dayze:role";
const onboardedKey = (role: Role) => `dayze:onboarded:${role}`;

/*
 * localStorage holds UX hints only. Losing them is fine: onboarding pages read the chain
 * and skip steps that are already done. Every access is wrapped, since storage can throw
 * in private windows or when site data is blocked.
 */

export function rememberRole(role: Role) {
  try {
    localStorage.setItem(ROLE_KEY, role);
  } catch {}
}

export function rememberedRole(): Role | null {
  try {
    const r = localStorage.getItem(ROLE_KEY);
    return r === "employer" || r === "employee" ? r : null;
  } catch {
    return null;
  }
}

/** Call when an onboarding flow reaches its last step */
export function markOnboarded(role: Role) {
  try {
    localStorage.setItem(onboardedKey(role), "1");
  } catch {}
}

function isOnboarded(role: Role): boolean {
  try {
    return localStorage.getItem(onboardedKey(role)) === "1";
  } catch {
    return false;
  }
}

const homeFor: Record<Role, string> = { employer: "/employer", employee: "/worker" };

/**
 * Where to send a user after login, for the role they picked. The chain wins over local hints:
 * as employer, an org means the console; as employee, streams paying you mean the worker app.
 * Otherwise: that role's onboarding, unless they finished it here before.
 */
export async function destinationAfterLogin(
  role: Role,
  account: Address | undefined,
  publicClient: PublicClient | undefined,
): Promise<string> {
  const chainId = publicClient?.chain?.id;
  const payroll = (addresses as Record<string, { payroll?: Address }>)[String(chainId)]?.payroll;

  if (payroll && account && publicClient) {
    try {
      if (role === "employer") {
        const org = await publicClient.readContract({
          address: payroll,
          abi: DayzePayrollAbi,
          functionName: "orgOf",
          args: [account],
        });
        if (org.exists) return homeFor.employer;
      } else {
        const streams = await publicClient.readContract({
          address: payroll,
          abi: DayzePayrollAbi,
          functionName: "streamsOfPayee",
          args: [account],
        });
        if (streams.length > 0) return homeFor.employee;
      }
    } catch {
      // A failed read falls back to the role hint below
    }
  }

  return isOnboarded(role) ? homeFor[role] : `/onboarding/${role}`;
}
