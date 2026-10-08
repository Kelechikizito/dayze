import { encodeAbiParameters, keccak256, type Address, type Hex } from "viem";

/*
 * World ID settings shared by the client and the two API routes (07a).
 * The typed data must match HumanRegistry exactly: name, version, and the type string.
 * HumanRegistryTest builds its digest from the same strings.
 */

/** Which World ID network proofs come from */
export type WorldIdEnvironment = "production" | "staging" | "sandbox";

/**
 * From NEXT_PUBLIC_WLD_ENVIRONMENT, shared by the widget and both API routes (NEXT_PUBLIC_ vars are
 * readable server-side too). "staging": World's simulator. "sandbox": the sandbox World ID app
 * (TestFlight / Google Play testing). "production": real World IDs. Defaults to staging.
 */
export function worldIdEnvironment(): WorldIdEnvironment {
  const v = process.env.NEXT_PUBLIC_WLD_ENVIRONMENT;
  return v === "production" || v === "sandbox" ? v : "staging";
}

/** The Developer Portal action a worker proves uniqueness for */
export const WORLDID_ACTION = "dayze-register";

/**
 * How long an attestation stays valid, in seconds. Long on purpose: Selfie Check is one-time per
 * action, so if the register tx fails (e.g. no gas) the user can't prove again. The attestation is
 * bound to one wallet and nullifier, so a week to retry is safe.
 */
export const ATTESTATION_TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * Selfie Check's credential identifiers in a proof response. `face` is the older alias for the same
 * credential: accept it, never construct it. Orb and document proofs are rejected.
 */
export const SELFIE_IDENTIFIERS = ["selfie", "face"] as const;

/**
 * What goes onchain instead of the raw nullifier: keccak256(abi.encode(uint256 nullifier, bytes32 salt)).
 * A raw nullifier is guessable: anyone who gets a person's proof for this action could compare it with
 * the chain and find their wallet. A server-only salt breaks that. Uniqueness still holds, because the
 * same nullifier always gives the same commitment.
 * The encoding and the salt must never change, or one person gets a second commitment and can register twice.
 * Server only: the salt must never reach the browser.
 */
export function nullifierCommitment(nullifier: bigint, salt: Hex): bigint {
  return BigInt(keccak256(encodeAbiParameters([{ type: "uint256" }, { type: "bytes32" }], [nullifier, salt])));
}

/** IDKit error codes, said as the cause and what fixes it */
export function worldIdErrorMessage(code: string, environment: string): string {
  switch (code) {
    case "user_rejected":
    case "verification_rejected":
    case "cancelled":
      return "The check was declined or closed in World App.";
    case "credential_unavailable":
    case "feature_unavailable":
    case "world_id_3_not_available":
    case "world_id_4_not_available":
      return "Selfie Check isn't enabled for this World ID app. That's a Developer Portal setting (Selfie Check Beta access), not something to retry.";
    case "unknown_rp":
    case "inactive_rp":
    case "invalid_rp_id_format":
      return `This app isn't registered for World ID in the ${environment} environment. Check the RP id and that the action exists there.`;
    case "invalid_network":
      return `Wrong World ID network for ${environment}. In sandbox, use the World ID (Sandbox) app; in staging, the simulator.`;
    case "nullifier_replayed":
    case "max_verifications_reached":
      return "This person has already used their one Selfie Check for Dayze.";
    case "invalid_rp_signature":
    case "rp_signature_expired":
    case "timestamp_too_old":
    case "timestamp_too_far_in_future":
    case "invalid_timestamp":
    case "duplicate_nonce":
      return "The signed request expired or was reused. Start again.";
    case "connection_failed":
    case "timeout":
      return "Couldn't reach World App. Check the connection and try again.";
    case "malformed_request":
      return "World ID rejected the request as malformed. Check the action name and preset.";
    default:
      return `World ID couldn't complete the check (${code}).`;
  }
}

/** EIP-712 types for HumanRegistry's `Attestation(address account,uint256 nullifier,uint64 deadline)` */
export const ATTESTATION_TYPES = {
  Attestation: [
    { name: "account", type: "address" },
    { name: "nullifier", type: "uint256" },
    { name: "deadline", type: "uint64" },
  ],
} as const;

/** EIP-712 domain for a deployed HumanRegistry */
export function attestationDomain(chainId: number, humanRegistry: Address) {
  return { name: "Dayze HumanRegistry", version: "1", chainId, verifyingContract: humanRegistry } as const;
}

/**
 * The signal a worker's proof is bound to: their wallet, lowercased.
 * The client passes it to IDKit and the backend checks the proof's signal_hash against it,
 * so a proof made for one wallet can't register another.
 */
export function signalFor(wallet: Address): string {
  return wallet.toLowerCase();
}

/** What the rp-signature route returns: the RP signature plus the public ids the client needs */
export type RpSignatureResponse = {
  sig: string;
  nonce: string;
  created_at: number;
  expires_at: number;
  app_id: `app_${string}`;
  rp_id: string;
  environment: WorldIdEnvironment;
};

/** What the attest route returns: the arguments for HumanRegistry.register */
export type AttestResponse = {
  /** The salted nullifier commitment as a decimal uint256 (see nullifierCommitment), not the raw nullifier */
  nullifier: string;
  deadline: number;
  signature: `0x${string}`;
};
