import type { Address } from "viem";

/*
 * World ID settings shared by the client and the two API routes (07a).
 * The typed data must match HumanRegistry exactly: name, version, and the type string.
 * HumanRegistryTest builds its digest from the same strings.
 */

/** The Developer Portal action a worker proves uniqueness for */
export const WORLDID_ACTION = "dayze-register";

/** How long an attestation stays valid, in seconds */
export const ATTESTATION_TTL_SECONDS = 10 * 60;

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
  environment: "production" | "staging";
};

/** What the attest route returns: the arguments for HumanRegistry.register */
export type AttestResponse = {
  nullifier: string;
  deadline: number;
  signature: `0x${string}`;
};
