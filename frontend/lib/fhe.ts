import type { useCofheClient } from "@cofhe/react";
import { Encryptable, FheTypes } from "@cofhe/sdk";
import type { Address, Hex } from "viem";

/*
 * The three FHE calls every page uses. Shapes checked against @cofhe/sdk 0.7.1:
 * - encryptInputs(...).execute() → [handle, proof]; one proof covers the batch
 * - decryptForView(handle, type).withACP().execute() → bigint | boolean
 * - decryptForTx(handle).withoutACP().execute() → { ctHash, decryptedValue, signature }
 */

export type CofheClient = ReturnType<typeof useCofheClient>;

/** An encrypted uint64 input, ready to pass as (externalEuint64, bytes proof) */
export type EncryptedUint64 = { handle: Hex; proof: Hex };

/**
 * Encrypts a uint64 for one consuming contract. The handle only works in that contract.
 * @param amount Plaintext value, e.g. 6-decimal token units
 * @param contract The contract that will receive the input
 */
export async function encryptUint64(client: CofheClient, amount: bigint, contract: Address): Promise<EncryptedUint64> {
  const [handle, proof] = await client
    .encryptInputs([Encryptable.uint64(amount)])
    .setConsumingContract(contract)
    .execute();
  return { handle: handle as Hex, proof: proof as Hex };
}

/**
 * Decrypts a uint64 handle the connected account is allowed to read. Needs a self ACP (see useEnsureACP).
 * @param handle The euint64 handle from a contract read
 */
export async function unsealUint64(client: CofheClient, handle: Hex | bigint): Promise<bigint> {
  return client.decryptForView(handle, FheTypes.Uint64).withACP().execute();
}

/**
 * Decrypts a bool handle the connected account is allowed to read. Needs a self ACP.
 * @param handle The ebool handle from a contract read
 */
export async function unsealBool(client: CofheClient, handle: Hex | bigint): Promise<boolean> {
  return client.decryptForView(handle, FheTypes.Bool).withACP().execute();
}

/**
 * Publicly decrypts a handle for use in a transaction, e.g. the policy bit for `resolvePolicy`.
 * Works without an ACP because the contract called `FHE.allowPublic` on it.
 * @param handle The handle to decrypt
 * @returns The value and the signature the contract checks
 */
export async function decryptForTx(client: CofheClient, handle: Hex | bigint) {
  const res = await client.decryptForTx(handle).withoutACP().execute();
  return { value: res.decryptedValue, signature: res.signature };
}

/** A handle of 0 means the value was never set (e.g. a vault that was never funded) */
export function isUnsetHandle(handle: Hex | bigint | undefined): boolean {
  return handle === undefined || BigInt(handle) === BigInt(0);
}
