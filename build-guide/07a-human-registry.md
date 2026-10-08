# 07a — HumanRegistry (World ID)

## Goal
A worker proves once, with World ID, that they are a real and unique human. The chain stores one bit per wallet: `isHuman`. Two places use it:
- **Income Credential (07):** the verifier sees "issued by a verified human". One person can't make many wallets to fake income proofs.
- **Employer console (10):** a "✓ human" badge next to each payee. This makes ghost employees harder.

Build this before 07, because `IncomeCredential` reads it.

## Steps
Do these in order. The sections after **Steps** have the code and details each to-do points to.

### 1. Contract
**To do:**
- [ ] Create `src/interfaces/IHumanRegistry.sol` with `isHuman`
- [ ] Create `src/HumanRegistry.sol` with `/sol-style-guide`. Inherit OZ `EIP712` and `Ownable`.
- [ ] Add the storage in **Data model** and the functions in **Interface**
- [ ] Write `register` as in **Key snippet**

### 2. Tests
**To do:**
- [ ] Create `test/unit/HumanRegistryTest.t.sol` with the 7 tests in **Tests** below
- [ ] Run the command in **Checkpoint**, then commit the contract and tests

### 3. World Developer Portal
**To do:**
- [ ] Create an app and an action called `dayze-register`
- [ ] Save `app_id`, `rp_id` and the signing key in a password manager. The key is shown once.

### 4. Attester key
**To do:**
- [ ] Make a new key just for this: `cast wallet new`
- [ ] Put its **address** in the root `.env` as `ATTESTER` (08 needs it)
- [ ] Put the **private key** in Vercel as `ATTESTER_PRIVATE_KEY`, server only
- [ ] For local dev, put it in `frontend/.env.local`. Check `git check-ignore frontend/.env.local`.

### 5. Backend routes (now, or when you reach 11 §0)
**To do:**
- [ ] In `frontend/`, run `npm install --save-exact @worldcoin/idkit@4.4.0 @worldcoin/idkit-core@4.4.0`
- [ ] Create `lib/worldid.ts`: the action, the EIP-712 domain and types, and `signalFor(wallet)` (shared by client and server)
- [ ] Create `app/api/world-id/rp-signature/route.ts` (**Backend** step 2)
- [ ] Create `app/api/world-id/attest/route.ts` (**Backend** step 3)
- [ ] Check viem's `hashTypedData` matches the contract's digest (**Backend** below)
- [ ] Test both with the World simulator (`environment: "staging"`). The full flow needs the deploy (08) and the worker onboarding UI (11).
- [ ] Commit the routes separately from the contract

## Why a backend attester?
World ID has no onchain verifier on Arbitrum. Its router only lives on World Chain, Ethereum, Base, Optimism and Polygon. So:
1. The worker makes a proof in World App (IDKit).
2. Our Next.js backend checks it with World's API (`POST https://developer.world.org/api/v4/verify/{rp_id}`).
3. If it passes, the backend signs an EIP-712 **attestation**: "this wallet is a human, with this nullifier".
4. The worker sends the attestation to `HumanRegistry.register`. The contract checks the signature.

This adds one trusted party: the attester key. It can mark wallets as human. It can't read salaries or move funds. Say so in the pitch (14).

## Data model
```solidity
/// @notice EIP-712 typehash for an attestation signed by the backend
bytes32 private constant ATTESTATION_TYPEHASH =
    keccak256("Attestation(address account,uint256 nullifier,uint64 deadline)");

/// @notice The backend key that signs attestations after World ID checks a proof
address private s_attester;

/// @notice Whether a wallet has a verified World ID
mapping(address account => bool) private s_isHuman;

/// @notice Whether a World ID nullifier was already used. One human, one wallet.
mapping(uint256 nullifier => bool) private s_nullifierUsed;
```
Inherit OpenZeppelin `EIP712("Dayze HumanRegistry", "1")` and `Ownable`. Use `ECDSA.recover` on `_hashTypedDataV4(...)`.

## Interface
```solidity
/*//////////////////////////////////////////////////////////////
                       EXTERNAL FUNCTIONS
//////////////////////////////////////////////////////////////*/

/// @notice Marks the caller as a verified human
/// @dev The attestation must name msg.sender, so a stolen signature is useless to anyone else
/// @param nullifier The World ID nullifier for the "dayze-register" action
/// @param deadline Timestamp after which the attestation is no longer accepted
/// @param signature The attester's EIP-712 signature over (msg.sender, nullifier, deadline)
function register(uint256 nullifier, uint64 deadline, bytes calldata signature) external;

/// @notice Rotates the attester key. Owner only.
/// @param attester The new attester address
function setAttester(address attester) external;

/*//////////////////////////////////////////////////////////////
                     VIEW & PURE FUNCTIONS
//////////////////////////////////////////////////////////////*/

/// @notice Checks whether a wallet has a verified World ID
/// @param account The wallet to check
/// @return True if the wallet registered with a valid attestation
function isHuman(address account) external view returns (bool);
```
Errors: `HumanRegistry__Expired`, `HumanRegistry__BadSignature`, `HumanRegistry__NullifierUsed`, `HumanRegistry__AlreadyHuman`.
Events: `HumanRegistered(account)`, `AttesterUpdated(attester)`. **Don't emit the nullifier.** It's not secret, but nothing needs it.

## Key snippet
```solidity
/// @notice Marks the caller as a verified human
/// @param nullifier The World ID nullifier for the "dayze-register" action
/// @param deadline Timestamp after which the attestation is no longer accepted
/// @param signature The attester's EIP-712 signature over (msg.sender, nullifier, deadline)
function register(uint256 nullifier, uint64 deadline, bytes calldata signature) external {
    if (block.timestamp > deadline) revert HumanRegistry__Expired();
    if (s_isHuman[msg.sender]) revert HumanRegistry__AlreadyHuman();
    if (s_nullifierUsed[nullifier]) revert HumanRegistry__NullifierUsed();

    bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(ATTESTATION_TYPEHASH, msg.sender, nullifier, deadline)));
    if (ECDSA.recover(digest, signature) != s_attester) revert HumanRegistry__BadSignature();

    s_nullifierUsed[nullifier] = true;
    s_isHuman[msg.sender] = true;
    emit HumanRegistered(msg.sender);
}
```
No FHE here. This is a plain contract.

## Backend (Next.js API routes in `frontend/`)
Follow [World's IDKit guide](https://docs.world.org/world-id/idkit/integrate). Use IDKit `4.x`.

1. **Developer Portal:** create an app and an action `dayze-register`. Keep `app_id`, `rp_id` and the `signing_key`. The portal shows the key **once**.
2. **`app/api/world-id/rp-signature/route.ts`:** `signRequest({ signingKeyHex: process.env.WORLDID_RP_SIGNING_KEY, action: "dayze-register" })` from `@worldcoin/idkit-core/signing`.
   - Always sign `dayze-register`. Ignore any action the client sends.
   - Also return the public `app_id`, `rp_id` and `environment`, so the client needs no `NEXT_PUBLIC_*` World ID vars.
3. **`app/api/world-id/attest/route.ts`:**
   - Body: `{ idkitResponse, wallet, chainId }`. Look up `humanRegistry` for `chainId` in `lib/contracts/addresses.ts`. Reject unknown chains.
   - Check `idkitResponse.action === "dayze-register"` and `environment` is what you expect.
   - Check the proof's **signal is the worker's wallet**: every `responses[i].signal_hash` must equal `hashSignal(wallet.toLowerCase())` from `@worldcoin/idkit-core/hashing`. Compare as `BigInt`. `signal_hash` is optional in the types, so a missing one fails. The client must pass the same lowercased address as the IDKit signal.
   - Forward the IDKit result **as-is** to `/api/v4/verify/{rp_id}`. Don't remap fields.
   - Check that `success === true` and that `environment` is what you expect.
   - `nullifier = BigInt(responses[0].nullifier)`. It can be decimal or hex; `BigInt` takes both.
   - Sign the attestation with viem `signTypedData` using `ATTESTER_PRIVATE_KEY`. Use the same domain, types and chain id as the contract.
   - Return `{ nullifier, deadline, signature }`. Set the deadline to 10 minutes from now.

Env vars (`frontend/.env.local` and Vercel, **server only**, never `NEXT_PUBLIC_*`, never logged):
```
WORLDID_RP_SIGNING_KEY=...  # from the World Developer Portal; shown once
WORLDID_APP_ID=app_...      # public, but read server-side and passed to the client
WORLDID_RP_ID=rp_...
WORLDID_ENVIRONMENT=staging # optional; "production" for real World IDs. Defaults to staging.
ATTESTER_PRIVATE_KEY=0x...  # a fresh key used only for signing. It holds no funds and sends no txs.
```
`ATTESTER` in the root `.env` is this key's **address**. Check they match: `cast wallet address --private-key $ATTESTER_PRIVATE_KEY`.

**Check the typed data once.** Hash a sample attestation with viem's `hashTypedData`, and again by hand with the contract's formula (`keccak256("\x19\x01" ‖ domainSeparator ‖ structHash)`, as in `HumanRegistryTest`). They must be equal. If they differ, `register` reverts with `BadSignature` and nothing else tells you why.
The attester never pays gas. The worker sends `register`.

**Testing:** use World's [simulator](https://simulator.worldcoin.org/) with `environment: "staging"`. Switch to `production` for the demo only if you have a real World ID.

## Tests: `test/unit/HumanRegistryTest.t.sol`
Sign attestations in the test with `vm.sign(attesterPk, digest)`.
1. A valid attestation → `isHuman(alice) == true`
2. A signature from a different key → `BadSignature`
3. Bob submits Alice's attestation → `BadSignature` (the digest uses `msg.sender`)
4. `vm.warp(deadline + 1)` → `Expired`
5. The same nullifier on a second wallet → `NullifierUsed`
6. Alice registers twice → `AlreadyHuman`
7. `setAttester` is owner only. Old signatures fail after rotation.

## Honest limits
- The attester is trusted. If its key leaks, anyone can be marked human. Rotate with `setAttester`.
- One human, one wallet. A worker who loses their wallet can't register a new one in v0.1. (Roadmap: owner-approved reset.)
- `isHuman` says "a unique human controls this wallet". It doesn't say who.

## ✅ Checkpoint
```bash
forge test --match-contract HumanRegistryTest -vv
```
- [ ] All 7 tests pass
- [ ] The typehash string matches the `types` object in the backend route, character for character
- [ ] No secret env var starts with `NEXT_PUBLIC_`

## Commit
`feat: add HumanRegistry with World ID attestations`
