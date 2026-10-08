import { hashSignal } from "@worldcoin/idkit-core/hashing";
import { NextResponse } from "next/server";
import { isAddress, isHex, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { addresses } from "@/lib/contracts/addresses";
import {
  ATTESTATION_TTL_SECONDS,
  ATTESTATION_TYPES,
  SELFIE_IDENTIFIERS,
  WORLDID_ACTION,
  attestationDomain,
  nullifierCommitment,
  signalFor,
  worldIdEnvironment,
  type AttestResponse,
} from "@/lib/worldid";

/*
 * Checks a World ID Selfie Check proof with World's API, then signs an EIP-712 attestation that the
 * worker submits to HumanRegistry.register (07a, step 3). Same shape as Herit's verify route.
 *
 * - Forwards the IDKit result exactly as returned. Re-encoding any field is the usual cause of invalid_proof.
 * - Fails closed: anything that isn't clearly "verified" is a rejection, never a fall-through to signing.
 * - Signs a salted commitment of the nullifier, never the raw nullifier (see nullifierCommitment).
 *
 * The attester key can mark wallets as human. It can't read salaries or move funds, and never pays gas.
 */

const VERIFY_BASE = "https://developer.world.org/api/v4/verify";

type SelfieResponse = { identifier: string; nullifier?: string; signal_hash?: string; sybil_score?: number };

export async function POST(request: Request) {
  const attesterKey = normalizeKey(process.env.ATTESTER_PRIVATE_KEY);
  const rpId = process.env.WORLDID_RP_ID;
  const salt = normalizeKey(process.env.NULLIFIER_SALT);
  if (!attesterKey) return config("ATTESTER_PRIVATE_KEY must be 32 hex bytes (with or without 0x)");
  if (!rpId) return config("WORLDID_RP_ID is unset");
  if (!salt) return config("NULLIFIER_SALT must be 32 hex bytes (with or without 0x)");

  let body: { idkitResponse?: unknown; wallet?: unknown; chainId?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail("Invalid JSON");
  }
  const { idkitResponse, wallet, chainId } = body ?? {};

  // 1. Which wallet and which deployment
  if (typeof wallet !== "string" || !isAddress(wallet)) return fail("Invalid wallet");
  const humanRegistry = (addresses as Record<string, { humanRegistry?: Address }>)[String(chainId)]?.humanRegistry;
  if (!humanRegistry) return fail("Dayze isn't deployed on this chain");

  // 2. A proof for Dayze's action, in the expected environment
  const environment = worldIdEnvironment();
  const result = idkitResponse as { action?: string; environment?: string; responses?: unknown[] } | undefined;
  if (!result || result.action !== WORLDID_ACTION) return fail("Wrong World ID action");
  if (result.environment !== undefined && result.environment !== environment) {
    return fail(`Proof is from ${result.environment}, the server expects ${environment}`);
  }

  // 3. The Selfie Check response specifically, never just the first one
  const responses = Array.isArray(result.responses) ? (result.responses as SelfieResponse[]) : [];
  const selfie = responses.find((r) => (SELFIE_IDENTIFIERS as readonly string[]).includes(r?.identifier));
  if (!selfie?.nullifier) {
    const seen = responses.map((r) => String(r?.identifier)).join(", ") || "none";
    return fail(`Use World ID Selfie Check (credentials returned: ${seen})`);
  }

  // 4. Bound to this wallet, so one person's proof can't register a different wallet
  if (selfie.signal_hash === undefined || BigInt(selfie.signal_hash) !== BigInt(hashSignal(signalFor(wallet)))) {
    return fail("Proof isn't bound to this wallet");
  }

  // 5. Let World check the proof. Forward it exactly as IDKit returned it.
  const verify = await fetch(`${VERIFY_BASE}/${rpId}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(idkitResponse),
  });
  const verification = (await verify.json().catch(() => null)) as Record<string, unknown> | null;
  if (!verify.ok || !looksVerified(verification)) {
    const detail =
      typeof verification?.detail === "string"
        ? verification.detail
        : typeof verification?.code === "string"
          ? verification.code
          : `verifier returned ${verify.status}`;
    return fail(`World ID verification failed: ${detail}`);
  }
  if (typeof verification?.environment === "string" && verification.environment !== environment) {
    return fail(`World verified it for ${verification.environment}, the server expects ${environment}`);
  }
  console.info("[world-id] selfie check verified", { wallet, sybilScore: selfie.sybil_score });

  // 6. Sign the salted commitment. HumanRegistry checks it's unused onchain.
  const commitment = nullifierCommitment(BigInt(selfie.nullifier), salt);
  const deadline = Math.floor(Date.now() / 1000) + ATTESTATION_TTL_SECONDS;
  const attester = privateKeyToAccount(attesterKey);
  const signature = await attester.signTypedData({
    domain: attestationDomain(Number(chainId), humanRegistry),
    types: ATTESTATION_TYPES,
    primaryType: "Attestation",
    message: { account: wallet, nullifier: commitment, deadline: BigInt(deadline) },
  });

  const out: AttestResponse = { nullifier: commitment.toString(), deadline, signature };
  return NextResponse.json(out);
}

/**
 * A 32-byte hex secret from env, with or without 0x (cast and wallets export it without).
 * Checked here so a malformed value is our own config error, never a viem exception that might quote it.
 */
function normalizeKey(value: string | undefined): Hex | undefined {
  if (!value) return undefined;
  const v = (value.trim().startsWith("0x") ? value.trim() : `0x${value.trim()}`) as Hex;
  return isHex(v) && v.length === 66 ? v : undefined;
}

/** Whether World's body says the proof passed. Fail closed: success: true, or verified responses with no error code. */
function looksVerified(body: Record<string, unknown> | null): boolean {
  if (!body || typeof body.code === "string") return false;
  if (body.success === true) return true;
  return Array.isArray(body.responses) && body.responses.length > 0;
}

/** A rejection. Logged too: IDKit hides the body behind `failed_by_host_app`, so the server log is where the reason lives. */
function fail(error: string, status = 400) {
  console.warn(`[world-id] attest rejected: ${error}`);
  return NextResponse.json({ error }, { status });
}

/** A server misconfiguration. Names the key, never its value. */
function config(message: string) {
  console.error(`[world-id] configuration: ${message}`);
  return NextResponse.json({ error: "World ID is not configured on the server" }, { status: 500 });
}
