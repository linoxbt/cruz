import { ArrowRight, Loader2, X } from "lucide-react";
import { useConnect } from "wagmi";
import { LogoMark } from "@/components/shared/Logo";
import { isMagicConfigured } from "@/lib/wagmi";

// CRUZ logs in with Magic only — passwordless email + OAuth social. Magic
// mints an EVM embedded wallet that Particle's Universal Accounts then
// aggregates. No injected/MetaMask, no burner.
//
// @magiclabs/wagmi-connector's connect() takes no email/provider argument —
// it always opens the connector's own modal (dedicatedWalletConnector.js's
// getUserDetailsByForm), which collects the email or OAuth choice itself
// (configured via wagmi.ts's oauthOptions.providers). A previous version of
// this modal rendered its own email input + six branded provider buttons in
// front of that — none of it was wired to connect(), so every button (and
// the email field) did the exact same thing: open Magic's modal. This is a
// single, honest CTA into that modal instead of a decorative duplicate.
export function ConnectModal({ onClose }: { onClose: () => void }) {
  const { connectors, connectAsync, isPending, error } = useConnect();
  const magic = connectors[0];
  const configured = isMagicConfigured();

  const connect = async () => {
    if (!magic) return;
    try {
      await connectAsync({ connector: magic });
      onClose();
    } catch {
      /* surfaced via `error` */
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm overflow-hidden rounded-xl border border-border bg-surface shadow-2xl">
        {/* Header with cruz mark */}
        <div className="cruz-glow flex flex-col items-center gap-3 px-6 pb-5 pt-7 text-center">
          <LogoMark className="h-10 w-10" />
          <div>
            <div className="font-display text-lg font-bold tracking-tight text-foreground">
              CR<span className="text-primary">UZ</span>
            </div>
            <div className="font-mono text-[11px] text-meta">One account, any chain</div>
          </div>
          <button
            onClick={onClose}
            className="absolute right-3 top-3 rounded-md p-1 text-meta hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-6 pb-6">
          {!configured ? (
            <div className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-[11px] text-muted-foreground">
              Magic isn&apos;t configured — set{" "}
              <code className="text-foreground">VITE_MAGIC_PUBLISHABLE_KEY</code> in{" "}
              <code className="text-foreground">.env.local</code> (see REQUIREMENTS.md) to enable
              login.
            </div>
          ) : null}

          <div>
            <p className="mb-3 text-center text-[11px] text-muted-foreground">
              Continue with email, Google, Apple, GitHub, Discord, X, or Twitch — Magic will ask
              which one next.
            </p>
            <button
              onClick={connect}
              disabled={isPending || !magic}
              className="flex w-full items-center justify-center gap-2 rounded-sm bg-primary px-4 py-2.5 font-mono text-sm font-medium text-primary-foreground transition hover:bg-primary-hover disabled:opacity-50"
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  Continue <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>

          {error && (
            <p className="rounded-md border border-danger/40 bg-danger/5 p-2 text-[11px] text-danger">
              {error.message}
            </p>
          )}

          <p className="text-center text-[10px] text-meta">
            By continuing you agree to CRUZ&apos;s terms. A wallet is created for you — no seed
            phrases to manage.
          </p>
        </div>
      </div>
    </div>
  );
}
