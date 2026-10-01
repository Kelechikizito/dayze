# 11 — Worker app (`/worker`)

## Goal
The consumer side, and the demo moment: a salary ticking up every second while the explorer shows nothing (architecture §6.1, §7.3, §7.4).

## Sections

### 1. Live balance (the hero)
- On load: `streamsOfPayee(me)` → for each stream, unseal `monthly` and `withdrawn` **once** via `decryptForView` (ACP)
- Tick locally:
  ```ts
  const now = Date.now() / 1000;
  const accrued = (monthly * BigInt(Math.floor(now - startTime))) / PERIOD; // same formula as _accrued
  const available = accrued - withdrawn;
  ```
  Use `requestAnimationFrame` or a 100ms interval with **BigInt math**; format to 6 decimals so the cents visibly move.
- No transactions happen while it ticks. Say so in small print: "Updating live. 0 transactions."
- Re-unseal `withdrawn` after each withdraw.

### 2. Withdraw
- Amount input (default: all available) → encrypt for `PAYROLL` → `withdraw`
- After confirmation, unseal your balance in the stream's token and show the diff. If it's 0, explain: "Request exceeded available balance, so nothing moved. (We don't revert, which would leak information.)"

### 3. Cash out (unshield)
- Big warning modal: **"Cashing out reveals this amount publicly onchain."** (architecture §7.3)
- `wrapper.unshield(me, me, amt)` → find the claim → `decryptForTx(claimHandle).withoutACP()` → `claimUnshielded(id, value, sig)`
- A three-step progress indicator; the decrypt can take a while on testnet

### 4. Income credentials
- **Issue** form: stream (which fixes the token), verifier address, threshold (token per month, converted to confidential units), expiry (presets: 5 min *(demo)*, 1 day, 7 days, 30 days) → `issue`
- On success: shareable link `https://<app>/verify/<id>` + copy button + QR code
- **My credentials** list: verifier, threshold, expires in (live countdown), status (Valid / Expired / Revoked), Revoke button

## ✅ Checkpoint
- [ ] Balance ticks smoothly and matches the on-chain accrual within rounding after a withdraw
- [ ] Withdraw works; an over-withdraw shows the "nothing moved" explanation
- [ ] Unshield round trip lands the underlying token in the wallet (native ETH for cETH)
- [ ] Issue a credential → link copied → revoke works
- [ ] Open the withdraw tx on Arbiscan: no readable amount

## Pitfalls
- Clock skew: use the latest block timestamp once as a reference offset, not just `Date.now()`, or the balance can briefly go negative after activation.
- Don't unseal every tick. Unseal once, compute locally.

## Commit
`feat(frontend): worker app — live balance, withdraw, cash-out, credentials`
