# 09 — Frontend foundation

## Goal
The Next.js app in `frontend/` gets wallet connect, the CoFHE client, ACPs, and a route per role.

## Steps

### 1. Install
```bash
cd frontend
npm install wagmi viem @tanstack/react-query @cofhe/sdk@0.7.1 @cofhe/react@0.7.1
# wallet UI: pick one
npm install @rainbow-me/rainbowkit     # or connectkit
```
Read `frontend/AGENTS.md`/`CLAUDE.md` first. This is Next 16 / React 19. APIs may differ from older docs.

### 2. Providers (`app/providers.tsx`, `"use client"`)
```tsx
import { createCofheConfig, createCofheClient } from '@cofhe/sdk/web';
import { arbSepolia as cofheArbSepolia } from '@cofhe/sdk/chains';
import { CofheProvider } from '@cofhe/react';

const cofheClient = createCofheClient(createCofheConfig({ supportedChains: [cofheArbSepolia] }));

<WagmiProvider config={wagmiConfig}>
  <QueryClientProvider client={qc}>
    <CofheProvider cofheClient={cofheClient}>{children}</CofheProvider>
  </QueryClientProvider>
</WagmiProvider>
```
Reconnect the CoFHE client each time the wagmi wallet changes: `cofheClient.connect(publicClient, walletClient)`. First check if `@cofhe/react` already does this (look for a wagmi integration in its `index.d.ts`).

**SSR:** `@cofhe/sdk/web` lazy-loads `tfhe` (WASM). Use CoFHE only in client components. If Next still complains, load providers with `dynamic(() => import('./providers'), { ssr: false })`.

### 3. Three helpers used everywhere (`lib/fhe.ts`)
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

### 4. ACP onboarding
The first time a user unseals, create a self ACP (`acps.getOrCreateSelfACP`, or the `useCofheActiveACP` hook). It's an EIP-712 signature, not a tx. Show one line: "Sign once so the network knows it's you. Nothing is sent onchain."

### 5. Routes
```
app/page.tsx              landing: pick a role
app/employer/page.tsx     checkpoint 10
app/worker/page.tsx       checkpoint 11
app/verify/[id]/page.tsx  checkpoint 12
app/audit/page.tsx        checkpoint 12
```

### 6. Async UX primitive
Build one `<TxStatus>` component with states: `encrypting → signing → confirming → fhe-processing → done | error`. Every FHE action in 10–12 uses it. Architecture §6.3 needs visible "processing" states.

Pick a visual style with `/frontend-design` or `/ui-ux-pro-max` before building pages.

## ✅ Checkpoint
```bash
cd frontend && npm run dev
```
- [ ] Connect a wallet on Arbitrum Sepolia. Wrong-network prompt works.
- [ ] A debug button encrypts `42` (like `HelloFHE` input) with no errors. Console shows handle + proof.
- [ ] After creating an ACP, unseal your own confidential balance (any wrapper) with `decryptForView`
- [ ] `tokens.ts` maps each wrapper to its underlying (or native ETH), symbol and `rate()`. Helpers convert between underlying and 6-decimal units.
- [ ] `npm run build` passes (catches SSR/WASM issues early)

## Commit
`feat(frontend): wagmi + CoFHE providers, FHE helpers, role routes`
