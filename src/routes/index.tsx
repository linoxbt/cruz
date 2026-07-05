import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, ScanSearch, Waypoints, PackagePlus, ShieldCheck, Zap } from "lucide-react";
import { LogoMark } from "@/components/shared/Logo";
import { ConnectModal } from "@/components/web3/ConnectModal";
import { useAccount } from "wagmi";
import { cn } from "@/lib/utils";

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
      <ChainFlow />
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
    <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
        <Link to="/app" className="flex items-center gap-2" aria-label="CRUZ dashboard">
          <LogoMark className="h-7 w-7" />
          <span className="text-base font-bold tracking-tight">
            CR<span className="text-primary">UZ</span>
          </span>
        </Link>
        <nav className="ml-4 hidden items-center gap-6 text-xs text-muted-foreground md:flex">
          <a href="#modules" className="hover:text-foreground">
            Modules
          </a>
          <a href="#how" className="hover:text-foreground">
            How it works
          </a>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Link
            to="/app"
            className="hidden rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:border-primary/50 hover:text-foreground sm:inline-flex"
          >
            Open app
          </Link>
          <button
            onClick={onConnect}
            className="rounded-lg bg-primary px-3.5 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary-hover"
          >
            {connected ? "Dashboard" : "Log in"}
          </button>
        </div>
      </div>
    </header>
  );
}

/* ─────────── Hero ─────────── */

function Hero({ onConnect, connected }: { onConnect: () => void; connected: boolean }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  return (
    <section className="relative overflow-hidden border-b border-border">
      {/* violet radial glow */}
      <div
        aria-hidden
        className="cruz-glow pointer-events-none absolute inset-x-0 top-0 h-[60vh]"
      />
      {/* animated crossing-arcs backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-30"
      >
        <CrossingArcs />
      </div>

      <div className="relative mx-auto max-w-4xl px-4 py-24 text-center sm:px-6 sm:py-32">
        <div
          className={cn(
            "mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-[11px] text-muted-foreground transition-opacity duration-700",
            mounted ? "opacity-100" : "opacity-0",
          )}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-success" />
          Universal Accounts on Arbitrum
        </div>

        <h1
          className={cn(
            "text-5xl font-extrabold leading-[1.05] tracking-tight transition-all duration-700 sm:text-7xl",
            mounted ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0",
          )}
        >
          One account.
          <br />
          <span className="bg-gradient-to-r from-primary to-info bg-clip-text text-transparent">
            Any chain.
          </span>
        </h1>

        <p
          className={cn(
            "mx-auto mt-6 max-w-xl text-base text-muted-foreground transition-all delay-150 duration-700 sm:text-lg",
            mounted ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0",
          )}
        >
          CRUZ is a chain-abstraction console. Inspect a Universal Account&apos;s unified balance,
          run a real EIP-7702 upgrade, compose cross-chain transactions, and scaffold a
          chain-abstracted app — all from one place.
        </p>

        <div
          className={cn(
            "mt-9 flex flex-wrap items-center justify-center gap-3 transition-all delay-300 duration-700",
            mounted ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0",
          )}
        >
          <button
            onClick={onConnect}
            className="group inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary-hover"
          >
            {connected ? "Open dashboard" : "Get started"}
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </button>
          <Link
            to="/app"
            className="inline-flex items-center gap-2 rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-muted-foreground hover:border-primary/50 hover:text-foreground"
          >
            Explore the app
          </Link>
        </div>
      </div>
    </section>
  );
}

/* Crossing-arcs motif — the CRUZ mark, animated large. */
function CrossingArcs() {
  return (
    <svg viewBox="0 0 400 400" className="h-[60vh] w-[60vh]" fill="none">
      <circle cx="200" cy="200" r="180" stroke="var(--color-border)" strokeWidth="1" />
      <path
        d="M60 60C140 90 180 140 200 200C220 260 260 310 340 340"
        stroke="var(--color-primary)"
        strokeWidth="2.5"
        strokeLinecap="round"
        className="cruz-arc-1"
      />
      <path
        d="M60 340C140 310 180 260 200 200C220 140 260 90 340 60"
        stroke="var(--color-success)"
        strokeWidth="2.5"
        strokeLinecap="round"
        className="cruz-arc-2"
      />
      <circle cx="200" cy="200" r="6" fill="var(--color-primary)" className="cruz-arc-pulse" />
    </svg>
  );
}

/* ─────────── Chain flow band ─────────── */

const CHAINS = ["Ethereum", "Arbitrum", "Base", "BSC", "X Layer", "Solana"];

function ChainFlow() {
  return (
    <section className="border-b border-border bg-surface py-10">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <p className="mb-5 text-center text-[11px] uppercase tracking-wider text-meta">
          Unified across every chain Particle supports
        </p>
        <div className="cruz-marquee relative overflow-hidden">
          <div className="cruz-marquee-track flex w-max gap-10">
            {[...CHAINS, ...CHAINS, ...CHAINS].map((c, i) => (
              <span
                key={i}
                className="flex items-center gap-2 text-sm font-medium text-muted-foreground"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-primary/60" />
                {c}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────── Modules ─────────── */

const MODULES = [
  {
    icon: ScanSearch,
    title: "Account Inspector",
    body: "See any address's unified cross-chain balance and EOA-vs-upgraded status, then run a real EIP-7702 upgrade.",
  },
  {
    icon: Waypoints,
    title: "Transaction Composer",
    body: "Compose a cross-chain Universal Transaction, preview routing and fees with no side effects, execute, and export a runnable snippet.",
  },
  {
    icon: PackagePlus,
    title: "Starter Scaffolder",
    body: "Generate a complete, chain-abstracted starter app with Universal Accounts pre-wired — delivered via GitHub or Vercel.",
  },
];

function Modules() {
  return (
    <section id="modules" className="border-b border-border">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="max-w-2xl">
          <div className="text-[11px] uppercase tracking-wider text-primary">The console</div>
          <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            Everything to build chain-abstracted apps
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Four focused modules, one identity. Inspect, compose, scaffold, and review — without
            bridging, without juggling chains.
          </p>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map((m) => (
            <div
              key={m.title}
              className="group rounded-xl border border-border bg-surface p-6 transition hover:border-primary/50 hover:bg-surface-2"
            >
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <m.icon className="h-5 w-5" />
              </div>
              <h3 className="text-base font-bold">{m.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{m.body}</p>
            </div>
          ))}
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
    body: "A passwordless embedded wallet — email or social. No seed phrases, no extensions.",
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
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="max-w-2xl">
          <div className="text-[11px] uppercase tracking-wider text-primary">How it works</div>
          <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            Three steps to any chain
          </h2>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <div
              key={s.title}
              className="relative rounded-xl border border-border bg-background p-6"
            >
              <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">
                {i + 1}
              </div>
              <div className="mb-2 flex items-center gap-2">
                <s.icon className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-bold">{s.title}</h3>
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">{s.body}</p>
            </div>
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
      <div className="cruz-glow relative mx-auto max-w-4xl px-4 py-20 text-center sm:px-6">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Start in seconds</h2>
        <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
          Log in with email or social. CRUZ handles the wallet, the upgrade, and the routing.
        </p>
        <div className="mt-7 flex justify-center">
          <button
            onClick={onConnect}
            className="group inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary-hover"
          >
            {connected ? "Open dashboard" : "Log in with Magic"}
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </button>
        </div>
      </div>
    </section>
  );
}

/* ─────────── Footer ─────────── */

function Footer() {
  return (
    <footer className="bg-background">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 py-10 sm:flex-row sm:px-6">
        <div className="flex items-center gap-2">
          <LogoMark className="h-6 w-6" />
          <span className="text-sm font-bold">
            CR<span className="text-primary">UZ</span>
          </span>
        </div>
        <span className="text-[10px] text-meta sm:ml-auto">
          CRUZ — one account, any chain. Built on Particle Universal Accounts + Arbitrum.
        </span>
      </div>
    </footer>
  );
}
