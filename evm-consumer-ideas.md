# Consumer Crypto Apps for the Colosseum Crypto World's Fair EVM Tracks

*As of 2026-09-19. Research: Colosseum Copilot (builder projects, archives) plus web search.*

## The hackathon in one screen

- **Event:** [Crypto World's Fair](https://colosseum.com/worldsfair), Colosseum's first cross-ecosystem hackathon. Online, **Sep 14 – Oct 12, 2026**. $840K in prizes, $2.5M in seed funding, and winners are considered for the Colosseum accelerator ($250K pre-seed).
- **How judging works:** every submission competes in one general pool (a $30K grand prize and 20 × $15K runner-up awards) judged on product merit, no matter which chain it runs on ([Crypto Briefing](https://cryptobriefing.com/colosseum-crypto-worlds-fair-hackathon/)). Ecosystem track prizes are paid **on top of** that.
- **EVM tracks** (from the official [track manifest](https://ColosseumOrg.github.io/hackathon-resources/crypto-worlds-fair.json)): **Ethereum L1, Base, Arbitrum, Robinhood Chain, Tempo, Hyperliquid (HyperEVM)**. The Ethereum-related tracks reportedly share about $100K. Per-track amounts aren't published on the site, so check the [official rules PDF](https://colosseum.com/legal/Crypto%20World's%20Fair%20Hackathon%20Rules.pdf).
- **What each track's resources point toward**, which is a hint at what sponsors want to see:
  - **Robinhood Chain:** building with **Stock Tokens**, stock-token price feeds, account abstraction.
  - **Tempo:** payments. Send and accept payments, **sponsored fees, virtual addresses, receive policies**, TIP-20 stablecoins, and the Machine Payments Protocol.
  - **Base:** **Base Pay** (USDC checkout), **x402** paid APIs, **Farcaster/Base Mini Apps**, Coinbase Wallet onboarding.
  - **Hyperliquid:** HyperCore trading data and actions, HyperEVM ↔ HyperCore interaction.
  - **Arbitrum:** Solidity and **Stylus (Rust)**, bridging and messaging.
  - **Ethereum L1:** a general EVM toolchain, ERC-4337 and Safe smart accounts.

**Caveat on the evidence:** Copilot's project corpus covers Colosseum's past hackathons, which were all **Solana** (8,286 projects across Renaissance, Radar, Breakout, Cypherpunk and Frontier). The prior art below therefore shows which consumer ideas were already tried and how they did with Colosseum judges. It isn't EVM-specific competition. The EVM landscape comes from web search.

## What Colosseum's judges have rewarded in consumer apps

- **Frontier (Apr 2026) consumer winners** follow one pattern: familiar finance, made social, with a real business model.
  - `alpha-group-trading`: *"groups of friends trade, chat and collaborate… instead of copying strangers on leaderboards."*
  - `peaks`: agent-managed, shareable thematic portfolios. It won and joined the accelerator.
  - `welikesports`: a fantasy sports pool that earns from **interest on pooled funds instead of a house rake**.
- **Earlier consumer and gaming winners** reinforce the "social plus game" pattern:
  - `crypto-fantasy-league-(cfl)`: 1st in Gaming, Breakout (Apr 2025), accelerator C3.
  - `capitola`: 1st in Consumer Apps, Cypherpunk (Sep 2025).
  - `toaster.trade`: 4th in Consumer Apps, Cypherpunk. A TikTok-style trading app **powered by Hyperliquid perps**.
  - `fora`: 3rd in Consumer Apps, Cypherpunk. Group-chat trading.
  - `rekt`: 3rd in DeFi, Cypherpunk, then the accelerator. Gamified mobile perps.
- **Crowded categories that keep failing to win.** Avoid these unless you have a sharp new angle:
  - **Bill splitting:** `chipin`, `divvy`, `tangerii-1`, `fatira`, `naami`, `ledger-and-pay`. Six-plus attempts, no prizes.
  - **Savings circles (ROSCA/ajo/esusu):** `krediloop`, `koopaa-1`, `rizqfi`, `huifi`, `rotare-saving`. Repeated attempts, no wins.
  - **Creator micropayment paywalls:** `truestory`, `openshelf`, `shenzu-spending`. No wins. Nick Szabo's essay [*The Mental Accounting Barrier to Micropayments*](https://nakamotoinstitute.org/library/the-mental-accounting-barrier-to-micropayments) explains why: the cost of deciding whether to pay, not the fee, is the real barrier.
- **Archive framing:** a16z's [*How stablecoins will eat payments*](https://a16zcrypto.com/posts/article/how-stablecoins-will-eat-payments) and [*State of Crypto 2025*](https://a16zcrypto.com/posts/article/state-of-crypto-report-2025) argue that stablecoin rails are ready for consumers. Pantera's [*The Great Onchain Migration*](https://panteracapital.com/blockchain-letter/the-great-onchain-migration) and Helius's [*Internet Capital Markets*](https://www.helius.dev/blog/internet-capital-markets) make the case for tokenized equities. Galaxy's [weekly note (Jan 2026)](https://www.galaxy.com/insights/research/weekly-top-stories-01-02-26) finds that most SocialFi fails, but **social features that improve trading** (the FOMO example) work.

---

## Ranked ideas

### 1. Stock Circles: group investing clubs on Robinhood Chain ⭐ top pick

**Track:** Robinhood Chain.

**Pitch:** An investing club for a group chat. Friends propose stock picks, discuss them and vote. Each member then mirrors the winning trade into **Stock Tokens** from their own wallet with one tap. The app keeps a verified onchain record of every pick, per member and per circle, plus weekly "who called it" recaps.

- **Why it can win:** it copies the pattern of the most recent consumer winners (`alpha-group-trading`, `fora`, `destreet:-trade-onchain-with-friends`) onto a brand-new asset class. Robinhood Chain went to mainnet on **July 1, 2026** ([Robinhood](https://robinhood.com/us/en/newsroom/robinhood-accelerates-global-expansion-robinhood-chain-mainnet-stock-tokens-agentic-trading/), [Forbes](https://www.forbes.com/sites/ninabambysheva/2026/07/01/robinhood-launches-its-own-blockchain-new-stock-tokens-and-defi-products/)), so very few consumer apps exist on it yet.
- **Prior art:** Copilot found tokenized-stock projects (`ramelax`, `shift-stocks`, `stacked`, `earlybird`), but they are exchanges and infrastructure. None is a social consumer app, as far as the corpus shows. `stackit` (thematic baskets inside social apps; accelerator company MetEngine) is the nearest neighbour.
- **Design choice that matters:** stay **non-custodial**. Each member buys and holds their own tokens, and the circle shares only signals, votes and receipts. A pooled fund that buys securities for its members raises securities-law questions you don't want in a demo.
- **Build (fits your Foundry setup):**
  - `CircleRegistry.sol`: members, proposals, votes and pick receipts, plus an event log for track records.
  - Stock Tokens are plain ERC-20s ("no special SDK required"; [docs](https://docs.robinhood.com/chain/building-with-stock-tokens/)).
  - Prices come from [Chainlink tokenized-equity feeds](https://docs.robinhood.com/chain/stock-tokens/).
  - Use ERC-4337 for gasless onboarding and a Ponder indexer for leaderboards.
- **Demo:** three wallets in a mock group chat. One proposes NVDA, the others vote, everyone mirrors the trade, and the circle's P&L leaderboard updates.
- **Risks:** Stock Tokens aren't available in every jurisdiction ([coverage varies across 120+ countries](https://eco.com/support/en/articles/15083160-robinhood-tokenized-stocks-what-s-live-and-how-it-works)). Corporate actions such as splits and dividends need handling in P&L.

### 2. No-loss stock-picking league (fantasy stocks with principal protection)

**Track:** Robinhood Chain, or Arbitrum as a fallback.

**Pitch:** Weekly fantasy leagues where friends draft Stock Token portfolios. Entry fees sit in a yield-bearing stablecoin vault. At the end of the week the **winners take the yield and everyone gets their principal back**.

- **Why it can win:** it combines two proven Colosseum winners. `welikesports` (Frontier) earns from interest on pooled funds instead of a rake. `crypto-fantasy-league-(cfl)` took 1st in Gaming at Breakout and joined the accelerator. It also fits Alliance's [*Gen Z's American Dream*](https://alliance.xyz/essays/gen-zs-american-dream) thesis that young users want gamified upside without ruin.
- **Prior art:** fantasy crypto leagues are common (`market-fantasy-league`, `coinchamp`), and so are no-loss lotteries (`luckystash`, `magic-lottery`). None of them won. What's missing is **real equities** plus **no-loss mechanics**.
- **Build:**
  - `League.sol`: entry, draft commitments (commit-reveal to stop copying), and settlement against Chainlink equity feeds.
  - An ERC-4626 vault for the entry pool.
  - Pull-based payout of the yield to the top players.
- **Demo:** a fast-forwarded "week" on a fork. Show the draft, prices moving, settlement, the winner claiming yield and losers getting their full principal back.
- **Risks:** a week's yield on small pools is tiny. Frame it as a game where losing costs nothing. You could also let sponsors top up the prize pool.

### 3. Family money on Tempo: allowances, remittances and spending rules

**Track:** Tempo.

**Pitch:** A diaspora parent sends money home to family, or a parent funds a teen, over stablecoin rails with sub-second finality. The app uses Tempo-native features:

- **sponsored fees**, so recipients never need gas;
- **virtual addresses**, giving each family member a sub-account;
- **receive policies**, such as spending caps, merchant allowlists and savings locks.

- **Why it can win:** Tempo's resource list is almost a spec for this app (sponsor fees → virtual addresses → receive policies). Tempo went live on **Mar 18, 2026**, and its design partners include Revolut, Nubank, Shopify and Visa ([CoinDesk](https://www.coindesk.com/tech/2026/03/18/stripe-led-payments-blockchain-tempo-goes-live-with-protocol-for-ai-agents)). Judges will reward an app that shows off the chain's own features rather than a generic ERC-20 transfer.
- **Prior art:** `marshmallow` (a family finance DAO) took 2nd in DAOs at Radar. `sona-1` (allowances and chores) and `bucky-bank` (a parent-supervised piggy bank) didn't place. Winning remittance and payment apps show judges care about emerging markets: `localpay` (3rd in Stablecoins, then accelerator C3) and `sp3nd` (5th in Stablecoins).
- **Differentiation:** "Venmo for families" is generic. **Programmable, gasless receive-side rules** are what make it Tempo-native.
- **Risks:** TIP-20 tokens don't behave exactly like ERC-20 ([Tempo EVM differences](https://ColosseumOrg.github.io/hackathon-resources/crypto-worlds-fair.json)), so read that doc first. The Tempo API and indexer are "still evolving".

### 4. Group-chat perps with revenue built in

**Track:** Hyperliquid.

**Pitch:** Friends-only trading rooms. Someone posts a perp idea, members join with one tap, and every order carries your **builder code**. Builder codes pay up to **10 bps on perps and 1% on spot** per order ([Hyperliquid docs](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/builder-codes)), so the app earns revenue from the first trade.

- **Why:** it has a business model from day one, the pattern is proven (`toaster.trade` is on Hyperliquid itself; `alpha-group-trading`; `rekt`), and HyperEVM lets you put the social layer (rooms, reputation, shared stakes) in Solidity.
- **Warning:** this is the **most crowded idea on this list**. Copilot scores social and copy-trading at crowdedness 323, the highest seen. You need a sharp twist, for example:
  - the room only unlocks a trade once members commit collateral (shared skin in the game), or
  - reputation-weighted position caps.
- **Risks:** signing, nonces and precision are where most Hyperliquid integrations break. The track docs call this out explicitly.

### 5. Base Mini App with Base Pay: "pay to join" group moments

**Track:** Base.

**Pitch:** A Base or Farcaster mini app for paid group experiences: ticketed watch parties, prediction pools among friends, group gifts. Checkout goes through **Base Pay (USDC)**. Distribution comes from the social feed.

- **Why:** Base App has shifted to a **trading-first model**, with mini apps still central to distribution ([Cryptopolitan](https://www.cryptopolitan.com/base-app-shifts-to-trading-first-model/)). Consumer apps that sit next to trading and payments fit Base's current strategy.
- **Avoid:** pay-per-article creator paywalls over x402. Copilot shows repeated non-winners (`truestory`, `openshelf`, `shenzu-spending`), and Szabo's mental-accounting argument explains why. Use **x402 for agent or machine payments**, not for asking humans to pay 5¢ an article.

### Not recommended for a consumer app

- **Ethereum L1:** gas makes consumer UX hard. Only target it with an identity or account play (ENS, Safe, 4337) where L1 settlement is the point.
- **Arbitrum:** a solid fallback chain for ideas 1 and 2, and Robinhood Chain is itself Arbitrum technology. Stylus is interesting for compute-heavy onchain games, but that's a gaming bet, not a consumer-finance one.

---

## Recommendation

Build **#1 (Stock Circles) on Robinhood Chain**, and keep **#2's no-loss league** as a "weekly challenge" feature inside the same app if you have time. Together they:

- match the exact pattern Colosseum judges rewarded at Frontier (social + familiar finance + a real business model);
- target a chain that is **under three months old on mainnet**, with almost no consumer apps yet;
- play to your strengths (Solidity/Foundry, plain ERC-20s, Chainlink feeds), with no exotic SDK;
- still compete for the general pool, where the grand prize and runner-up awards are, because judging is on product merit.

**Next steps:**

1. Read the [official rules PDF](https://colosseum.com/legal/Crypto%20World's%20Fair%20Hackathon%20Rules.pdf) for per-track prize amounts and eligibility.
2. Confirm Stock Token availability for your testnet demo using the [Robinhood Chain testnet faucet](https://docs.robinhood.com/chain/).
3. Deploy `CircleRegistry` and put the demo on testnet by the midpoint (about Sep 28).

---

## Deep dive: privacy-by-default investing on Robinhood Chain

*Added 2026-09-21, in response to the "enshrined privacy / right defaults" framing.*

### The problem this solves

Robinhood Chain puts equities on a **public** ledger. Every buy, every position size and every exit is visible and permanently linked to an address that has already passed KYC. That creates consumer harms a normal brokerage doesn't have:

- **Your net worth is public.** Anyone with your address (an ENS name, a Farcaster profile, a payment you once received) can read your entire portfolio and its P&L.
- **Your intent leaks before you act.** Paradigm's [*The Key Neutrality of Baselayer Markets*](https://www.paradigm.xyz/2025/04/the-key-neutrality-of-baselayer-markets) makes the point precisely: when a trade is publicly broadcast, the information isn't "insider" information, because the trader voluntarily gave it away. Anyone building a social investing app hands that leak to every observer.
- **It breaks the social product.** This is the flaw in idea #1 above. A verified track record is what makes group investing trustworthy, but the obvious way to build it (public positions) is exactly what makes it unsafe to use.

The tweet's framing applies directly: privacy has to be **the default path in the runtime**, not a "shield" toggle that only paranoid users find. If the app has a privacy mode, almost nobody uses it, and the few who do stand out.

### The product: proofs instead of positions

A stock investing app on Robinhood Chain where **nothing about your position is published by default**, and where you share **claims you can prove** instead:

- *"I'm up 23% this month."*
- *"I held NVDA before I posted about it."* (timestamped, so callers can't fake being early)
- *"My portfolio is over $10k."* (for entry into a circle or a league, without showing the amount)

Three rules make it a product rather than a privacy demo:

1. **No toggle.** There is one flow, and it is the private one. The user never chooses privacy, configures a pool, or sees the word "shielded".
2. **Proofs are the social object.** You share a proof card, not a screenshot. The verification happens onchain; the numbers behind it stay with you.
3. **Selective disclosure, not secrecy.** A viewing key hands your accountant, your tax software or a regulator the full history whenever you choose. Szabo's [*Confidential Auditing*](https://nakamotoinstitute.org/library/confidential-auditing) is the right frame, and the Cypherpunk Manifesto's line is the pitch: *"Privacy is not secrecy."*

### The constraint you must design around

**Stock Tokens appear to be transfer-restricted.** Reporting on early code reviews says Robinhood's tokens may only move between **whitelisted, KYC-passed addresses**, and that only verified users in permitted regions (EU customers, no U.S. persons) can mint or redeem ([Benzinga](https://www.benzinga.com/Opinion/26/08/61183371/robinhood-chain-exposes-cryptos-regulatory-blind-spot), [eco.com](https://eco.com/support/en/articles/15254023-tokenized-equities-2026-backed-dinari-robinhood)). The official [Stock Tokens docs](https://docs.robinhood.com/chain/stock-tokens/) say only that they are standard ERC-20s and don't document the restriction either way. **Verify this before you build.** It decides the architecture.

If the restriction is real, a Tornado-style shielded pool holding the equity leg won't work: the pool contract would itself need to be whitelisted, and you won't get that in four weeks. So split the asset:

- **Cash leg (USDC): genuinely shielded.** USDC is permissionless, so contributions, settlements, winnings and circle payouts go through a shielded pool with commitments and nullifiers. Amounts and counterparties are hidden here, which is where most of the social signal actually leaks.
- **Equity leg: stays in the user's own whitelisted address.** Compliance is untouched. Privacy comes from never publishing anything about it, and from proving statements against it in zero knowledge.
- **Reduce linkability where the whitelist allows it.** If Robinhood whitelists more than one address per verified user, give each user a fresh address per position. Check this; it's the difference between "unlinkable" and "just unpublished".

Be honest about this in the submission. You cannot deliver unconditional privacy on a permissioned asset, and judges will respect a builder who names the boundary and ships everything inside it more than one who overclaims.

### Build plan (Foundry)

- `ShieldedCash.sol`: commitment and nullifier pool for USDC deposits, internal transfers and withdrawals. This is the part that is private in the strong sense.
- `ClaimVerifier.sol`: verifies ZK proofs of statements about a user's position. Circuits in **Noir**, which has the gentlest learning curve for a Solidity developer and produces a Solidity verifier.
- **Proof inputs:** the user's balance at a block, plus the oracle price at that block from the [Chainlink tokenized-equity feeds](https://docs.robinhood.com/chain/stock-tokens/). Anchor the historical balance with a storage proof against a block hash so nothing depends on a trusted server.
- **Handle corporate actions or your P&L is wrong.** Stock Tokens use an onchain multiplier for splits and dividends, exposed as `uiMultiplier()` under **ERC-8056**, and raw balances stay static until redemption. Every P&L proof must apply the multiplier at both endpoints.
- **Demo on testnet with mock tokens.** Deploy your own ERC-20 implementing `uiMultiplier()` on the [Robinhood Chain testnet](https://docs.robinhood.com/chain/), so the whitelist question never blocks the demo. Say clearly in the README that this is a mock.
- **Onboarding:** ERC-4337, so the private path costs the user nothing to enter.

### Demo script (three minutes)

1. Two wallets. Wallet A buys a position. Show the explorer: **nothing readable** about size or cost basis.
2. Wallet A posts a proof card in the circle: *"up 23% since Sep 1."* Wallet B verifies it onchain. The position stays hidden.
3. Wallet B tries to forge the same claim. The verifier rejects it.
4. Wallet A hands an accountant a viewing key. The full history decrypts in one click.

Step 3 is the one that wins the room. It shows you can have a track record you cannot fake and cannot front-run.

### Why this is a strong submission

- **Nobody has claimed it, as far as the corpus shows.** Copilot's Solana corpus is full of privacy protocols (`hush`, `radr`, `oridion`, `flexanon`, `dagon`) and privacy DeFi winners (`blackpool`, 2nd in DeFi and now the Darklake accelerator company; `encifher`, 3rd in DeFi; `umbra`). Separately it is full of tokenized-equity projects (`ramelax`, `shift-stocks`, `earlybird`). **No project in the corpus combines the two.**
- **It fixes the hole in idea #1** rather than competing with it. Build this and Stock Circles becomes one product: a group investing app whose track records are real because they're proven, and safe because they're private.
- **It's narrative-ready.** a16z's [*6 myths about privacy on blockchains*](https://a16zcrypto.com/posts/article/6-myths-privacy-blockchains) gives you the framing, and "your brokerage account shouldn't be a public website" is a pitch a non-crypto judge understands in one sentence.

### Risks to name before a judge does

- **Privacy plus securities is a real regulatory tension.** Lead with selective disclosure and the viewing key, and say plainly that you are hiding balances from the public, not from an auditor.
- **Privacy apps are crowded in general** (Copilot scores the category at 260). Your wedge is the asset class and the default, not the cryptography.
- **Scope.** A shielded pool and a proof circuit in four weeks is aggressive. If you have to cut, cut the shielded cash pool and ship the **proof layer** alone: "prove your returns, never show your positions" is still a complete, demoable product.

---

### Additional sources

- [Decrypt: What is Robinhood Chain](https://decrypt.co/resources/what-robinhood-chain-ethereum-layer-2-network-tokenized-stocks)
- [The Defiant: Tempo mainnet](https://thedefiant.io/news/blockchains/tempo-launches-mainnet-unveils-machine-payments-protocol-with-stripe)
- [Dwellir: Hyperliquid builder codes](https://www.dwellir.com/blog/hyperliquid-builder-codes)
- [Coinbase: x402 on Mini Apps](https://docs.cdp.coinbase.com/x402/miniapps)
- [Colosseum hackathon-resources repo](https://github.com/ColosseumOrg/hackathon-resources)
