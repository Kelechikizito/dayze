# 09 — Frontend foundation

## Goal
The Next.js app in `frontend/` gets Privy login, the CoFHE client, ACPs, onboarding routes, and a route per role.

## Steps

### 1. Install

**To do:**
- [ ] Read `frontend/AGENTS.md` and `frontend/CLAUDE.md`
- [ ] Run both install commands below
- [ ] Pin exact versions in `package.json` (no `^`)

```bash
cd frontend
npm install wagmi viem @tanstack/react-query @cofhe/sdk@0.7.1 @cofhe/react@0.7.1
npm install @privy-io/react-auth @privy-io/wagmi
```
Read `frontend/AGENTS.md`/`CLAUDE.md` first. This is Next 16 / React 19. APIs may differ from older docs.

**Why Privy:** workers sign up with email or Google and get an embedded wallet. No seed phrase, no extension. People who already have a wallet (MetaMask, Rabby) can still connect it. Landlords opening a credential link sign in the same way.

### 2. Privy dashboard
**To do:**
- [ ] Create an app at [dashboard.privy.io](https://dashboard.privy.io). Copy the **App ID**.
- [ ] Turn on login methods: email, Google, wallet
- [ ] Add allowed domains: `localhost:3000` and your Vercel URL
- [ ] Put the App ID in `frontend/.env.local` as `NEXT_PUBLIC_PRIVY_APP_ID`

The App ID is public. The **App Secret** is not. You don't need the secret until checkpoint 15.

### 3. Providers (`app/providers.tsx`, `"use client"`)

**To do:**
- [ ] Create `app/providers.tsx` as a client component (code below)
- [ ] Wrap the children in `app/layout.tsx` with `<Providers>`
- [ ] Add `NEXT_PUBLIC_ARB_SEPOLIA_RPC` to `frontend/.env.local`
- [ ] Add Log in / Log out buttons with `usePrivy()`
- [ ] Reconnect the CoFHE client when the wallet changes
- [ ] Send a little Arbitrum Sepolia ETH to your test embedded wallet

Import `createConfig` and `WagmiProvider` from **`@privy-io/wagmi`**, not from `wagmi`. The order matters: Privy → React Query → wagmi.
```tsx
import { PrivyProvider } from '@privy-io/react-auth';
import { WagmiProvider, createConfig } from '@privy-io/wagmi';
import { arbitrumSepolia } from 'viem/chains';
import { http } from 'wagmi';
import { createCofheConfig, createCofheClient } from '@cofhe/sdk/web';
import { arbSepolia as cofheArbSepolia } from '@cofhe/sdk/chains';
import { CofheProvider } from '@cofhe/react';

const wagmiConfig = createConfig({
  chains: [arbitrumSepolia],
  transports: { [arbitrumSepolia.id]: http(process.env.NEXT_PUBLIC_ARB_SEPOLIA_RPC) },
});
const cofheClient = createCofheClient(createCofheConfig({ supportedChains: [cofheArbSepolia] }));

<PrivyProvider
  appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
  config={{
    loginMethods: ['email', 'google', 'wallet'],
    defaultChain: arbitrumSepolia,
    supportedChains: [arbitrumSepolia],
    embeddedWallets: { ethereum: { createOnLogin: 'users-without-wallets' } },
  }}
>
  <QueryClientProvider client={qc}>
    <WagmiProvider config={wagmiConfig}>
      <CofheProvider cofheClient={cofheClient}>{children}</CofheProvider>
    </WagmiProvider>
  </QueryClientProvider>
</PrivyProvider>
```
Use Privy's `login()` / `logout()` from `usePrivy()` for the buttons. After login, the active wallet shows up in wagmi as usual (`useAccount`, `useWalletClient`).

Reconnect the CoFHE client each time the wagmi wallet changes: `cofheClient.connect(publicClient, walletClient)`. First check if `@cofhe/react` already does this (look for a wagmi integration in its `index.d.ts`).

**Gas:** an embedded wallet starts empty. For the demo, send each new wallet a little Arbitrum Sepolia ETH from a faucet or your deployer. Privy's gas sponsorship is an option later. Check that it supports Arbitrum Sepolia before you plan on it.

**SSR:** `@cofhe/sdk/web` lazy-loads `tfhe` (WASM). Use CoFHE only in client components. If Next still complains, load providers with `dynamic(() => import('./providers'), { ssr: false })`.

### 4. Three helpers used everywhere (`lib/fhe.ts`)

**To do:**
- [ ] Create `lib/fhe.ts` with `encrypt`, `unseal` and `decryptForTx` helpers (code below)
- [ ] Check the return shapes in `node_modules/@cofhe/sdk/core/`
- [ ] Create `lib/tokens.ts`: each wrapper → underlying token, symbol and `rate()`, plus unit conversion helpers

```ts
// encrypt for a specific contract
const [handle, proof] = await cofhe
  .encryptInputs([Encryptable.uint64(amount)])
  .setConsumingContract(PAYROLL)
  .execute();

// unseal something you're allowed to see (self ACP)
const value = await cofhe.decryptForView(handle, FheTypes.Uint64).withACP().execute();

// public decrypt for a tx (the policy bit, unshield claims)
const res = await cofhe.decryptForTx(handle).withoutACP().execute();
```
Check the return shapes in `node_modules/@cofhe/sdk/core/`. Fix these helpers once.

### 5. ACP onboarding

**To do:**
- [ ] Write a `useEnsureACP()` hook that creates a self ACP the first time it's needed
- [ ] Show the one-line explanation before the signature
- [ ] Test it with an embedded wallet

The first time a user unseals, create a self ACP (`acps.getOrCreateSelfACP`, or the `useCofheActiveACP` hook). It's an EIP-712 signature, not a tx. Show one line: "Sign once so the network knows it's you. Nothing is sent onchain."

Privy embedded wallets support EIP-712 (`eth_signTypedData_v4`), so ACPs work the same as with MetaMask. Test this early. If Privy shows its own confirm modal, that's fine.

### 6. Routes

**To do:**
- [ ] Create each page file below with a placeholder
- [ ] Landing page: two buttons, "I'm an employer" and "I'm an employee"
- [ ] Add the redirect rule after login (below)

```
app/page.tsx                          landing: "I'm an employer" / "I'm an employee"
app/onboarding/employer/page.tsx      checkpoint 10, first visit only
app/onboarding/employee/page.tsx      checkpoint 11, first visit only (opened from an invite link)
app/employer/page.tsx                 checkpoint 10
app/worker/page.tsx                   checkpoint 11
app/verify/[id]/page.tsx              checkpoint 12
app/audit/page.tsx                    checkpoint 12
app/api/world-id/rp-signature/route.ts   checkpoint 07a
app/api/world-id/attest/route.ts         checkpoint 07a
```
Use two routes for onboarding, not a query string like `?employee:employer`. Each flow has its own steps and its own URL.

**Redirect rule:** after login, if the user has no org and no streams, and they haven't finished onboarding, send them to the right onboarding route. Keep a "finished" flag in `localStorage`. It's only a UX hint, so losing it is fine: the onboarding pages read the chain and skip the steps that are already done.

### 7. Shared `<Stepper>` component

**To do:**
- [ ] Create `components/Stepper.tsx`
- [ ] Each step takes a title, a help line, a status and an action
- [ ] Get each status from a chain read, not from clicks

Both onboarding flows use one stepper. Each step has: a title, one line of help, a status (`todo | active | done | skipped`), and an action. A step is **done** when the chain says so, not when the user clicks. For example, "Create org" is done when `orgs(me).exists` is true. Then a refresh never loses progress.

### 8. Async UX primitive

**To do:**
- [ ] Create `components/TxStatus.tsx` with the states below
- [ ] Pick a visual style before you build pages

Build one `<TxStatus>` component with states: `encrypting → signing → confirming → fhe-processing → done | error`. Every FHE action in 10–12 uses it. Architecture §6.3 needs visible "processing" states.

Pick a visual style with `/frontend-design` or `/ui-ux-pro-max` before building pages.

## ✅ Checkpoint
```bash
cd frontend && npm run dev
```
- [ ] Sign up with email → an embedded wallet appears on Arbitrum Sepolia
- [ ] Connect an external wallet (MetaMask) instead. Wrong-network prompt works.
- [ ] Create an ACP with the **embedded** wallet. The EIP-712 signature works.
- [ ] A debug button encrypts `42` (like `HelloFHE` input) with no errors. Console shows handle + proof.
- [ ] After creating an ACP, unseal your own confidential balance (any wrapper) with `decryptForView`
- [ ] `tokens.ts` maps each wrapper to its underlying (or native ETH), symbol and `rate()`. Helpers convert between underlying and 6-decimal units.
- [ ] `npm run build` passes (catches SSR/WASM issues early)

## Commit
`feat(frontend): Privy + wagmi + CoFHE providers, FHE helpers, role and onboarding routes`
