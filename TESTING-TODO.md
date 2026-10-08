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

## Interaction scripts not tested yet

These need a stream, so test them after the checkpoint 10 streams exist:

- [ ] `make approve PAYER=0x… STREAM=<id>`
- [ ] `make activate STREAM=<id>`
- [ ] `make cancel-stream STREAM=<id>`

## Checkpoint 07a: World ID end to end

Needs the worker onboarding from checkpoint 11.

- [ ] Verify with the World ID simulator (`staging`). `attest` returns `{ nullifier, deadline, signature }`, `HumanRegistry.register` succeeds, and the payee shows "✓ verified human".

## Base Sepolia

- [ ] Get Base Sepolia ETH (Alchemy faucet, Coinbase developer faucet, or the Superchain faucet).
- [ ] `make deploy-base`, then `make export-abis` and `make test-fork CHAIN=base_sepolia`.

## Before the demo (checkpoint 14)

- [ ] Every new embedded wallet starts with 0 ETH. Either top up each demo wallet, or turn on Privy gas sponsorship (check it supports Arbitrum Sepolia first).
- [ ] Set `WORLDID_ENVIRONMENT=production` in Vercel if you'll demo with a real World ID.
- [ ] Delete `/debug` or keep it unlinked.
