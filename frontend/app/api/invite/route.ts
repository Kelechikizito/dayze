import { NextResponse } from "next/server";
import { createPublicClient, http, isAddress, isAddressEqual, isHex, recoverMessageAddress, type Address } from "viem";
import { supportedChains, rpcUrls } from "@/lib/chains";
import { DayzePayrollAbi } from "@/lib/contracts/abis";
import { addresses } from "@/lib/contracts/addresses";
import { INVITE_TTL_SECONDS, inviteMessage, looksLikeEmail } from "@/lib/invite";

/*
 * Emails an invite link on an employer's behalf.
 *
 * - The employer signs inviteMessage(org, email, chain, issuedAt). The server checks the signature
 *   (EOA or smart wallet), that it's fresh, and that the signer has an org onchain. Only real employers
 *   can send, and only as themselves.
 * - The email address is used to send and then forgotten: not stored, not onchain, not in the link.
 * - Rate limits per server instance: 20 invites per org per hour, and no repeat to the same address
 *   within the hour.
 */

const RESEND_URL = "https://api.resend.com/emails";
const PER_ORG_PER_HOUR = 20;
const HOUR_MS = 60 * 60 * 1000;

const sentByOrg = new Map<string, number[]>();
const recent = new Map<string, number>();

export async function POST(request: Request) {
  let body: { org?: unknown; email?: unknown; chainId?: unknown; issuedAt?: unknown; signature?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail("Invalid JSON");
  }
  const { org, email, signature } = body;
  const chainId = Number(body.chainId);
  const issuedAt = Number(body.issuedAt);

  if (typeof org !== "string" || !isAddress(org)) return fail("Invalid org address");
  if (typeof email !== "string" || !looksLikeEmail(email)) return fail("That doesn't look like an email address");
  if (typeof signature !== "string" || !isHex(signature)) return fail("Missing signature");
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(issuedAt) || issuedAt > now + 60 || now - issuedAt > INVITE_TTL_SECONDS) {
    return fail("The signed invite expired. Try again.");
  }

  const chain = supportedChains.find((c) => c.id === chainId);
  const payroll = (addresses as Record<string, { payroll?: Address }>)[String(chainId)]?.payroll;
  if (!chain || !payroll) return fail("Dayze isn't deployed on this chain");
  const client = createPublicClient({ chain, transport: http(rpcUrls[chain.id]) });

  // 1. Signed by the org's wallet (verifyMessage handles smart wallets too, via ERC-1271).
  //    A gas-sponsored embedded wallet is an EOA upgraded with EIP-7702: it has code now, so ERC-1271 runs
  //    against the delegate and can fail. The EOA's own key still controls the address, so accept an ecrecover match.
  const message = inviteMessage(org, email, chainId, issuedAt);
  const valid =
    (await client.verifyMessage({ address: org, message, signature }).catch(() => false)) ||
    (await recoverMessageAddress({ message, signature })
      .then((signer) => isAddressEqual(signer, org))
      .catch(() => false));
  if (!valid) return fail("The signature doesn't match this org");

  // 2. The signer really is an employer
  const orgInfo = (await client
    .readContract({ address: payroll, abi: DayzePayrollAbi, functionName: "orgOf", args: [org] })
    .catch(() => undefined)) as { name: string; exists: boolean } | undefined;
  if (!orgInfo?.exists) return fail("Create your organisation before sending invites");

  // 3. Rate limits
  const orgKey = `${chainId}:${org.toLowerCase()}`;
  const recipientKey = `${orgKey}:${email.trim().toLowerCase()}`;
  const nowMs = Date.now();
  const history = (sentByOrg.get(orgKey) ?? []).filter((t) => nowMs - t < HOUR_MS);
  if (history.length >= PER_ORG_PER_HOUR) return fail("Invite limit reached for this hour", 429);
  if (nowMs - (recent.get(recipientKey) ?? 0) < HOUR_MS) return fail("You already invited this address in the last hour", 429);

  // 4. Send
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    console.info("[invite] email is off: set RESEND_API_KEY");
    return fail("Email invites aren't configured on this server. Copy the link instead.", 503);
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  const link = `${appUrl}/onboarding/employee?org=${org}`;
  const res = await fetch(RESEND_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${resendKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: process.env.NOTIFY_FROM_EMAIL ?? "Dayze <onboarding@resend.dev>",
      to: [email.trim()],
      subject: `${orgInfo.name} invited you to get paid on Dayze`,
      text: inviteText(orgInfo.name, link),
      html: inviteHtml(orgInfo.name, link),
    }),
  });
  if (!res.ok) {
    console.warn("[invite] Resend rejected the email", res.status, await res.text().catch(() => ""));
    return fail("The email provider rejected it", 502);
  }

  sentByOrg.set(orgKey, [...history, nowMs]);
  recent.set(recipientKey, nowMs);
  return NextResponse.json({ sent: true });
}

function inviteText(org: string, link: string) {
  return `${org} wants to pay your salary with Dayze.\n\nYour pay streams to you every second, and the amount stays private: only you, ${org} and their appointed auditor can see it.\n\nSet up your account: ${link}`;
}

function inviteHtml(org: string, link: string) {
  const o = escapeHtml(org);
  return `<div style="font-family:Inter,Arial,sans-serif;color:#17150e;max-width:520px">
  <p style="font-size:22px;margin:0 0 16px">${o} invited you to get paid on Dayze</p>
  <p style="font-size:16px;line-height:1.5">${o} wants to pay your salary with Dayze. It streams to you every second, and the amount stays private: only you, ${o} and their appointed auditor can see it.</p>
  <p><a href="${link}" style="display:inline-block;background:#17150e;color:#f0f7f6;padding:12px 24px;border-radius:1440px;text-decoration:none">Set up your account</a></p>
  <p style="font-size:13px;color:#949494">If you weren't expecting this, you can ignore it.</p>
</div>`;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function fail(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}
