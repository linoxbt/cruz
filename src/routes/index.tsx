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
      <ChainTicker />
      <Nav onConnect={() => setShowConnect(true)} connected={isConnected} />
      <Hero onConnect={() => setShowConnect(true)} connected={isConnected} />
      <Modules />
      <HowItWorks />
      <CtaBand onConnect={() => setShowConnect(true)} connected={isConnected} />
      <Footer />
      {showConnect && <ConnectModal onClose={() => setShowConnect(false)} />}
    </div>
  );
}

/* ─────────── Chain ticker ─────────── */

const CHAINS = ["Ethereum", "Arbitrum", "Base", "BSC", "X Layer", "Solana"];

function ChainTicker() {
  const track = [...CHAINS, ...CHAINS, ...CHAINS];
  return (
    <div className="overflow-hidden border-b border-border bg-surface py-2" aria-hidden="true">
      <div className="cruz-marquee-track flex w-max gap-8 whitespace-nowrap">
        {track.map((c, i) => (
          <span key={i} className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            <span className="mr-2 text-primary">·</span>
            {c}
          </span>
        ))}
      </div>
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

/* ─────────── Hero ─────────── */

function Hero({ onConnect, connected }: { onConnect: () => void; connected: boolean }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  return (
    <header className="mx-auto grid max-w-5xl gap-10 border-b border-border px-6 py-20 md:grid-cols-[1.2fr,1fr] md:items-center md:py-24">
      <div
        className={cn(
          "transition-all duration-700",
          mounted ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0",
        )}
      >
        <p className="mb-4 font-mono text-xs uppercase tracking-widest text-primary">
          &gt; universal accounts on arbitrum
        </p>
        <h1 className="text-balance font-display text-4xl font-bold leading-[1.1] md:text-5xl">
          One account.
          <br />
          <span className="text-primary">Any chain.</span>
        </h1>
        <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-foreground/80">
          CRUZ is a chain-abstraction console. Inspect a Universal Account&apos;s unified balance,
          run a real EIP-7702 upgrade, compose cross-chain transactions, and scaffold a
          chain-abstracted app — all from one place.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <button
            onClick={onConnect}
            className="group inline-flex items-center gap-2 rounded-sm bg-primary px-5 py-2.5 font-mono text-sm font-medium text-primary-foreground hover:bg-primary-hover"
          >
            {connected ? "Open dashboard" : "Get started"}
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </button>
          <Link
            to="/app"
            className="font-mono text-sm text-muted-foreground hover:text-foreground"
          >
            Explore the app →
          </Link>
        </div>
      </div>
      <div
        className={cn(
          "flex items-center justify-center transition-all delay-150 duration-700",
          mounted ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0",
        )}
      >
        <CrossingArcs />
      </div>
    </header>
  );
}

/* CRUZ mark, animated large — the hero's visual anchor. */
function CrossingArcs() {
  return (
    <svg viewBox="0 0 400 400" className="h-64 w-64 md:h-80 md:w-80" fill="none">
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

/* ─────────── Modules ─────────── */

const MODULES = [
  {
    tag: "01 — Inspect",
    icon: ScanSearch,
    title: "Account Inspector",
    body: "See any address's unified cross-chain balance and EOA-vs-upgraded status, then run a real EIP-7702 upgrade.",
  },
  {
    tag: "02 — Compose",
    icon: Waypoints,
    title: "Transaction Composer",
    body: "Compose a cross-chain Universal Transaction, preview routing and fees with no side effects, execute, and export a runnable snippet.",
  },
  {
    tag: "03 — Scaffold",
    icon: PackagePlus,
    title: "Starter Scaffolder",
    body: "Generate a complete, chain-abstracted starter app with Universal Accounts pre-wired — delivered via GitHub or Vercel.",
  },
];

function Modules() {
  return (
    <section id="modules" className="border-b border-border">
      <div className="mx-auto max-w-5xl px-6 py-16">
        <p className="mb-3 font-mono text-xs uppercase tracking-widest text-muted-foreground">
          The console
        </p>
        <h2 className="max-w-2xl text-balance font-display text-2xl font-bold">
          Everything to build chain-abstracted apps
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-foreground/75">
          Focused modules, one identity. Inspect, compose, and scaffold — without bridging,
          without juggling chains.
        </p>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {MODULES.map((m) => (
            <div key={m.title} className="cruz-card-glow rounded-sm border border-border p-6">
              <span className="font-mono text-xs tracking-widest text-primary">{m.tag}</span>
              <div className="mt-3 flex items-center gap-2">
                <m.icon className="h-4 w-4 text-primary" />
                <h3 className="font-display text-lg font-bold">{m.title}</h3>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-foreground/75">{m.body}</p>
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
      <div className="mx-auto max-w-5xl px-6 py-16">
        <p className="mb-3 font-mono text-xs uppercase tracking-widest text-muted-foreground">
          How it works
        </p>
        <h2 className="max-w-2xl text-balance font-display text-2xl font-bold">
          Three steps to any chain
        </h2>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <div key={s.title} className="rounded-sm border border-border bg-background p-6">
              <span className="flex h-8 w-8 items-center justify-center rounded-sm bg-primary/10 font-mono text-xs font-bold text-primary">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="mt-4 mb-2 flex items-center gap-2">
                <s.icon className="h-4 w-4 text-primary" />
                <h3 className="font-display text-sm font-bold">{s.title}</h3>
              </div>
              <p className="text-sm leading-relaxed text-foreground/75">{s.body}</p>
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
      <div className="mx-auto max-w-5xl px-6 py-20 text-center">
        <h2 className="font-display text-2xl font-bold sm:text-3xl">Start in seconds</h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-foreground/75">
          Log in with email or social. CRUZ handles the wallet, the upgrade, and the routing.
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
      </div>
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
