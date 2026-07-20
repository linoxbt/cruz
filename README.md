<div align="center">

# CRUZ

### One account. Any chain.

A chain-abstraction console for [Universal Accounts](https://developers.particle.network/universal-accounts/cha/overview) on Arbitrum.

[Features](#-features) · [Architecture](#-architecture) · [Quick start](#-quick-start) · [Configuration](#-configuration) · [Modules](#-modules) · [How-it-works](#-how-it-works) · [Roadmap](#-roadmap) · [License](#-license)

</div>

---

CRUZ makes chain abstraction tangible. Log in with email or social, and CRUZ turns your EOA into a **Universal Account** — one balance, one signature, any chain — through a real [EIP-7702](https://eips.ethereum.org/EIPS/eip-7702) upgrade. From there: inspect unified balances, compose cross-chain Universal Transactions, build a full app from a prompt with the **AI Builder**, write and deploy Solidity in-browser, scaffold and ship starter apps to GitHub, and explore Arbitrum One — all from one console. No bridges to manage, no chains to switch, no seed phrases to back up.

Built on [Particle Network](https://particle.network)'s Universal Accounts SDK for aggregation + routing, [Magic](https://magic.link) for the passwordless embedded wallet, and [Arbitrum One](https://arbitrum.io) as the primary chain.

## ✨ Features

- **Passwordless login** — email or OAuth social (Google, Apple, GitHub, Discord, X, Twitch) via Magic. No extensions, no seed phrases.
- **Real EIP-7702 upgrades** — turn a plain EOA into a chain-abstracted Universal Account in one signature, signed through Magic's `sign7702Authorization`.
- **Unified balance** — see one address's aggregate balance across every chain Particle supports, with a per-chain breakdown.
- **Cross-chain Universal Transactions** — compose, preview (routing + fees, no side effects), execute, and export a runnable TypeScript snippet that reproduces the exact transaction.
- **AI Builder** — an autonomous coding agent: describe an app in plain English and it plans, writes, tests, and iterates on a full Vite + React + TypeScript project, with a live file tree, diff review, and a real sandboxed in-browser preview. Conversational and incremental (each prompt improves the app rather than regenerating it), auto-continues past length limits, and can pull in MCP tools when configured.
- **Wallet-funded billing** — five free prompts per connected wallet, then pay-as-you-build: an on-chain-funded (USDC/ETH on Arbitrum), Upstash-backed prepaid ledger with a revocable spending authorization, a usage dashboard, and exact per-request cost. Entirely inert until configured, so the Builder is free until you switch billing on. See [`.env.example`](./.env.example).
- **Contract Editor + Code with AI** — edit and compile Solidity in-browser via a `solc` Web Worker, deploy to Arbitrum One through the connected wallet, with an AI assistant for writing, auditing, and debugging contracts.
- **Starter Scaffolder** — generate a complete, chain-abstracted starter project (or deliver one built in the AI Builder), then push it to a fresh GitHub repo or download it as a ZIP.
- **Explorer** — browse Arbitrum One blocks, transactions, addresses, and tokens, with live network stats and price.
- **My Projects** — every app, contract, and repo you've built or shipped through CRUZ, in one place.
- **Docs** — an in-app documentation page rendered from the same module manifest as the nav, plus security notes and FAQ.
- **Bespoke identity** — ink-navy + electric-violet design system, animated crossing-arcs motif, fully distinct from any underlying template.

## 🏗 Architecture

```
cruz/
├── src/
│   ├── routes/                TanStack Router file-based routes
│   │   ├── index.tsx          Marketing landing (chrome-free, animated)
│   │   ├── app.tsx            In-app Universal Account dashboard
│   │   ├── inspector.tsx      Account Inspector + EIP-7702 upgrade
│   │   ├── composer.tsx       Transaction Composer
│   │   ├── scaffolder.tsx     Starter Scaffolder
│   │   ├── editor.tsx         Contract Editor (solc Web Worker)
│   │   └── __root.tsx         App shell, providers, head meta
│   ├── components/
│   │   ├── layout/            AppShell, Sidebar (slim icon-forward rail)
│   │   ├── web3/              Magic ConnectModal, WalletPanel, Web3Provider
│   │   ├── shared/            Logo (crossing-arcs mark), CodeBlock, PageHeader…
│   │   ├── studio/            Module UIs (inspector/composer/scaffolder)
│   │   └── ui/                shadcn/Radix primitive set
│   ├── hooks/                 useUniversalAccount, useDelegationStatus,
│   │                          useEip7702Upgrade, useTxComposer
│   ├── lib/
│   │   ├── wagmi.ts           wagmi config — Magic connector only, Arbitrum One
│   │   ├── chains.ts          arbitrumOne (single chain)
│   │   ├── studio/
│   │   │   ├── particle.ts    UniversalAccount singleton factory
│   │   │   ├── magicSigner.ts Magic sign7702Authorization + personal_sign bridge
│   │   │   ├── exportSnippet.ts  Runnable-code export templating
│   │   │   └── manifest.ts    Single-source-of-truth module manifest
│   │   ├── studio-templates/  Scaffolder's file-map template generators
│   │   ├── api/studio.functions.ts  GitHub server functions
│   │   ├── compiler.ts + compiler.worker.ts  In-browser solc
│   │   └── burner…            (removed — Magic owns the signer now)
│   └── styles.css             CRUZ design tokens + animations
├── public/                    favicon, PWA manifest, icons, service worker
├── REQUIREMENTS.md            External services & keys
└── .env.example
```

**Stack:** TanStack Start + TanStack Router (SSR, file-based routing) · React 19 · Tailwind v4 · Radix/shadcn UI · viem + wagmi 2.x · Monaco editor · `@particle-network/universal-account-sdk` · `@magiclabs/wagmi-connector` · Zustand + TanStack Query · Vite 7 + Bun + Nitro.

## 🚀 Quick start

Requires [Bun](https://bun.sh) ≥ 1.3.

```bash
git clone https://github.com/linoxbt/cruz.git
cd cruz
bun install
cp .env.example .env.local   # fill in Particle + Magic keys (see below)
bun run dev                  # http://localhost:8081 (or next free port)
```

The app boots with zero env config (Arbitrum One defaults built in), but login and balance features stay gated until `VITE_MAGIC_PUBLISHABLE_KEY` and `VITE_PARTICLE_*` are set — the UI surfaces clear notices when they're missing.

```bash
bun run build      # production build (auto-detects Vercel/Netlify; else Vercel preset)
bun run preview    # preview the production build
bun run lint       # ESLint
bun run format     # Prettier
```

## ⚙️ Configuration

CRUZ follows the standard Vite three-tier env convention. All client-readable vars use the `VITE_` prefix and are inlined at build time.

| Variable                     | Tier   | Purpose                                                                                                                  |
| ---------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------ |
| `VITE_MAGIC_PUBLISHABLE_KEY` | Public | Magic publishable key — enables login. From [dashboard.magic.link](https://dashboard.magic.link).                        |
| `VITE_PARTICLE_PROJECT_ID`   | Public | Particle project ID — enables Universal Accounts.                                                                        |
| `VITE_PARTICLE_CLIENT_KEY`   | Public | Particle client key.                                                                                                     |
| `VITE_PARTICLE_APP_ID`       | Public | Particle app ID.                                                                                                         |
| `VITE_ARBITRUM_RPC`          | Public | Arbitrum One RPC URL (default: `https://arb1.arbitrum.io/rpc`; a dedicated provider like Alchemy/Infura is recommended). |
| `VITE_ARBITRUM_EXPLORER`     | Public | Arbiscan base URL (default: `https://arbiscan.io`).                                                                      |

The GitHub connection (for the Scaffolder's delivery path) is **never** an env var — it's a real OAuth connection made once on the Settings page. See **[REQUIREMENTS.md](./REQUIREMENTS.md)** for the full breakdown, including the two integration constraints verified against the SDKs' own shipped types:

1. **Arbitrum One only** — Particle's Universal Accounts SDK supports Arbitrum mainnet (chain id `42161`); there is no testnet. Test with small real amounts.
2. **EIP-7702 needs an embedded signer** — Particle's 7702 mode doesn't support JSON-RPC wallets; Magic's embedded wallet is exactly the supported case, and Magic's `sign7702Authorization` produces the signed authorization Particle's `sendTransaction` expects.

## 🧩 Modules

### Account Inspector — `/inspector`

Inspect any address's unified balance (Particle `getPrimaryAssets`), see EOA-vs-upgraded status via a raw `eth_getCode` delegation check (the `0xef0100` designator + delegate address), and run a real EIP-7702 upgrade of the connected Magic wallet — a zero-value carrier transaction bundling the pending `eip7702Auth`, signed via `magic.wallet.sign7702Authorization` and submitted through Particle.

### Transaction Composer — `/composer`

Compose a cross-chain Universal Transaction (token transfer or arbitrary contract call), preview the resolved routing + fees with **no side effects** (the SDK's `create*Transaction` returns the routed transaction without submitting), execute it through the Magic signer, and export a copy-paste-ready TypeScript snippet reproducing the exact transaction — complete enough to drop into a clean project with only credentials substituted.

### Contract Editor — `/editor`

Edit and compile Solidity in the browser via a `solc` Web Worker (Monaco editor, Solidity syntax highlighting + autocomplete, colored compiler terminal, multi-file workspace). A Terminal/Inspector tab pair below the editor (static analysis findings, jump-to-line), a Deploy button that compiles and signs a deployment through the connected Magic wallet or an opt-in generated wallet, and a "Code with AI" panel for writing/debugging/explaining the open contract.

### AI Builder — `/builder`

An autonomous coding agent that turns a plain-English prompt into a complete, runnable Vite + React + TypeScript project. It decides whether a message is a question or a build request, lays out an analysis + plan before touching files, then streams the project into a live file tree with diff review and a real sandboxed in-browser preview (bundled with esbuild-wasm, npm packages resolved via esm.sh). It's incremental (each prompt improves the app rather than regenerating it), auto-continues past provider length caps, pauses for plan approval and security-relevant findings, and can call configured MCP tools mid-build.

Generation runs on a shared, operator-funded model by default. When wallet billing is enabled, each connected wallet gets **five free prompts**, after which it's pay-as-you-build: fund a prepaid balance (USDC/ETH on Arbitrum) with one revocable spending authorization, see exact per-request cost, and never spend without approval. The whole billing layer is inert until `UPSTASH_REDIS_REST_URL`/`_TOKEN` (and a treasury address) are set — see [`.env.example`](./.env.example). The atomic ledger logic (no-negative, no-double-charge, idempotent settle, hold reaping) is covered by `bun run test:ledger` against a real Redis.

### Starter Scaffolder — `/scaffolder`

Generate a complete, runnable, chain-abstracted starter app either from a fixed TS file-map template (Universal Accounts pre-wired, optional Magic embedded-wallet and gas-sponsorship toggles) or from a project you already built in the AI Builder, then deliver it: push to a fresh GitHub repo, or download as a real, runnable ZIP. Any demo contract opens straight in CRUZ's Contract Editor.

### Explorer — `/explorer`

Browse Arbitrum One on-chain: blocks, transactions, addresses, and tokens, with live network stats (price, gas, block time, totals) — a focused, read-only block explorer built into the console.

### My Projects — `/projects`

Everything you've built or shipped through CRUZ in one place: AI Builder apps, deployed contracts, and delivered GitHub repos.

### Universal Account Dashboard — `/app`

The connected Magic wallet's home: unified balance card with per-chain breakdown, and account-status card (EOA vs. upgraded with a link to run the upgrade).

### Docs — `/docs`

An in-app documentation page (overview, getting started, every module, how-it-works, security, FAQ) rendered from the same module manifest as the nav, so it can't drift from what's actually shipped.

## 🔬 How it works

1. **Log in with Magic** — Magic mints a passwordless EVM embedded wallet (email or OAuth). No seed phrases, no browser extensions.
2. **Upgrade once** — a single EIP-7702 authorization, signed by Magic and submitted through Particle, delegates the EOA to a Universal Account implementation. Same address, now chain-abstracted.
3. **Transact any chain** — one balance, one signature. Particle routes across every supported chain (Ethereum, Arbitrum, Base, BSC, X Layer, Solana) under the hood.

The EIP-7702 flow is the one piece whose exact wire format isn't fully specified in Particle's public docs; CRUZ uses Magic's documented `sign7702Authorization` (returns `{contractAddress, chainId, nonce, v, r, s}`) reformatted into Particle's `EIP7702Authorization` (`{userOpHash, signature}`) shape — the spec-correct serialization, flagged in code comments as the piece to verify against a live project before relying on it in production.

## 🗺 Roadmap

- [ ] Recurring payments, DCA, and BNPL as scheduled Universal Transactions
- [ ] Gas sponsorship via a Particle-configured paymaster
- [ ] Additional starter templates beyond the unified-balance wallet
- [ ] Full type-4 (EIP-7702) transaction submission via Magic's `send7702Transaction`

## 🔐 Security

- No secrets in the client bundle — `VITE_`-prefixed vars are publishable IDs only; the GitHub OAuth client secret stays server-only.
- The Magic embedded wallet is the sole signer; CRUZ never holds or transports a private key.
- The `cruz-*` localStorage key namespace is isolated from any other app on the same origin.

## 📄 License

MIT — see [LICENSE](./LICENSE).

<div align="center">

Built on [Particle Network](https://particle.network) Universal Accounts · [Magic](https://magic.link) · [Arbitrum](https://arbitrum.io)

</div>
