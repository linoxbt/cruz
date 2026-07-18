import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, ShieldCheck, Zap, Waypoints } from "lucide-react";
import { useAccount } from "wagmi";
import { LogoMark } from "@/components/shared/Logo";
import { Reveal } from "@/components/shared/Reveal";
import { ConnectModal } from "@/components/web3/ConnectModal";
import { CRUZ_MODULES, CRUZ_MODULE_ICONS } from "@/lib/studio/manifest";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "CRUZ — One account, any chain" }] }),
  component: Landing,
});

function Landing() {
  const [showConnect, setShowConnect] = useState(false);
  const { isConnected } = useAccount();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Nav onConnect={() => setShowConnect(true)} connected={isConnected} />
      <Hero onConnect={() => setShowConnect(true)} connected={isConnected} />
      <Stats />
      <Modules />
      <HowItWorks />
      <CtaBand onConnect={() => setShowConnect(true)} connected={isConnected} />
      <Footer />
      {showConnect && <ConnectModal onClose={() => setShowConnect(false)} />}
    </div>
  );
}

/* ─────────── Nav ─────────── */

function Nav({ onConnect, connected }: { onConnect: () => void; connected: boolean }) {
  return (
    <nav
      aria-label="Site"
      className="mx-auto flex max-w-5xl items-center justify-between border-b border-border px-6 py-6"
    >
      <Link to="/app" className="flex items-center gap-2" aria-label="CRUZ dashboard">
        <LogoMark className="h-7 w-7" />
        <span className="font-display text-lg font-bold tracking-tight">
          CR<span className="text-primary">UZ</span>
        </span>
      </Link>
      <div className="flex items-center gap-6 font-mono text-xs uppercase tracking-wide text-muted-foreground">
        <a href="#modules" className="hidden hover:text-foreground sm:inline">
          Modules
        </a>
        <a href="#how" className="hidden hover:text-foreground sm:inline">
          How it works
        </a>
        <Link
          to="/app"
          className="hidden rounded-sm border border-primary px-3 py-1.5 normal-case text-primary hover:bg-primary hover:text-primary-foreground sm:inline-flex"
        >
          Open app
        </Link>
        <button
          onClick={onConnect}
          className="rounded-sm bg-primary px-3.5 py-1.5 normal-case text-primary-foreground hover:bg-primary-hover"
        >
          {connected ? "Dashboard" : "Log in"}
        </button>
      </div>
    </nav>
  );
}

/* ─────────── Hero — bold headline, no decorative motion graphic ─────────── */

function Hero({ onConnect, connected }: { onConnect: () => void; connected: boolean }) {
  return (
    <header className="border-b border-border">
      <Reveal className="mx-auto max-w-3xl px-6 py-24 text-center md:py-32">
        <p className="mb-4 font-mono text-xs uppercase tracking-widest text-primary">
          &gt; universal accounts on arbitrum
        </p>
        <h1 className="text-balance font-display text-5xl font-bold leading-[1.05] md:text-6xl">
          One account.
          <br />
          <span className="text-primary">Any chain.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-[15px] leading-relaxed text-foreground/80">
          CRUZ is a chain-abstraction console. Inspect a Universal Account&apos;s unified balance,
          run a real EIP-7702 upgrade, compose cross-chain transactions, and build a
          chain-abstracted app — all from one place.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <button
            onClick={onConnect}
            className="group inline-flex items-center gap-2 rounded-sm bg-primary px-5 py-2.5 font-mono text-sm font-medium text-primary-foreground hover:bg-primary-hover"
          >
            {connected ? "Open dashboard" : "Get started"}
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </button>
          <Link to="/app" className="font-mono text-sm text-muted-foreground hover:text-foreground">
            Explore the app →
          </Link>
        </div>
      </Reveal>
    </header>
  );
}

/* ─────────── Stats / trust row ─────────── */

const STATS = [
  { label: "Signature per tx", value: "1" },
  { label: "Chains routed", value: "Any" },
  { label: "Bridges you manage", value: "0" },
  { label: "Modules", value: String(CRUZ_MODULES.length) },
];

function Stats() {
  return (
    <section className="border-b border-border bg-surface">
      <Reveal className="mx-auto grid max-w-5xl grid-cols-2 gap-6 px-6 py-10 md:grid-cols-4">
        {STATS.map((s) => (
          <div key={s.label} className="text-center">
            <div className="font-display text-3xl font-bold text-primary">{s.value}</div>
            <div className="mt-1 font-mono text-[11px] uppercase tracking-wider text-meta">
              {s.label}
            </div>
          </div>
        ))}
      </Reveal>
    </section>
  );
}

/* ─────────── Modules — every CRUZ module, sourced from the manifest ─────────── */

function Modules() {
  return (
    <section id="modules" className="border-b border-border">
      <div className="mx-auto max-w-5xl px-6 py-16">
        <Reveal>
          <p className="mb-3 font-mono text-xs uppercase tracking-widest text-muted-foreground">
            The console
          </p>
          <h2 className="max-w-2xl text-balance font-display text-2xl font-bold">
            Everything to build chain-abstracted apps
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-foreground/75">
            Focused modules, one identity. Inspect, compose, build, and deploy — without bridging,
            without juggling chains.
          </p>
        </Reveal>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {CRUZ_MODULES.map((m, i) => {
            const Icon = CRUZ_MODULE_ICONS[m.id];
            return (
              <Reveal key={m.id} delayMs={i * 60}>
                <Link
                  to={m.path}
                  className="cruz-card-glow block h-full rounded-sm border border-border p-6 transition hover:border-primary/50"
                >
                  <span className="font-mono text-xs tracking-widest text-primary">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="mt-3 flex items-center gap-2">
                    <Icon className="h-4 w-4 text-primary" />
                    <h3 className="font-display text-lg font-bold">{m.label}</h3>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-foreground/75">{m.description}</p>
                </Link>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ─────────── How it works ─────────── */

const STEPS = [
  {
    icon: ShieldCheck,
    title: "Log in with Magic",
    body: "A passwordless embedded wallet — email + OTP. No seed phrases, no extensions.",
  },
  {
    icon: Zap,
    title: "Upgrade once",
    body: "A single EIP-7702 authorization turns your EOA into a Universal Account.",
  },
  {
    icon: Waypoints,
    title: "Transact any chain",
    body: "One balance, one signature. Particle routes across every supported chain.",
  },
];

function HowItWorks() {
  return (
    <section id="how" className="border-b border-border bg-surface">
      <div className="mx-auto max-w-5xl px-6 py-16">
        <Reveal>
          <p className="mb-3 font-mono text-xs uppercase tracking-widest text-muted-foreground">
            How it works
          </p>
          <h2 className="max-w-2xl text-balance font-display text-2xl font-bold">
            Three steps to any chain
          </h2>
        </Reveal>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <Reveal key={s.title} delayMs={i * 80}>
              <div className="h-full rounded-sm border border-border bg-background p-6">
                <span className="flex h-8 w-8 items-center justify-center rounded-sm bg-primary/10 font-mono text-xs font-bold text-primary">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="mt-4 mb-2 flex items-center gap-2">
                  <s.icon className="h-4 w-4 text-primary" />
                  <h3 className="font-display text-sm font-bold">{s.title}</h3>
                </div>
                <p className="text-sm leading-relaxed text-foreground/75">{s.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────── CTA ─────────── */

function CtaBand({ onConnect, connected }: { onConnect: () => void; connected: boolean }) {
  return (
    <section className="border-b border-border">
      <Reveal className="mx-auto max-w-5xl px-6 py-20 text-center">
        <h2 className="font-display text-2xl font-bold sm:text-3xl">Start in seconds</h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-foreground/75">
          Log in with email — CRUZ handles the wallet, the upgrade, and the routing.
        </p>
        <div className="mt-7 flex justify-center">
          <button
            onClick={onConnect}
            className="group inline-flex items-center gap-2 rounded-sm bg-primary px-6 py-3 font-mono text-sm font-medium text-primary-foreground hover:bg-primary-hover"
          >
            {connected ? "Open dashboard" : "Log in with Magic"}
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </button>
        </div>
      </Reveal>
    </section>
  );
}

/* ─────────── Footer ─────────── */

function Footer() {
  return (
    <footer className="mx-auto flex max-w-5xl items-center justify-between px-6 py-10 font-mono text-xs text-muted-foreground">
      <span>© {new Date().getFullYear()} CRUZ</span>
      <span>Built on Particle Universal Accounts + Arbitrum</span>
    </footer>
  );
}
