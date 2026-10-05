# 15 — Payroll agent (stretch)

**Only do this once 01–12 work end to end.** It's the first thing to cut. If you skip it, use the roadmap slide in 14 instead.

## Goal
An employer gives an agent **limited** access to their wallet. The agent keeps the payroll vault topped up on a schedule, so streams don't run dry while the employer is away. Privy enforces the limits before it signs anything.

## What an agent can and can't do here
Streaming needs no agent: accrual is lazy, so money streams with zero transactions. The useful job is **funding**.

| Job | Works? | Why |
|---|---|---|
| Top up the vault by a fixed amount on a schedule | ✅ | The agent picks the amount, so it learns nothing private. Shield amounts are public anyway. |
| Top up only when the vault is low | ❌ | The vault balance is encrypted. The agent would need decrypt access, which shows total payroll. |
| Create streams | ❌ | The agent would have to know each salary. A human signs this. |
| Worker auto-withdraw | ❌ | "Withdraw everything" needs the available balance, which is encrypted. Asking for too much moves 0 (05). |

## How Privy limits fit Dayze
Privy checks transactions **in plaintext**. Dayze amounts are **ciphertext**. So:

| Rule from the agent form | Enforced by | Notes |
|---|---|---|
| Allowed contracts (USDC, cUSDC, payroll) | Privy policy, `to` field | ✅ |
| Max per top-up | Privy policy, `shield` amount in calldata | ✅ The shield amount is plaintext. |
| Max per 30 days | Privy aggregation (stateful policy) on the `shield` amount | ✅ Max 10 aggregations per app, and each employer needs one. Fine for a demo. |
| Agent access ends on a date | Privy policy, `system.current_unix_timestamp` | ✅ This is an expiry, not a delay. |
| Max salary per stream | `ApprovalPolicy` onchain (04) | Privy can't read encrypted amounts. |
| Timelock (delay before a tx runs) | Not in Privy | Use the expiry instead, or build a delay onchain later. |

## Steps

### 1. Authorization key (one time)

**To do:**
- [ ] Make a P-256 key pair locally
- [ ] Register the public key as a 1-of-1 key quorum in the Privy dashboard. Save the id.
- [ ] Add `PRIVY_APP_SECRET`, `PRIVY_AUTH_PRIVATE_KEY` and `PRIVY_QUORUM_ID` to Vercel, server only

- Make a P-256 key pair locally (`openssl ecparam -name prime256v1 ...`, see Privy's [signers quickstart](https://docs.privy.io/wallets/using-wallets/signers/quickstart)).
- Register the public key as a 1-of-1 key quorum in the Privy dashboard. Save the quorum id.
- Server-only env vars on Vercel: `PRIVY_APP_SECRET`, `PRIVY_AUTH_PRIVATE_KEY`. Never `NEXT_PUBLIC_*`, never in the repo.

### 2. Policy (built from the form)

**To do:**
- [ ] Check the input names of `shield` and `fundVault` in the ABIs
- [ ] Create `lib/agent/policy.ts` that builds the policy below from the form values
- [ ] Create one aggregation per employer for the 30-day cap
- [ ] Create the policy from a server route with the Privy Node SDK

One policy per employer, created from the server with the Privy Node SDK. Every rule also checks the expiry.
```ts
{
  version: '1.0',
  name: `dayze-agent-${employer}`,
  chain_type: 'ethereum',
  rules: [
    { name: 'approve USDC to the wrapper, capped', method: 'eth_sendTransaction', action: 'ALLOW',
      conditions: [
        { field_source: 'ethereum_transaction', field: 'to', operator: 'eq', value: USDC },
        { field_source: 'ethereum_calldata', field: 'approve.spender', abi: ERC20_ABI, operator: 'eq', value: CUSDC },
        { field_source: 'ethereum_calldata', field: 'approve.amount', abi: ERC20_ABI, operator: 'lte', value: perTopUpCap },
        { field_source: 'system', field: 'current_unix_timestamp', operator: 'lt', value: expiresAt },
      ] },
    { name: 'shield into cUSDC, capped', method: 'eth_sendTransaction', action: 'ALLOW',
      conditions: [ /* to == CUSDC, shield amount <= perTopUpCap, 30-day aggregation <= monthlyCap, expiry */ ] },
    { name: 'fund the vault in cUSDC only', method: 'eth_sendTransaction', action: 'ALLOW',
      conditions: [ /* to == PAYROLL, fundVault.token == CUSDC, expiry */ ] },
  ],
}
```
- Calldata field names must match the ABI input names. Check `shield` and `fundVault` input names in `lib/` and in your ABIs.
- Anything not allowed is denied by default. Don't add a catch-all rule.

### 3. Grant access (`/employer/agent`)

**To do:**
- [ ] Create `app/employer/agent/page.tsx` with the form
- [ ] Show the plain-words summary before Grant
- [ ] On Grant: create the policy on the server, then call `addSigners` on the client
- [ ] Add a "Revoke agent" button
- [ ] Hide the page for external wallets
- [ ] Optional: add the `draft_agent_policy` MCP tool

A form with: token, amount per top-up, max per 30 days, schedule (daily / weekly), access ends on.
- Submit → server creates the policy → client calls `addSigners({ address, signers: [{ signerId: QUORUM_ID, policyIds: [policyId] }] })` from `useSigners()`.
- Show the rules in plain words before the user confirms: "The agent can move up to 5,000 USDC per week into your payroll vault until 1 Dec. It can't see salaries or pay anyone."
- A "Revoke agent" button removes the signer.
- This only works for an employer using a **Privy embedded wallet**. Hide the page for external wallets.

**Optional: "Draft with AI".** Expose one MCP tool, `draft_agent_policy`, that returns form values from a plain-English request ("top up 5k a week until December"). It only fills the form. A human still reviews and clicks Grant. The agent never sets its own limits.

### 4. The top-up job (`app/api/agent/topup/route.ts`)

**To do:**
- [ ] Create `app/api/agent/topup/route.ts` that sends the 4 txs below
- [ ] Add a Vercel cron for it in `vercel.json`
- [ ] Reject calls without the right `CRON_SECRET` header
- [ ] Log tx hashes only

Run it from a Vercel cron. For each employer with an active grant:
1. `approve(CUSDC, amount)` on USDC
2. `shield(employer, amount)` on cUSDC
3. Encrypt `amount / rate()` for `PAYROLL` with the employer as the account. Reuse the Node encrypt code from 08 (`@cofhe/sdk/node`, no key needed).
4. `fundVault(CUSDC, handle, proof)`

Send each tx from the employer's wallet with the Privy Node SDK, signed with the authorization key. Check Privy's Node docs for the current method name. Log tx hashes only.

The employer must have called `setOperator(payroll, until)` on the wrapper once (10 §2). The agent doesn't need that permission.

## ✅ Checkpoint
- [ ] Grant an agent with a 100 USDC per top-up cap → the cron tops up the vault → the employer's vault balance goes up
- [ ] Change the job to 101 USDC → Privy denies the `shield`. Nothing moves.
- [ ] A call to any other contract is denied
- [ ] After the expiry, every call is denied
- [ ] Revoke → the next cron run fails cleanly
- [ ] The agent never calls `decryptForView`. `grep -rn decryptForView frontend/app/api/` finds nothing.

## Commit
`feat: payroll agent — Privy signer with capped, expiring vault top-ups`
