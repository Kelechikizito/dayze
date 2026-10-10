# Testing to-do

Manual checks that are waiting on you. Tick them off as you go.

## Before testing: wallet setup

- [ ] **Fund the embedded wallet.** Send 0.005 ETH on Arbitrum Sepolia from your MetaMask/deployer wallet (`0xDBC2…`) to the embedded wallet `0x06ce0d513728d32f36d90334A33AA48272e005Df`:
  ```bash
  cast send 0x06ce0d513728d32f36d90334A33AA48272e005Df --value 0.005ether \
    --account sepolia-acc --rpc-url arbitrum_sepolia
  ```
- [ ] **Fix MetaMask's RPC** (if you test with MetaMask). It was failing with `RPC 0x66eee Custom eth_gasPrice: Request is being rate limited`. MetaMask → Networks → Arbitrum Sepolia → Edit → Add RPC URL → your Alchemy Arbitrum Sepolia URL → set as default.
- [ ] **Optional:** add `NEXT_PUBLIC_ARB_SEPOLIA_RPC` and `NEXT_PUBLIC_BASE_SEPOLIA_RPC` to `frontend/.env.local`, then restart `npm run dev`. The embedded wallet and the app's reads then use your RPC instead of public ones. Use a separate Alchemy app with allowed origins set to `localhost:3000` and your Vercel domain.

## World ID setup (before testing Selfie Check)

- [ ] Add `NULLIFIER_SALT` to `frontend/.env.local`: `echo "NULLIFIER_SALT=0x$(openssl rand -hex 32)" >> frontend/.env.local`. Never change it afterwards. Restart `npm run dev`.
- [ ] Developer Portal → your Dayze app: `app_mode` is **external** (not mini-app).
- [ ] **Selfie Check (Beta)** is enabled for the Dayze app. It's per-app: Herit having it doesn't mean Dayze does. If it's off, ask your World contact, or use the Herit app's ids for the demo.
- [ ] The action `dayze-register` exists in the environment in `NEXT_PUBLIC_WLD_ENVIRONMENT` (sandbox, staging or production).
- [ ] If the widget still fails, read the message under the button and the `[dayze] World ID debug report` line in the browser console. The dev server log shows `[world-id] attest rejected: …`.

## Checkpoint 09: last check

- [ ] Shield some cUSDC to the logged-in wallet, open `/debug`, click **Create ACP**, then **Unseal cUSDC**. It should show the shielded amount.
- [ ] Log in with MetaMask on a wrong network: the banner should offer to switch.

## Checkpoint 10: employer console

Go to http://localhost:3000/onboarding/employer.

- [ ] Create your organisation.
- [ ] Fund: Mint 10,000 test USDC → Shield 5000 → Allow payroll → Fund privately 5000. The vault balance should reveal as 5000 cUSDC.
- [ ] Set approvers (your address plus one other wallet, 2 of 2) and a cUSDC threshold of 10000.
- [ ] Add an auditor. Copy the invite link.
- [ ] Refresh mid-onboarding: the wizard should resume at the right step.
- [ ] In `/employer`, create a 3,000 cUSDC stream. It should go **Active** on its own after "Checking policy privately…".
- [ ] Create a 12,000 cUSDC stream. It should go **Needs approval**. Approve it from both approver wallets, then **Activate**.
- [ ] A verified payee shows "✓ verified human"; an unverified one shows "not verified".
- [ ] Every action shows the TxStatus stages, with no silent waits.
- [ ] If anything fails, copy the `[dayze] transaction failed` line from the browser console.

Once these pass: tick 08, 09 and 10 in `build-guide/README.md`.

## Join requests and email (new)

- [ ] Add `JoinRequests` to the live Arbitrum deployment: `make deploy-join-requests` (keystore password; about 0.001 ETH). It writes `joinRequests` into `deployments/421614.json` and re-exports the addresses.
- [ ] Email: create a free Resend account (resend.com) → API key → add `RESEND_API_KEY=…` to `frontend/.env.local`, then restart `npm run dev`. Without a verified domain, Resend's test sender (`onboarding@resend.dev`) only delivers to **your own Resend account's email**, so test with an employee logged in with that email. For the demo, verify a domain and set `NOTIFY_FROM_EMAIL="Dayze <pay@yourdomain>"`.
- [ ] Optional: `NEXT_PUBLIC_APP_URL=https://<your vercel url>` so email links point at the deployed app (defaults to the current origin).
- [ ] Employee: open the invite link → step 4 "Ask <org> to pay you" → approve the tx → "✓ Request sent…". The box below shows where pay emails go, or an "Add an email" button for wallet logins.
- [ ] Employer: `/employer` → Salary streams shows **Join requests** with the worker and their human badge → **Set salary** fills in New stream → start it → the request disappears from the list.
- [ ] The employee gets "<Org> started paying you on Dayze" (or "set up your pay…" if it needs approval, then "started paying you" after Activate). The email has no amounts.
- [ ] If no email arrives, the browser console shows `[dayze] no email sent: <reason>` and the dev server log shows `[notify] …`.
- [ ] Email invite: in the invite step (or the console's Salary streams), type an email under "Or invite by email" → sign the message in your wallet (no gas) → "Invite sent to …". The employee gets "<Org> invited you to get paid on Dayze" with the invite link. Needs `RESEND_API_KEY`; in Resend's test mode it only reaches your own Resend account's email.
- [ ] Fallback still works: under "Other ways", the pay-me link opens `/employer?payee=…` with New stream filled in.

## Checkpoint 11: worker app

Use a second wallet as the employee: a different Google/email login in another browser profile. Fund it with 0.005 ETH too, since withdraw, cash out, World ID and income proofs are all transactions.

- [ ] Employer copies the invite link → the employee opens it → "invited by <org name>" shows.
- [ ] World ID **Selfie Check** in sandbox (`NEXT_PUBLIC_WLD_ENVIRONMENT=sandbox`, scan with the **World ID (Sandbox)** app) → "✓ verified human". It's one-time per person: use a sandbox account you can reset. If `register` fails after the selfie, the **Finish registration** button retries without a new selfie. This also completes 07a. If `attest` rejects it, check the dev server log for `[world-id] verify rejected` with the expected and actual environment.
- [ ] Or skip World ID: everything still works, and the payee shows "not verified".
- [ ] Unlock (ACP signature) → copy the address → the employer starts a stream for it → the employee page moves to `/worker` by itself.
- [ ] `/worker`: click "Show my pay" once. The balance ticks smoothly, with 6 decimals and "Updating live. 0 transactions."
- [ ] Withdraw a little → "Withdrew X cUSDC". Withdraw more than available → the "nothing moved" message, with no revert.
- [ ] The withdraw tx on Arbiscan shows no readable amount. Screenshot it for the pitch.
- [ ] Cash out: confirm the public-amount warning → Unshield → Decrypt → Claim → USDC lands in the wallet (or ETH for cETH).
- [ ] Issue an income proof (5-minute expiry) → copy the link / QR → the countdown runs → Revoke works.

## Interaction scripts not tested yet

These need a stream, so test them after the checkpoint 10 streams exist:

- [ ] `make approve PAYER=0x… STREAM=<id>`
- [ ] `make activate STREAM=<id>`
- [ ] `make cancel-stream STREAM=<id>`

## Checkpoint 07a: World ID end to end

Built: it's step 2 of the employee onboarding (`/onboarding/employee`).

- [ ] Verify with the sandbox World ID app (`sandbox`). `attest` returns `{ nullifier, deadline, signature }`, `HumanRegistry.register` succeeds, and the payee shows "✓ verified human".

## Base Sepolia

- [ ] Get Base Sepolia ETH (Alchemy faucet, Coinbase developer faucet, or the Superchain faucet).
- [ ] `make deploy-base`, then `make export-abis` and `make test-fork CHAIN=base_sepolia`.

## Before the demo (checkpoint 14)

- [ ] Every new embedded wallet starts with 0 ETH. Either top up each demo wallet, or turn on Privy gas sponsorship (check it supports Arbitrum Sepolia first).
- [ ] Set `NEXT_PUBLIC_WLD_ENVIRONMENT` in Vercel: `sandbox` to demo with the sandbox app, `production` for real World IDs.
- [ ] Delete `/debug` or keep it unlinked.
