import { hashSignal } from "@worldcoin/idkit-core/hashing";
import type { IDKitResult } from "@worldcoin/idkit-core";
import { NextResponse } from "next/server";
import { isAddress, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { addresses } from "@/lib/contracts/addresses";
import {
  ATTESTATION_TTL_SECONDS,
  ATTESTATION_TYPES,
  WORLDID_ACTION,
  attestationDomain,
  signalFor,
  type AttestResponse,
} from "@/lib/worldid";

/*
 * Checks a World ID proof with World's API, then signs an EIP-712 attestation that the worker
 * submits to HumanRegistry.register (07a, step 3).
 *
 * The attester key can mark wallets as human. It can't read salaries or move funds.
 * It never pays gas: the worker sends the register transaction.
 */

type AttestRequest = { idkitResponse: IDKitResult; wallet: string; chainId: number };

export async function POST(request: Request) {
  const attesterKey = process.env.ATTESTER_PRIVATE_KEY;
  const rpId = process.env.WORLDID_RP_ID;
  if (!attesterKey || !rpId) {
    console.error("[world-id] missing ATTESTER_PRIVATE_KEY or WORLDID_RP_ID");
    return fail("World ID is not configured", 500);
  }

  let body: AttestRequest;
  try {
    body = (await request.json()) as AttestRequest;
  } catch {
    return fail("Invalid JSON");
  }
  const { idkitResponse, wallet, chainId } = body ?? {};

  // 1. Which wallet and which deployment
  if (typeof wallet !== "string" || !isAddress(wallet)) return fail("Invalid wallet");
  const humanRegistry = (addresses as Record<string, { humanRegistry?: Address }>)[String(chainId)]?.humanRegistry;
  if (!humanRegistry) return fail("Dayze isn't deployed on this chain");

  // 2. A uniqueness proof for Dayze's action, in the expected environment
  const environment = process.env.WORLDID_ENVIRONMENT === "production" ? "production" : "staging";
  if (!idkitResponse || !("action" in idkitResponse) || idkitResponse.action !== WORLDID_ACTION) {
    return fail("Wrong World ID action");
  }
  if (idkitResponse.environment !== environment) return fail("Wrong World ID environment");
  const responses = idkitResponse.responses ?? [];
  if (responses.length === 0) return fail("Empty World ID response");

  // 3. Every proof must be bound to this wallet, so it can't register a different one
  const expected = BigInt(hashSignal(signalFor(wallet)));
  if (!responses.every((r) => r.signal_hash !== undefined && BigInt(r.signal_hash) === expected)) {
    return fail("Proof isn't bound to this wallet");
  }

  // 4. Let World check the proof itself. Forward the payload as-is.
  const verify = await fetch(`https://developer.world.org/api/v4/verify/${rpId}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...idkitResponse, environment }),
  });
  const verification = verify.ok ? await verify.json().catch(() => null) : null;
  if (verification?.success !== true || verification?.environment !== environment) {
    console.warn("[world-id] verify rejected", verify.status);
    return fail("World ID verification failed");
  }

  // 5. Sign the attestation. HumanRegistry checks the nullifier is unused onchain.
  const nullifier = BigInt(responses[0].nullifier);
  const deadline = Math.floor(Date.now() / 1000) + ATTESTATION_TTL_SECONDS;
  const attester = privateKeyToAccount(attesterKey as Hex);
  const signature = await attester.signTypedData({
    domain: attestationDomain(chainId, humanRegistry),
    types: ATTESTATION_TYPES,
    primaryType: "Attestation",
    message: { account: wallet, nullifier, deadline: BigInt(deadline) },
  });

  const out: AttestResponse = { nullifier: nullifier.toString(), deadline, signature };
  return NextResponse.json(out);
}

function fail(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}
