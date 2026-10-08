# 09 — Frontend foundation

## Goal
The Next.js app in `frontend/` gets Privy login, the CoFHE client, ACPs, onboarding routes, and a route per role.

## Steps

### 1. Install

**To do:**
- [ ] Read `frontend/AGENTS.md` and `frontend/CLAUDE.md`
- [ ] Run both install commands below
- [ ] Pin exact versions in `package.json` (no `^`)
- [ ] Switch the build script to webpack: `"build": "next build --webpack"` (see **Build** below)

```bash
cd frontend
npm install --save-exact wagmi@2.19.5 viem@2.56.5 @tanstack/react-query@5.90.7 \
  @cofhe/sdk@0.7.1 @cofhe/react@0.7.1 @privy-io/react-auth@3.48.0 @privy-io/wagmi@4.0.18
```
Why these versions:
- `@privy-io/wagmi` 4.x needs **exactly** `viem 2.56.5`.
- `@cofhe/sdk` 0.7.1 expects `@wagmi/core` v2, so use **wagmi 2.x**, not 3.
- `@cofhe/react` 0.7.1 bundles React Query 5.90.7. Pin the same so there's one copy.
- Keep CoFHE at 0.7.1 to match the contracts in `lib/`.
Read `frontend/AGENTS.md`/`CLAUDE.md` first. This is Next 16 / React 19. APIs may differ from older docs.

**Why Privy:** workers sign up with email or Google and get an embedded wallet. No seed phrase, no extension. People who already have a wallet (MetaMask, Rabby) can still connect it. Landlords opening a credential link sign in the same way.

### 2. Privy dashboard
**To do:**
- [ ] Create an app at [dashboard.privy.io](https://dashboard.privy.io). Copy the **App ID**.
- [ ] Turn on login methods: email, Google, wallet
- [ ] Add allowed domains: `localhost:3000` and your Vercel URL
- [ ] Put the App ID in `frontend/.env.local` as `NEXT_PUBLIC_PRIVY_APP_ID`. Without the prefix, the browser never sees it.

The App ID is public. The **App Secret** is not. You don't need the secret until checkpoint 15.

### 3. Providers (`app/providers.tsx`, `"use client"`)

**To do:**
- [ ] Create `app/providers.tsx` as a client component (code below)
- [ ] Wrap the children in `app/layout.tsx` with `<Providers>`
- [ ] Support both chains: Arbitrum Sepolia and Base Sepolia (`lib/chains.ts`)
- [ ] Optional: add `NEXT_PUBLIC_ARB_SEPOLIA_RPC` and `NEXT_PUBLIC_BASE_SEPOLIA_RPC` to `frontend/.env.local`. Without them viem uses public RPCs. An Alchemy URL here ships to the browser, so restrict its allowed origins.
- [ ] Add Log in / Log out buttons with `usePrivy()`
- [ ] Pass wagmi's `publicClient` and `walletClient` to `<CofheProvider>`. It reconnects by itself when they change.
- [ ] Add `ActiveWalletSync`: after login, set wagmi's active wallet (see **Active wallet** below)
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

`@cofhe/react` handles reconnecting: give `<CofheProvider>` a `config` from `createCofheConfig` (from `@cofhe/react`, not `@cofhe/sdk/web`), your `queryClient`, and wagmi's `publicClient` / `walletClient` props. Its internal `AutoConnect` reconnects on every change.

**Active wallet.** If the browser also has MetaMask, Privy can log in and create the embedded wallet, but leave wagmi with **no account**. Then `useAccount()` is empty and CoFHE never connects. Fix it with a small component inside `WagmiProvider`: once `useWallets()` is ready and `useAccount().address` is empty, call `useSetActiveWallet().setActiveWallet(...)` from `@privy-io/wagmi` with the embedded wallet (`walletClientType === "privy"`), or else the first wallet.

**Gas:** an embedded wallet starts empty. For the demo, send each new wallet a little Arbitrum Sepolia ETH from a faucet or your deployer. Privy's gas sponsorship is an option later. Check that it supports Arbitrum Sepolia before you plan on it.

**SSR:** `@cofhe/sdk/web` lazy-loads `tfhe` (WASM). Use CoFHE only in client components. On the server it falls back to a no-op storage, so static pages still prerender.

**Build.** Two problems, both fixed in `next.config.ts` and `package.json`:
- wagmi's Base Account connector pulls in `@coinbase/cdp-sdk`, which imports five optional `@x402/*` packages. Point them at an empty module: `turbopack.resolveAlias` for dev, `webpack` `resolve.alias` set to `false` for build.
- Turbopack's **production** build stalls in its PostCSS worker once `@cofhe/sdk` is in the client bundle. `next dev` (Turbopack) works. Build with webpack: `"build": "next build --webpack"`. Re-test plain `next build` after upgrading Next or CoFHE.

### 4. Three helpers used everywhere (`lib/fhe.ts`)

**To do:**
- [ ] Create `lib/fhe.ts` with `encrypt`, `unseal` and `decryptForTx` helpers (code below)
- [ ] Check the return shapes in `node_modules/@cofhe/sdk/core/`
- [ ] Create `lib/tokens.ts`: each wrapper → underlying token, symbol and `rate()`, plus unit conversion helpers

```ts
// encrypt for a specific contract → [handle, proof]; one proof covers the batch
const [handle, proof] = await cofhe
  .encryptInputs([Encryptable.uint64(amount)])
  .setConsumingContract(PAYROLL)
  .execute();

// unseal something you're allowed to see (self ACP) → bigint, or boolean for FheTypes.Bool
const value = await cofhe.decryptForView(handle, FheTypes.Uint64).withACP().execute();

// public decrypt for a tx (the policy bit, unshield claims) → { ctHash, decryptedValue, signature }
const res = await cofhe.decryptForTx(handle).withoutACP().execute();
```
These shapes are checked against `@cofhe/sdk` 0.7.1. ACP methods live on `client.acp` (singular): `getActiveACP()`, `getOrCreateSelfACP()`.

### 5. ACP onboarding

**To do:**
- [ ] Write a `useEnsureACP()` hook that creates a self ACP the first time it's needed
- [ ] Show the one-line explanation before the signature
- [ ] Test it with an embedded wallet

The first time a user unseals, create a self ACP (`client.acp.getOrCreateSelfACP()`). It's an EIP-712 signature, not a tx. Show one line: "Sign once so the network knows it's you. Nothing is sent onchain."

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
app/debug/page.tsx                    checkpoint 09 checks (not linked; delete before the demo)
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

The visual style is `frontend/DESIGN.md` ("Editorial ink on cream paper"). Its tokens are in `app/globals.css`. Inter and Newsreader stand in for the paid Basel fonts.

## ✅ Checkpoint
```bash
cd frontend && npm run dev
```
- [ ] Sign up with email → an embedded wallet appears on Arbitrum Sepolia
- [ ] Connect an external wallet (MetaMask) instead. Wrong-network prompt works.
- [ ] Create an ACP with the **embedded** wallet. The EIP-712 signature works.
- [ ] A debug button encrypts `42` (like `HelloFHE` input) with no errors. Console shows handle + proof. The first run takes about 15s while it downloads the FHE keys.
- [ ] After creating an ACP, unseal your own confidential balance (any wrapper) with `decryptForView`
- [ ] `tokens.ts` maps each wrapper to its underlying (or native ETH), symbol and `rate()`. Helpers convert between underlying and 6-decimal units.
- [ ] `npm run build` passes (catches SSR/WASM issues early)

## Commit
`feat(frontend): Privy + wagmi + CoFHE providers, FHE helpers, role and onboarding routes`
