import { createConfig, createStorage, http, type CreateConnectorFn } from "wagmi";
import { dedicatedWalletConnector } from "@magiclabs/wagmi-connector";
import { arbitrumOne } from "./chains";

// CRUZ connects via Magic only — a passwordless embedded wallet (email + OAuth
// social login). Magic provides the EVM signer; Particle's Universal Accounts
// SDK then aggregates it into a chain-abstracted Universal Account on top.
// No injected/MetaMask/burner connectors: login is Magic, full stop.
const MAGIC_PUBLISHABLE_KEY = import.meta.env.VITE_MAGIC_PUBLISHABLE_KEY || "";

const chains = [arbitrumOne] as const;

// The Magic connector throws at construction time if the publishable key is
// missing, and wagmiConfig is built at module top-level (imported from
// __root.tsx), so an unset key would crash SSR for every route. Only register
// the connector when a key is present; the app still renders (login just
// surfaces a clear "set VITE_MAGIC_PUBLISHABLE_KEY" message until then).
const connectors: CreateConnectorFn[] = [];
if (MAGIC_PUBLISHABLE_KEY) {
  // @magiclabs/wagmi-connector was typed against an older wagmi-core; the
  // runtime shape is correct, so satisfy the newer CreateConnectorFn type.
  connectors.push(
    dedicatedWalletConnector({
      chains: [...chains],
      options: {
        apiKey: MAGIC_PUBLISHABLE_KEY,
        isDarkMode: true,
        oauthOptions: {
          providers: ["google", "apple", "github", "discord", "twitter", "twitch"],
        },
        magicSdkConfiguration: {
          network: {
            rpcUrl: arbitrumOne.rpcUrls.default.http[0],
            chainId: arbitrumOne.id,
          },
        },
      },
    }) as unknown as CreateConnectorFn,
  );
}

export const isMagicConfigured = () => !!MAGIC_PUBLISHABLE_KEY;

export const wagmiConfig = createConfig({
  chains,
  connectors,
  storage: createStorage({
    key: "cruz-wagmi",
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
  }),
  transports: {
    [arbitrumOne.id]: http(),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
