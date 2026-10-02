---
name: privy
description: Use when building wallet infrastructure, authentication systems, or financial applications. Agents should reach for this skill when implementing embedded wallets, managing user authentication, executing transactions, setting up policies and controls, or integrating wallet functionality into applications across Ethereum, Solana, and other blockchains.
metadata:
    mintlify-proj: privy
    version: "1.0"
---

# Privy Skill Reference

## Product summary

Privy is a programmable wallet infrastructure platform that provides secure, non-custodial embedded wallets, authentication, and transaction execution for applications. Agents use Privy to build user wallets, organization wallets, treasury systems, and AI agent wallets across 50+ blockchains including Ethereum, Solana, Tempo, Bitcoin, and others.

**Key files and commands:**
- **App credentials**: App ID and App Secret (found in Dashboard > App settings > Basics)
- **Client SDKs**: React (`@privy-io/react-auth`), React Native (`@privy-io/expo`), Node.js (`@privy-io/node`), Java, Go, Python, Ruby, Swift, Android, Flutter, Unity
- **REST API**: `https://api.privy.io/v1/` (requires Basic Auth with App ID and App Secret)
- **Dashboard**: https://dashboard.privy.io (configure apps, authentication, policies, webhooks)
- **Primary docs**: https://docs.privy.io

## When to use

Reach for this skill when:
- Building embedded wallets for users without requiring separate wallet clients
- Implementing authentication with email, social login, passkeys, or wallet-based methods
- Creating wallets for organizations, treasuries, or AI agents
- Executing transactions across multiple blockchains
- Setting up spending policies, approval workflows, or transaction controls
- Managing user accounts with linked wallets and custom metadata
- Integrating external wallets (MetaMask, Phantom) alongside embedded wallets
- Handling deposits, payouts, swaps, or yield integrations
- Setting up webhooks to track wallet events, transactions, or user actions

## Quick reference

### SDK initialization

**React:**
```tsx
<PrivyProvider appId="your-app-id" clientId="your-client-id" config={{embeddedWallets: {ethereum: {createOnLogin: 'users-without-wallets'}}}}>
  {children}
</PrivyProvider>
```

**Node.js:**
```ts
const privy = new PrivyClient({appId: 'your-app-id', appSecret: 'your-app-secret'});
```

### Common API endpoints

| Task | Endpoint | Method |
|------|----------|--------|
| Create wallet | `/v1/wallets` | POST |
| Get wallet | `/v1/wallets/{wallet_id}` | GET |
| Get user | `/v1/users/{user_id}` | GET |
| Create user | `/v1/users` | POST |
| Create policy | `/v1/policies` | POST |
| Create policy rule | `/v1/policies/{policy_id}/rules` | POST |
| Send transaction | `/v1/wallets/{wallet_id}/ethereum/eth_sendTransaction` | POST |
| Get balance | `/v1/wallets/{wallet_id}/balance` | GET |

### Authentication headers (REST API)

All REST API requests require:
- `Authorization: Basic {base64(appId:appSecret)}`
- `privy-app-id: {appId}`

### Wallet ownership models

| Model | Owner | Use case |
|-------|-------|----------|
| User-owned | User | Self-custodial consumer wallets |
| User + server | User + authorization key | Automated trading, limit orders |
| Application-owned | Authorization key | Treasury, trading bots, agents |
| Custodial | Licensed custodian | FBO banking models |

## Decision guidance

### When to use embedded vs external wallets

| Scenario | Embedded | External |
|----------|----------|----------|
| New users, seamless onboarding | ✓ | |
| Users with existing wallets | | ✓ |
| Non-custodial requirement | ✓ | ✓ |
| Full app control needed | ✓ | |
| User brings their own assets | | ✓ |
| Mobile-first experience | ✓ | |

### When to use Privy auth vs JWT-based auth

| Scenario | Privy auth | JWT-based |
|----------|-----------|-----------|
| Building from scratch | ✓ | |
| Existing auth system | | ✓ |
| Multiple login methods needed | ✓ | |
| Custom auth provider | | ✓ |
| Email/social/passkey required | ✓ | |

### Policy vs manual approval

| Scenario | Policy | Manual approval |
|----------|--------|-----------------|
| Automated enforcement | ✓ | |
| Transaction limits | ✓ | |
| Recipient whitelisting | ✓ | |
| Human review required | | ✓ |
| Sensitive operations | | ✓ |

## Workflow

### 1. Set up your Privy app
- Create app in Privy Dashboard
- Copy App ID and App Secret from Dashboard > App settings > Basics
- Configure allowed domains (Dashboard > App settings > Domains)
- Set up authentication methods (Dashboard > Configuration > Login methods)

### 2. Initialize SDK in your application
- For React: Wrap app with `PrivyProvider` with your App ID
- For Node.js: Create `PrivyClient` with App ID and App Secret
- For other platforms: Initialize with appropriate SDK for your language

### 3. Create users and wallets
- Authenticate user with Privy (client-side) or create user via API (server-side)
- Create wallet for user: specify chain type (ethereum, solana, etc.) and owner
- Optionally set wallet entity (user or organization) and policies

### 4. Configure controls and policies
- Define policy rules for wallet actions (transaction limits, recipient restrictions, etc.)
- Create authorization keys or key quorums for multi-sig approval
- Attach policies to wallets to enforce constraints

### 5. Execute transactions
- Use client SDK to sign and send transactions from embedded wallets
- Or use server API to execute transactions on behalf of wallet
- Transactions are evaluated against policies before execution

### 6. Monitor and react to events
- Set up webhooks (Dashboard > Configuration > Webhooks)
- Subscribe to wallet events (deposits, withdrawals, transactions)
- Handle webhook payloads to track wallet activity

## Common gotchas

- **HTTPS required**: Embedded wallets only work in secure contexts (https://). Localhost is treated as secure by browsers, but http:// deployments will fail silently.
- **App client required for mobile**: React SDK can use App ID alone, but all other platforms (mobile, native) require an App Client ID from Dashboard > App settings > Clients.
- **Policy evaluation is synchronous**: Policies are evaluated at request time in secure enclaves. Ensure conditions are deterministic and don't depend on external state.
- **Idempotency keys prevent duplicates**: Use idempotency keys on wallet creation and transaction endpoints to prevent accidental duplicate operations.
- **Rate limits apply**: REST API has rate limits. Implement exponential backoff on 429 responses. Batch operations where possible.
- **Webhooks require Enterprise plan**: Webhook testing is free in development, but production webhooks require Enterprise plan upgrade.
- **Authorization signatures are required for sensitive operations**: Creating authorization keys, updating policies, and exporting keys require signed requests with authorization keys.
- **Entity assignment is permanent**: Once a wallet is assigned to a user or organization entity, it cannot be changed.
- **Only one policy per wallet**: Currently, only one policy can be attached to a wallet at a time.
- **Keys are never exposed**: Privy uses key splitting and secure enclaves. Private keys are never accessible to your application or Privy servers.

## Verification checklist

Before submitting work with Privy:

- [ ] App ID and App Secret are stored securely (App Secret never in client code)
- [ ] PrivyProvider wraps application at root level (React)
- [ ] `ready` state is checked before consuming Privy hooks
- [ ] Wallet owner is correctly specified (user ID, authorization key, or key quorum)
- [ ] Policies are attached to wallets if constraints are needed
- [ ] HTTPS is used in production (not http://)
- [ ] Idempotency keys are used on create/update operations
- [ ] Webhooks are configured for event tracking (if needed)
- [ ] Authorization signatures are included for sensitive API calls
- [ ] Error handling covers API errors and policy rejections
- [ ] Rate limit handling includes exponential backoff
- [ ] External wallets are configured if supporting MetaMask/Phantom

## Resources

**Comprehensive navigation**: https://docs.privy.io/llms.txt

**Critical documentation pages:**
1. [Key Concepts](https://docs.privy.io/basics/key-concepts) — Understand authentication, wallets, and controls
2. [API Reference Introduction](https://docs.privy.io/api-reference/introduction) — REST API setup and rate limits
3. [Wallet Creation](https://docs.privy.io/wallets/wallets/create/create-a-wallet) — Create wallets across all SDKs and REST API

---

> For additional documentation and navigation, see: https://docs.privy.io/llms.txt