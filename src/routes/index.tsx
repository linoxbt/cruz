import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { ArrowRight, ShieldCheck, Zap, Waypoints, Layers } from "lucide-react";
import { useAccount } from "wagmi";
import { LogoMark } from "@/components/shared/Logo";
import { ConnectModal } from "@/components/web3/ConnectModal";
import { CRUZ_MODULES, CRUZ_MODULE_ICONS } from "@/lib/studio/manifest";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "CRUZ | One account, any chain" }] }),
  component: Landing,
});

function Landing() {
  const navigate = useNavigate();
  const [showConnect, setShowConnect] = useState(false);
  const { isConnected } = useAccount();

  // Every "log in / open the app" CTA on this page shares this logic: if
  // already connected, go straight to the dashboard, never re-prompt a
  // login modal on top of an existing session.
  const enter = () => {
    if (isConnected) navigate({ to: "/app" });
    else setShowConnect(true);
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <Nav onEnter={enter} connected={isConnected} />
      <Hero onEnter={enter} connected={isConnected} />
      <Stats />
      <Modules />
      <HowItWorks />
      <Architecture />
      <CtaBand onEnter={enter} connected={isConnected} />
      <Footer />
      {showConnect && <ConnectModal onClose={() => setShowConnect(false)} />}
    </div>
  );
}

/* ─────────── Shared motion variants ─────────── */

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

/* ─────────── Nav ─────────── */

function Nav({ onEnter, connected }: { onEnter: () => void; connected: boolean }) {
  return (
    <nav
      aria-label="Site"
      className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6"
    >
      <Link to="/" className="flex items-center gap-2" aria-label="CRUZ home">
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
        <Link to="/docs" className="hidden hover:text-foreground sm:inline">
          Docs
        </Link>
        <button
          onClick={onEnter}
          className="rounded-sm bg-primary px-3.5 py-1.5 normal-case text-primary-foreground hover:bg-primary-hover"
        >
          {connected ? "Dashboard" : "Log in"}
        </button>
      </div>
    </nav>
  );
}

/* ─────────── Hero — asymmetric two-column with an animated orbit visual ─────────── */

const ORBIT_NODES = [
  { icon: Waypoints, angle: 0, label: "Route" },
  { icon: ShieldCheck, angle: 120, label: "Sign" },
  { icon: Layers, angle: 240, label: "Aggregate" },
];

function OrbitVisual() {
  const reduceMotion = useReducedMotion();
  const spin = reduceMotion ? 0 : 24;

  return (
    <div className="relative mx-auto flex h-72 w-72 items-center justify-center sm:h-80 sm:w-80">
      {/* Concentric rings */}
      <div className="cruz-glow absolute inset-0 rounded-full border border-border/60" />
      <div className="absolute inset-6 rounded-full border border-dashed border-border/50" />

      {/* Orbiting nodes, counter-rotated so their icons stay upright */}
      <motion.div
        className="absolute inset-0"
        animate={{ rotate: 360 }}
        transition={{ duration: spin || 1, repeat: reduceMotion ? 0 : Infinity, ease: "linear" }}
      >
        {ORBIT_NODES.map((n) => (
          <div
            key={n.label}
            className="absolute left-1/2 top-1/2 h-0 w-0"
            style={{ transform: `rotate(${n.angle}deg) translate(0, -140px)` }}
          >
            <motion.div
              animate={{ rotate: -360 }}
              transition={{
                duration: spin || 1,
                repeat: reduceMotion ? 0 : Infinity,
                ease: "linear",
              }}
              className="flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-full border border-primary/40 bg-surface text-primary shadow-sm">
                <n.icon className="h-4 w-4" />
              </span>
              <span className="font-mono text-[9px] uppercase tracking-widest text-meta">
                {n.label}
              </span>
            </motion.div>
          </div>
        ))}
      </motion.div>

      {/* Central hub: your one account */}
      <div className="relative z-10 flex h-24 w-24 items-center justify-center rounded-2xl border border-primary/50 bg-surface shadow-lg">
        <LogoMark className="h-10 w-10" />
      </div>
    </div>
  );
}

function Hero({ onEnter, connected }: { onEnter: () => void; connected: boolean }) {
  return (
    <header className="border-b border-border">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-6 py-20 md:grid-cols-2 md:py-28">
        <motion.div
          initial="hidden"
          animate="show"
          variants={stagger}
          className="text-center md:text-left"
        >
          <motion.p
            variants={fadeUp}
            className="mb-4 font-mono text-xs uppercase tracking-widest text-primary"
          >
            &gt; universal accounts on arbitrum
          </motion.p>
          <motion.h1
            variants={fadeUp}
            className="text-balance font-display text-5xl font-bold leading-[1.05] md:text-6xl"
          >
            One account.
            <br />
            <span className="text-primary">Any chain.</span>
          </motion.h1>
          <motion.p
            variants={fadeUp}
            className="mx-auto mt-6 max-w-xl text-[15px] leading-relaxed text-foreground/80 md:mx-0"
          >
            CRUZ is a chain-abstraction console. Inspect a Universal Account&apos;s unified balance,
            run a real EIP-7702 upgrade, compose cross-chain transactions, and build a
            chain-abstracted app, all from one place.
          </motion.p>
          <motion.div
            variants={fadeUp}
            className="mt-8 flex flex-wrap items-center justify-center gap-4 md:justify-start"
          >
            <button
              onClick={onEnter}
              className="group inline-flex items-center gap-2 rounded-sm bg-primary px-5 py-2.5 font-mono text-sm font-medium text-primary-foreground hover:bg-primary-hover"
            >
              {connected ? "Open dashboard" : "Get started"}
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </button>
            <Link
              to="/docs"
              className="font-mono text-sm text-muted-foreground hover:text-foreground"
            >
              Read the docs
            </Link>
          </motion.div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.15 }}
        >
          <OrbitVisual />
        </motion.div>
      </div>
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
      <motion.div
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.4 }}
        variants={stagger}
        className="mx-auto grid max-w-5xl grid-cols-2 gap-6 px-6 py-10 md:grid-cols-4"
      >
        {STATS.map((s) => (
          <motion.div key={s.label} variants={fadeUp} className="text-center">
            <div className="font-display text-3xl font-bold text-primary">{s.value}</div>
            <div className="mt-1 font-mono text-[11px] uppercase tracking-wider text-meta">
              {s.label}
            </div>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}

/* ─────────── Modules — alternating left/right feature rows ─────────── */

function Modules() {
  return (
    <section id="modules" className="border-b border-border">
      <div className="mx-auto max-w-5xl px-6 py-20">
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.6 }}
          variants={fadeUp}
        >
          <p className="mb-3 text-center font-mono text-xs uppercase tracking-widest text-muted-foreground md:text-left">
            The console
          </p>
          <h2 className="text-balance text-center font-display text-2xl font-bold md:text-left">
            Everything to build chain-abstracted apps
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-sm leading-relaxed text-foreground/75 md:mx-0 md:text-left">
            Focused modules, one identity. Inspect, compose, build, and deploy, without bridging,
            without juggling chains.
          </p>
        </motion.div>

        <div className="mt-14 space-y-14">
          {CRUZ_MODULES.map((m, i) => {
            const Icon = CRUZ_MODULE_ICONS[m.id];
            const fromLeft = i % 2 === 0;
            return (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, x: fromLeft ? -40 : 40 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className={`flex flex-col items-center gap-6 md:flex-row ${
                  fromLeft ? "" : "md:flex-row-reverse"
                }`}
              >
                <div className="flex h-32 w-32 shrink-0 items-center justify-center rounded-2xl border border-border bg-surface">
                  <Icon className="h-10 w-10 text-primary" />
                </div>
                <Link
                  to={m.path}
                  className="cruz-card-glow block flex-1 rounded-sm border border-border p-6 text-center transition hover:border-primary/50 md:text-left"
                >
                  <span className="font-mono text-xs tracking-widest text-primary">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3 className="mt-2 font-display text-lg font-bold">{m.label}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-foreground/75">{m.description}</p>
                </Link>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ─────────── How it works — alternating steps ─────────── */

const STEPS = [
  {
    icon: ShieldCheck,
    title: "Log in with Magic",
    body: "A passwordless embedded wallet, email + OTP. No seed phrases, no extensions.",
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
      <div className="mx-auto max-w-5xl px-6 py-20">
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.6 }}
          variants={fadeUp}
        >
          <p className="mb-3 text-center font-mono text-xs uppercase tracking-widest text-muted-foreground md:text-left">
            How it works
          </p>
          <h2 className="text-balance text-center font-display text-2xl font-bold md:text-left">
            Three steps to any chain
          </h2>
        </motion.div>
        <div className="mt-12 space-y-10">
          {STEPS.map((s, i) => {
            const fromLeft = i % 2 === 0;
            return (
              <motion.div
                key={s.title}
                initial={{ opacity: 0, x: fromLeft ? -40 : 40 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, amount: 0.5 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className={`flex flex-col items-center gap-6 md:flex-row ${
                  fromLeft ? "" : "md:flex-row-reverse"
                }`}
              >
                <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-sm font-bold text-primary">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="flex-1 rounded-sm border border-border bg-background p-6 text-center md:text-left">
                  <div className="flex items-center justify-center gap-2 md:justify-start">
                    <s.icon className="h-4 w-4 text-primary" />
                    <h3 className="font-display text-sm font-bold">{s.title}</h3>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-foreground/75">{s.body}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ─────────── Architecture / trust band ─────────── */

const STACK = [
  { name: "Magic", role: "Passwordless embedded wallet, the sole signer" },
  { name: "Particle Network", role: "Universal Accounts SDK, aggregation + routing" },
  { name: "Arbitrum One", role: "Primary chain, real mainnet, no testnet" },
];

function Architecture() {
  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-5xl px-6 py-20">
        <motion.p
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.6 }}
          variants={fadeUp}
          className="mb-3 text-center font-mono text-xs uppercase tracking-widest text-muted-foreground"
        >
          Built on
        </motion.p>
        <motion.h2
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.6 }}
          variants={fadeUp}
          className="text-balance text-center font-display text-2xl font-bold"
        >
          Real infrastructure, not a wrapper
        </motion.h2>

        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.3 }}
          variants={stagger}
          className="mt-12 grid gap-4 sm:grid-cols-3"
        >
          {STACK.map((s, i) => (
            <motion.div key={s.name} variants={fadeUp} className="relative">
              <div className="rounded-sm border border-border bg-surface p-5 text-center">
                <div className="font-display text-base font-bold text-foreground">{s.name}</div>
                <p className="mt-2 text-xs leading-relaxed text-foreground/70">{s.role}</p>
              </div>
              {i < STACK.length - 1 && (
                <span
                  className="absolute right-[-18px] top-1/2 hidden -translate-y-1/2 font-mono text-primary sm:block"
                  aria-hidden
                >
                  <ArrowRight className="h-4 w-4" />
                </span>
              )}
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

/* ─────────── CTA ─────────── */

function CtaBand({ onEnter, connected }: { onEnter: () => void; connected: boolean }) {
  return (
    <section className="border-b border-border">
      <motion.div
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.6 }}
        variants={fadeUp}
        className="mx-auto max-w-5xl px-6 py-20 text-center"
      >
        <h2 className="font-display text-2xl font-bold sm:text-3xl">Start in seconds</h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-foreground/75">
          Log in with email, CRUZ handles the wallet, the upgrade, and the routing.
        </p>
        <div className="mt-7 flex justify-center">
          <button
            onClick={onEnter}
            className="group inline-flex items-center gap-2 rounded-sm bg-primary px-6 py-3 font-mono text-sm font-medium text-primary-foreground hover:bg-primary-hover"
          >
            {connected ? "Open dashboard" : "Log in with Magic"}
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </button>
        </div>
      </motion.div>
    </section>
  );
}

/* ─────────── Footer ─────────── */

function Footer() {
  return (
    <footer className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 px-6 py-10 font-mono text-xs text-muted-foreground sm:flex-row">
      <span>© {new Date().getFullYear()} CRUZ</span>
      <div className="flex items-center gap-4">
        <Link to="/docs" className="hover:text-foreground">
          Docs
        </Link>
        <Link to="/explorer" className="hover:text-foreground">
          Explorer
        </Link>
      </div>
      <span>Built on Particle Universal Accounts + Arbitrum</span>
    </footer>
  );
}
