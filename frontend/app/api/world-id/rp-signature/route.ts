import { signRequest } from "@worldcoin/idkit-core/signing";
import { NextResponse } from "next/server";
import { WORLDID_ACTION, worldIdEnvironment, type RpSignatureResponse } from "@/lib/worldid";

/*
 * Signs a World ID proof request so World App knows it really comes from Dayze (07a, step 2).
 * Server only: WORLDID_RP_SIGNING_KEY never reaches the browser.
 * Also returns the public app_id and rp_id, so the client needs no extra env vars.
 */

export async function POST() {
  const signingKey = process.env.WORLDID_RP_SIGNING_KEY;
  const appId = process.env.WORLDID_APP_ID;
  const rpId = process.env.WORLDID_RP_ID;
  if (!signingKey || !appId || !rpId) {
    console.error("[world-id] missing WORLDID_RP_SIGNING_KEY, WORLDID_APP_ID or WORLDID_RP_ID");
    return NextResponse.json({ error: "World ID is not configured" }, { status: 500 });
  }

  // Only ever sign Dayze's own action, whatever the client asks for
  const { sig, nonce, createdAt, expiresAt } = signRequest({ signingKeyHex: signingKey, action: WORLDID_ACTION });

  const body: RpSignatureResponse = {
    sig,
    nonce,
    created_at: createdAt,
    expires_at: expiresAt,
    app_id: appId as `app_${string}`,
    rp_id: rpId,
    environment: worldIdEnvironment(),
  };
  return NextResponse.json(body);
}
