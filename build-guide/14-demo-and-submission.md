# 14 — Demo + submission

## 1. Demo setup
- Deploy with `PERIOD = 600` (a "month" is 10 minutes) so salaries visibly grow
- Pre-seed: org "Acme Labs", $10k policy with 2 approvers, 1 auditor, $3k and $6k streams (Active). Create the $12k one live.
- One browser profile per role: **Employer**, **Worker**, **Landlord**, **Auditor**. Each has its wallet connected and ACP signed.
- Unlock the `dayze-deployer` keystore only to deploy/seed. Nothing runs in the background with a key (the employer UI resolves policy checks).

## 2. Demo script (~3 minutes)
1. **Problem (20s):** show a normal USDC payroll tx on Arbiscan. "Everyone can see this salary, forever."
2. **Employer (40s):** create the 12k cUSDC stream → "Checking policy privately…" → Pending → second wallet approves → Active. "The threshold is encrypted. The contract compared two numbers it can't read."
3. **Worker (40s):** balance ticking. "Zero transactions." Withdraw. Open the tx on Arbiscan: **nothing readable**.
4. **Credential (50s):** landlord asks for ≥ $3k. Worker issues with a 2-minute expiry → sends link → landlord sees ✅. Wrong wallet can't unseal. Wait → banner flips to **Expired** live.
5. **Auditor (20s):** unseal + CSV, made in the browser.
6. **Close (10s):** "A salary never exists in plaintext onchain. Proving income reveals one bit, to one person, for a limited time."

Rehearse on live testnet at least twice. Decrypt time varies. Record a backup video.

## 3. Talking points (from architecture §5, §8)
- Say **"zero-knowledge income check, enforced by FHE"**, not "ZK proof". Be ready to say why FHE beats a SNARK here: the check runs on the stream's own ciphertext, so it can't drift from what the worker is really paid.
- Be open about limits:
  - shield/unshield amounts are public
  - payee addresses are visible in v0.1
  - the policy leaks one bit
  - auditor access is sticky
  - credentials are "as of issuance"
  - Dayze proves what a contract pays, not who the employer is
- Arbitrum: CoFHE is live on Arbitrum Sepolia, and Fhenix partners with Offchain Labs. Arbitrum is the best home, not the only one.

## 4. Hardening pass
- [ ] `/solidity-auditor` on `src/`, fix findings
- [ ] `/audit-prep` for NatSpec and hygiene
- [ ] `grep -rn "emit" src/`: no plaintext amounts
- [ ] Every `e*` storage write is followed by `allowThis`
- [ ] No keys in the repo: `git log --all -- .env` is empty, and `git grep -niE "private_key|--private-key|envUint\(\"PRIVATE"` finds nothing

## 5. Submission
- [ ] README via `/hackathon-readme`. It mines deployments and tx hashes for evidence.
- [ ] Include: deployed + verified addresses, the "unreadable withdraw" Arbiscan link, demo video, architecture diagram (`architecture.md` §5), limits section
- [ ] Live frontend on Vercel, pointing at Arbitrum Sepolia
- [ ] Tick every box in [README.md](README.md#progress)

## Commit
`docs: demo script, README, submission assets`
