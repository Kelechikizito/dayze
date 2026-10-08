import { NextResponse } from "next/server";
import { createPublicClient, http, type Address } from "viem";
import { DayzePayrollAbi } from "@/lib/contracts/abis";
import { addresses } from "@/lib/contracts/addresses";
import { rpcUrls, supportedChains } from "@/lib/chains";

/*
 * Emails a worker when their salary stream starts.
 *
 * - The chain is the only input that matters: the route reads the stream itself, so it can only ever
 *   email about a stream that really exists, to that stream's payee. A caller can't choose the recipient.
 * - The email address comes from Privy (the worker's email login, or their Google account), looked up by
 *   wallet with the server API. Dayze stores no emails, and none go onchain.
 * - Never an amount: salaries are encrypted, and email isn't.
 * - Each (chain, stream, status) is sent once per server instance. Good enough for a demo; a persistent
 *   store (or checkpoint 13's indexer) would make it exact.
 */

const RESEND_URL = "https://api.resend.com/emails";
const PRIVY_USER_BY_WALLET = "https://auth.privy.io/api/v1/users/wallet/address";

/** Mirrors IDayzePayroll.Status */
const ACTIVE = 3;
const PENDING = 2;

const sent = new Set<string>();

type Stream = { payer: Address; payee: Address; token: Address; status: number };

export async function POST(request: Request) {
  let body: { chainId?: unknown; streamId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const chainId = Number(body.chainId);
  let streamId: bigint;
  try {
    streamId = BigInt(String(body.streamId));
  } catch {
    return NextResponse.json({ error: "Invalid stream id" }, { status: 400 });
  }

  const chain = supportedChains.find((c) => c.id === chainId);
  const d = (addresses as Record<string, { payroll?: Address; cusdc?: Address; carb?: Address; ceth?: Address }>)[String(chainId)];
  if (!chain || !d?.payroll) return NextResponse.json({ error: "Dayze isn't deployed on this chain" }, { status: 400 });

  // 1. The stream, straight from the chain
  const client = createPublicClient({ chain, transport: http(rpcUrls[chain.id]) });
  const stream = (await client
    .readContract({ address: d.payroll, abi: DayzePayrollAbi, functionName: "getStream", args: [streamId] })
    .catch(() => undefined)) as Stream | undefined;
  if (!stream || (stream.status !== ACTIVE && stream.status !== PENDING)) {
    return NextResponse.json({ sent: false, reason: "No active or pending stream with that id" });
  }

  const key = `${chainId}:${streamId}:${stream.status}`;
  if (sent.has(key)) return NextResponse.json({ sent: false, reason: "Already sent" });

  // 2. Configured?
  const resendKey = process.env.RESEND_API_KEY;
  const privyAppId = process.env.PRIVY_APP_ID ?? process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const privySecret = process.env.PRIVY_APP_SECRET;
  if (!resendKey || !privyAppId || !privySecret) {
    console.info("[notify] email is off: set RESEND_API_KEY, PRIVY_APP_ID and PRIVY_APP_SECRET");
    return NextResponse.json({ sent: false, reason: "Email isn't configured" });
  }

  // 3. The payee's email, from Privy
  const email = await emailForWallet(stream.payee, privyAppId, privySecret);
  if (!email) return NextResponse.json({ sent: false, reason: "The employee has no email on file" });

  // 4. The org name, for the subject line
  const org = (await client
    .readContract({ address: d.payroll, abi: DayzePayrollAbi, functionName: "orgOf", args: [stream.payer] })
    .catch(() => undefined)) as { name: string; exists: boolean } | undefined;
  const orgName = org?.exists ? org.name : "Your employer";
  const symbol =
    stream.token.toLowerCase() === d.cusdc?.toLowerCase()
      ? "cUSDC"
      : stream.token.toLowerCase() === d.carb?.toLowerCase()
        ? "cARB"
        : stream.token.toLowerCase() === d.ceth?.toLowerCase()
          ? "cETH"
          : "a confidential token";

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  const message = composeEmail(stream.status, orgName, symbol, `${appUrl}/worker`);

  // 5. Send
  const res = await fetch(RESEND_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${resendKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: process.env.NOTIFY_FROM_EMAIL ?? "Dayze <onboarding@resend.dev>",
      to: [email],
      subject: message.subject,
      text: message.text,
      html: message.html,
    }),
  });
  if (!res.ok) {
    console.warn("[notify] Resend rejected the email", res.status, await res.text().catch(() => ""));
    return NextResponse.json({ sent: false, reason: "The email provider rejected it" }, { status: 502 });
  }
  sent.add(key);
  return NextResponse.json({ sent: true });
}

/** The verified email Privy holds for a wallet: an email login first, else the Google account */
async function emailForWallet(wallet: Address, appId: string, secret: string): Promise<string | undefined> {
  const res = await fetch(PRIVY_USER_BY_WALLET, {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${appId}:${secret}`).toString("base64")}`,
      "privy-app-id": appId,
      "content-type": "application/json",
    },
    body: JSON.stringify({ address: wallet }),
  });
  if (!res.ok) return undefined;
  const user = (await res.json()) as { linked_accounts?: { type: string; address?: string; email?: string }[] };
  const accounts = user.linked_accounts ?? [];
  return accounts.find((a) => a.type === "email")?.address ?? accounts.find((a) => a.type === "google_oauth")?.email;
}

/** The email itself: who, what, where to look. No amounts. */
function composeEmail(status: number, orgName: string, symbol: string, link: string) {
  const subject =
    status === ACTIVE ? `${orgName} started paying you on Dayze` : `${orgName} set up your pay on Dayze`;
  const lead =
    status === ACTIVE
      ? `${orgName} started your salary in ${symbol}. It's accruing every second, and you can withdraw any time.`
      : `${orgName} set up your salary in ${symbol}. It starts as soon as their approvers sign off.`;
  const privacy = "Your salary is encrypted. Only you, your employer and their appointed auditor can see the amount.";
  const text = `${lead}\n\n${privacy}\n\nSee your pay: ${link}`;
  const html = `<div style="font-family:Inter,Arial,sans-serif;color:#17150e;max-width:520px">
  <p style="font-size:22px;margin:0 0 16px">${escapeHtml(subject)}</p>
  <p style="font-size:16px;line-height:1.5">${escapeHtml(lead)}</p>
  <p style="font-size:14px;line-height:1.5;color:#272b30">${escapeHtml(privacy)}</p>
  <p><a href="${link}" style="display:inline-block;background:#17150e;color:#f0f7f6;padding:12px 24px;border-radius:1440px;text-decoration:none">See your pay</a></p>
</div>`;
  return { subject, text, html };
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
