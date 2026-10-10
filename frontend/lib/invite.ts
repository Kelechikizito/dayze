import type { Address } from "viem";

/*
 * Email invites. The employer signs this exact message (no gas) so the server can prove the invite
 * comes from a wallet that has an org, and isn't someone using Dayze's sender to spam.
 */

/** How long a signed invite request is accepted, in seconds */
export const INVITE_TTL_SECONDS = 10 * 60;

/** The message the employer signs. Server and client must build it identically. */
export function inviteMessage(org: Address, email: string, chainId: number, issuedAt: number): string {
  return [
    "Dayze: send a payroll invite",
    `Org: ${org.toLowerCase()}`,
    `Email: ${email.trim().toLowerCase()}`,
    `Chain: ${chainId}`,
    `Issued at: ${issuedAt}`,
  ].join("\n");
}

/** A deliberately simple check: something@something.tld, no spaces */
export function looksLikeEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}
