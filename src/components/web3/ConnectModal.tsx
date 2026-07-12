import { useState } from "react";
import { X, Mail, ArrowRight, Loader2 } from "lucide-react";
import { useConnect } from "wagmi";
import { LogoMark } from "@/components/shared/Logo";
import { isMagicConfigured } from "@/lib/wagmi";

// CRUZ logs in with Magic only — passwordless email + OAuth social. Magic
// mints an EVM embedded wallet that Particle's Universal Accounts then
// aggregates. No injected/MetaMask, no burner.
export function ConnectModal({ onClose }: { onClose: () => void }) {
  const { connectors, connectAsync, isPending, error } = useConnect();
  const magic = connectors[0];
  const [email, setEmail] = useState("");
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

          {/* Email */}
          <div>
            <label className="mb-1.5 block text-[11px] font-medium text-muted-foreground">
              Continue with email
            </label>
            <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 focus-within:border-primary">
              <Mail className="h-4 w-4 text-meta" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && connect()}
                placeholder="you@email.com"
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-meta focus:outline-none"
              />
            </div>
          </div>

          <button
            onClick={connect}
            disabled={isPending}
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

          {/* Divider */}
          <div className="flex items-center gap-3 py-1">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[10px] uppercase tracking-wider text-meta">or</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          {/* Social — Magic's connector surfaces these via its own modal on connect */}
          <div className="grid grid-cols-2 gap-2">
            {SOCIALS.map((s) => (
              <button
                key={s.id}
                onClick={connect}
                className="flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:border-primary/50 hover:bg-surface-2"
              >
                <span dangerouslySetInnerHTML={{ __html: s.icon }} />
                {s.label}
              </button>
            ))}
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

const SOCIALS = [
  {
    id: "google",
    label: "Google",
    icon: '<svg width="14" height="14" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>',
  },
  {
    id: "apple",
    label: "Apple",
    icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="#fff"><path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.46 15.6 1.7 9.4 5.13 7.13c1.4-.93 2.96-.93 4.32-.13 1.04.6 2.03.6 3.06 0 2.27-1.2 4.84-.5 6.5 1.6.27.34.27.34-.07.6-1.6 1.2-1.9 3.4-.6 5 1.2 1.4 1.2 2.6 0 4-.5.7-1.4 1.4-1.3 1.4.13.13.13.13.13 0z"/><path d="M15.4 3.06c.13 1.6-.5 3.1-1.6 4.27-1.13 1.27-2.4 1.6-3.73 1.27-.13-1.6.5-3.07 1.6-4.27 1.13-1.2 2.43-1.53 3.73-1.27z"/></svg>',
  },
  {
    id: "github",
    label: "GitHub",
    icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="#fff"><path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.23-1.28-5.23-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.79 0c2.21-1.49 3.18-1.18 3.18-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.43-2.69 5.41-5.25 5.69.41.36.78 1.06.78 2.14 0 1.55-.01 2.8-.01 3.18 0 .31.21.68.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z"/></svg>',
  },
  {
    id: "discord",
    label: "Discord",
    icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="#5865F2"><path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.2.4c1.6.5 2.9 1.1 4 1.9a14 14 0 0 0-12.5 0c1.1-.8 2.5-1.4 4-1.9L10.6 3a19.8 19.8 0 0 0-5 1.4C2.4 9.1 1.6 13.7 2 18.3a19.9 19.9 0 0 0 6.1 3.1l.3-.5c-1-.4-2-.9-2.9-1.6l.7-.5a14 14 0 0 0 12 0l.7.5c-.9.7-1.9 1.2-2.9 1.6l.3.5a19.9 19.9 0 0 0 6.1-3.1c.5-5.3-.8-9.9-3.7-13.9zM9 15.5c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2zm6 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2z"/></svg>',
  },
  {
    id: "twitter",
    label: "X",
    icon: '<svg width="13" height="13" viewBox="0 0 24 24" fill="#fff"><path d="M18.9 1.15h3.68l-8.04 9.19L24 22.85h-7.4l-5.8-7.58-6.63 7.58H.49l8.6-9.83L0 1.15h7.59l5.24 6.93 6.07-6.93zm-1.29 19.5h2.04L6.49 3.24H4.3L17.61 20.65z"/></svg>',
  },
  {
    id: "twitch",
    label: "Twitch",
    icon: '<svg width="13" height="13" viewBox="0 0 24 24" fill="#9146FF"><path d="M4 2 2 6v13h5v3h3l3-3h4l5-5V2H4zm15 11-3 3h-4l-3 3v-3H6V4h13v9zm-3-7h-2v5h2V6zm-5 0H9v5h2V6z"/></svg>',
  },
];
