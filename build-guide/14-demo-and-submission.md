# 14 — Demo + submission

## 1. Demo configuration
- Contracts deployed with `PERIOD = 600` (a "month" is 10 minutes), so salaries visibly accrue
- Pre-seeded: org "Acme Labs", policy $10k with 2 approvers, 1 auditor, streams of $3k (Active) and $6k (Active); keep $12k ready to create live
- Separate browser profiles: **Employer**, **Worker**, **Landlord**, **Auditor**, each with its wallet connected and ACPs already signed
- Keeper script running (auto-resolves policy checks)

## 2. Demo script (~3 minutes)
1. **Problem (20s):** show a normal USDC payroll tx on Arbiscan. "Everyone can see this salary, forever."
2. **Employer (40s):** create the $12k stream → "Checking policy privately…" → Pending → second wallet approves → Active. "The threshold is encrypted. The contract compared two numbers it can't read."
3. **Worker (40s):** balance ticking. "Zero transactions." Withdraw. Open the tx on Arbiscan: **nothing readable**.
4. **Credential (50s):** landlord asks for ≥ $3k. Worker issues with a 2-minute expiry → sends link → landlord sees ✅. Wrong wallet can't unseal. Wait → banner flips to **Expired** live.
5. **Auditor (20s):** unseal + CSV, generated in the browser.
6. **Close (10s):** "A salary never exists in plaintext onchain. Proving income reveals one bit, to one person, for a limited time."

Rehearse against live testnet at least twice; decrypt latency varies. Record a backup video.

## 3. Talking points (from architecture §5, §8)
- Say **"zero-knowledge income check, enforced by FHE"**, not "ZK proof". Be ready to explain why an FHE comparison beats a SNARK here: it's computed from the stream's own ciphertext, so it can't drift from what the worker is actually paid.
- Be upfront about the limits: shield/unshield amounts are public; payee addresses are visible in v0.1; the policy leaks one bit; auditor grants are sticky; credentials are "as of issuance"; Dayze proves what a contract pays, not who the employer is.
- Arbitrum: CoFHE is live on Arbitrum Sepolia, and Fhenix partners with Offchain Labs. Arbitrum is the best venue, not the only one.

## 4. Hardening pass
- [ ] `/solidity-auditor` on `src/`, and fix findings
- [ ] `/audit-prep` for NatSpec and hygiene
- [ ] `grep -rn "emit" src/`: no plaintext amounts
- [ ] Every `e*` storage write is followed by `allowThis`
- [ ] `.env` not in git history: `git log --all -- .env` is empty

## 5. Submission
- [ ] README via `/hackathon-readme`: it mines deployments and tx hashes for evidence
- [ ] Include: deployed + verified addresses, the "unreadable withdraw" Arbiscan link, demo video, architecture diagram (from `architecture.md` §5), limits section
- [ ] Live frontend deployed (Vercel), pointing at Arbitrum Sepolia
- [ ] Tick every box in [README.md](README.md#progress)

## Commit
`docs: demo script, README, submission assets`
