import { type ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { wagmiConfig } from "@/lib/wagmi";

// Web3 provider. CRUZ uses Magic exclusively (configured in wagmiConfig);
// wagmi's reconnectOnMount + localStorage persistence restores the Magic
// session after a refresh. The app already owns a QueryClient (provided in
// __root.tsx); wagmi reuses that QueryClientProvider, so this only adds Wagmi.
export function Web3Provider({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig} reconnectOnMount>
      {children}
    </WagmiProvider>
  );
}
