# 09 — Frontend foundation

## Goal
Next.js app (already scaffolded in `frontend/`) with wallet connection, the CoFHE client, ACPs, and routes for each role.

## Steps

### 1. Install
```bash
cd frontend
npm install wagmi viem @tanstack/react-query @cofhe/sdk@0.7.1 @cofhe/react@0.7.1
# wallet UI: pick one
npm install @rainbow-me/rainbowkit     # or connectkit
```
Read `frontend/AGENTS.md`/`CLAUDE.md` first: this is Next 16 / React 19, and APIs may differ from older docs.

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
Then connect the CoFHE client whenever the wagmi wallet changes: `cofheClient.connect(publicClient, walletClient)`. Check whether `@cofhe/react` already does this for you (look for a wagmi integration in its `index.d.ts`) before writing it yourself.

**SSR:** `@cofhe/sdk/web` lazy-loads `tfhe` (WASM). Keep all CoFHE usage in client components, and if Next still complains, load the providers with `dynamic(() => import('./providers'), { ssr: false })`.

### 3. Three helpers you'll use everywhere (`lib/fhe.ts`)
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
Verify the exact return shapes against `node_modules/@cofhe/sdk/core/` and fix these helpers once.

### 4. ACP onboarding
The first time a user needs to unseal, create a self ACP (`acps.getOrCreateSelfACP`, or the `useCofheActiveACP` hook). It's an EIP-712 signature, not a tx. Show a one-line explainer: "Sign once so the network knows it's you. Nothing is sent onchain."

### 5. Routes
```
app/page.tsx              landing: pick a role
app/employer/page.tsx     checkpoint 10
app/worker/page.tsx       checkpoint 11
app/verify/[id]/page.tsx  checkpoint 12
app/audit/page.tsx        checkpoint 12
```

### 6. Async UX primitive
Build one `<TxStatus>` component with states: `encrypting → signing → confirming → fhe-processing → done | error`. Every FHE action in 10–12 uses it. Architecture §6.3 requires visible "processing" states.

Use `/frontend-design` or `/ui-ux-pro-max` to pick a visual direction before building pages.

## ✅ Checkpoint
```bash
cd frontend && npm run dev
```
- [ ] Connect a wallet on Arbitrum Sepolia; wrong-network prompt works
- [ ] A debug button encrypts `42` for `HelloFHE`-style input without errors (console shows handle + proof)
- [ ] Unseal your own confidential balance (any wrapper) via `decryptForView` after creating an ACP
- [ ] A `tokens.ts` list maps each wrapper to its underlying (or native ETH), symbol and `rate()`, and helpers convert between underlying and 6-decimal confidential units
- [ ] `npm run build` passes (catches SSR/WASM issues early)

## Commit
`feat(frontend): wagmi + CoFHE providers, FHE helpers, role routes`
