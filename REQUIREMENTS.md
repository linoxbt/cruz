# CRUZ — Requirements

External services, keys, and where to get them.

## Particle Network (core — all modules)

- Create a project at [dashboard.particle.network](https://dashboard.particle.network) and enable
  **Universal Accounts**. This gives you three publishable identifiers (safe for the browser, not
  secrets): **App ID**, **Project ID**, **Client Key**.
- Package: [`@particle-network/universal-account-sdk`](https://www.npmjs.com/package/@particle-network/universal-account-sdk)
  (installed; confirm the version in `package.json` against the package's `CHANGELOG.md` before
  upgrading).
- Docs: [developers.particle.network/universal-accounts](https://developers.particle.network/universal-accounts/cha/overview).

**Two important constraints, verified against the SDK's own shipped types:**

1. **Arbitrum One only.** The SDK's `CHAIN_ID` enum supports exactly six chains: Ethereum, BSC,
   Base, X Layer, Solana, and Arbitrum **mainnet** (`42161`). There is no Arbitrum Sepolia. CRUZ
   targets Arbitrum One exclusively; there's no free/safe testnet to develop the
   Particle-SDK-backed features against — test with small real amounts.
2. **EIP-7702 mode needs a raw local signer.** Particle's docs: "7702 mode is only available in
   server-side environments and embedded wallets that support the authorization methods. JSON-RPC
   wallets are not supported at the moment." A MetaMask-style injected connection can't drive the
   live upgrade through this SDK — only CRUZ's **burner wallet** (a real local `viem` account, not
   a JSON-RPC provider) can. The Account Inspector's "Inspect" flow works for any wallet/address;
   only "Upgrade" is burner-gated.

## Arbitrum (deployment target — all modules)

- RPC: `https://arb1.arbitrum.io/rpc` (public default; a dedicated provider such as Alchemy or
  Infura is recommended for reliability — set `VITE_ARBITRUM_RPC` to override).
- Explorer: [Arbiscan](https://arbiscan.io).
- USDC on Arbitrum One: `0xaf88d065e77c8cC2239327C5EDb3A432268e5831`.
- This is mainnet — there is no faucet. Fund the burner wallet with a small amount of real ETH
  to exercise the Upgrade/Execute flows.

## Starter Scaffolder — delivery/deploy integrations

- **GitHub**: a personal access token with repo-creation scope. Create one under GitHub → Settings
  → Developer settings → Personal access tokens. Pasted directly into the Scaffolder UI at
  generate-time — never stored, never sent anywhere except GitHub's API for that one request.
- **Vercel**: an API token from Vercel → Account Settings → Tokens. Same handling as the GitHub
  token: entered per-use, not persisted.
- **Magic (optional)**: only needed if a generated starter app has the embedded-wallet toggle on.
  Publishable key from [dashboard.magic.link](https://dashboard.magic.link) — goes into the
  _generated project's_ own `.env`, not CRUZ's.

## Environment variables

See `.env.example` for the exact variable names and comments — CRUZ follows the standard Vite
three-tier convention:

| Tier                    | Example                                         | Where it lives                                                                                                                                                     |
| ----------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Public (`VITE_*`)       | `VITE_PARTICLE_PROJECT_ID`, `VITE_ARBITRUM_RPC` | Inlined into the browser bundle at build time — safe for publishable IDs, not secrets                                                                              |
| Server-only (no prefix) | _(none needed for CRUZ)_                        | Read only inside server functions; GitHub/Vercel tokens are user-supplied per-request instead of a server env var, since they're per-user, high-stakes credentials |

## Reused infrastructure

Wallet connection (wagmi/viem), the in-app burner wallet (the raw signer EIP-7702 needs), the
in-browser `solc` compiler + Monaco editor, the shadcn/Radix component set, and the env-loading
convention are all carried over from the underlying TanStack Start foundation — none were
re-implemented for CRUZ.
