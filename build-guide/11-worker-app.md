# 11 — Worker app (`/worker`)

## Goal
The consumer side and the demo moment: a salary ticking up every second while the explorer shows nothing (architecture §6.1, §7.3, §7.4).

## Sections

### 1. Live balance (the hero)
- On load: `streamsOfPayee(me)` → for each stream, unseal `monthly` and `withdrawn` **once** via `decryptForView` (ACP)
- Tick locally:
  ```ts
  const now = Date.now() / 1000;
  const accrued = (monthly * BigInt(Math.floor(now - startTime))) / PERIOD; // same formula as _accrued
  const available = accrued - withdrawn;
  ```
  Use `requestAnimationFrame` or a 100ms interval with **BigInt math**. Show 6 decimals so the cents visibly move.
- No transactions while it ticks. Say so in small print: "Updating live. 0 transactions."
- Unseal `withdrawn` again after each withdraw.

### 2. Withdraw
- Amount input (default: all available) → encrypt for `PAYROLL` → `withdraw`
- After confirmation, unseal your balance in the stream's token and show the change. If it's 0, explain: "Request was more than available, so nothing moved. (We don't revert, because that would leak information.)"

### 3. Cash out (unshield)
- Big warning modal: **"Cashing out reveals this amount publicly onchain."** (architecture §7.3)
- `wrapper.unshield(me, me, amt)` → find the claim → `decryptForTx(claimHandle).withoutACP()` → `claimUnshielded(id, value, sig)`
- Show a three-step progress bar. Decrypt can be slow on testnet.

### 4. Income credentials
- **Issue** form: stream (sets the token), verifier address, threshold (token per month, converted to confidential units), expiry (5 min *(demo)*, 1 day, 7 days, 30 days) → `issue`
- On success: share link `https://<app>/verify/<id>` + copy button + QR code
- **My credentials** list: verifier, threshold, expires in (live countdown), status (Valid / Expired / Revoked), Revoke button

## ✅ Checkpoint
- [ ] Balance ticks smoothly. After a withdraw it matches on-chain accrual within rounding.
- [ ] Withdraw works. An over-withdraw shows the "nothing moved" message.
- [ ] Unshield round trip puts the underlying token in the wallet (native ETH for cETH)
- [ ] Issue a credential → link copied → revoke works
- [ ] The withdraw tx on Arbiscan shows no readable amount

## Pitfalls
- Clock skew: read the latest block timestamp once and use it as an offset, not just `Date.now()`. Otherwise the balance can briefly go negative after activation.
- Don't unseal on every tick. Unseal once, compute locally.

## Commit
`feat(frontend): worker app — live balance, withdraw, cash-out, credentials`
