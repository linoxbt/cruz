import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/shared/PageHeader";
import { CRUZ_MODULES, CRUZ_MODULE_ICONS } from "@/lib/studio/manifest";

export const Route = createFileRoute("/docs")({
  head: () => ({ meta: [{ title: "Docs | CRUZ" }] }),
  component: DocsPage,
});

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "getting-started", label: "Getting started" },
  { id: "modules", label: "Modules" },
  { id: "how-it-works", label: "How it works" },
  { id: "security", label: "Security" },
  { id: "faq", label: "FAQ" },
];

function DocsPage() {
  return (
    <div>
      <PageHeader
        breadcrumb={["CRUZ", "Docs"]}
        title="Documentation"
        subtitle="How CRUZ works, module by module."
      />
      <div className="grid gap-8 p-6 lg:grid-cols-[200px_1fr]">
        <nav className="sticky top-6 hidden h-fit space-y-1 lg:block">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="block rounded-sm px-2.5 py-1.5 font-mono text-xs text-muted-foreground transition hover:bg-surface-2 hover:text-foreground"
            >
              {s.label}
            </a>
          ))}
        </nav>

        <div className="max-w-3xl space-y-14">
          <Overview />
          <GettingStarted />
          <Modules />
          <HowItWorks />
          <Security />
          <Faq />
        </div>
      </div>
    </div>
  );
}

function SectionHeading({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="scroll-mt-6 font-display text-xl font-bold text-foreground">
      {children}
    </h2>
  );
}

function Overview() {
  return (
    <section className="space-y-3">
      <SectionHeading id="overview">Overview</SectionHeading>
      <p className="text-sm leading-relaxed text-foreground/80">
        CRUZ is a chain-abstraction console for{" "}
        <a
          href="https://developers.particle.network/universal-accounts/cha/overview"
          target="_blank"
          rel="noreferrer"
          className="text-primary hover:underline"
        >
          Universal Accounts
        </a>{" "}
        on Arbitrum. It turns a plain wallet (an EOA) into a Universal Account through a real
        EIP-7702 authorization, giving you one unified balance and one signature across every chain
        Particle's Universal Accounts SDK supports, instead of bridging assets manually or juggling
        a wallet per chain.
      </p>
      <p className="text-sm leading-relaxed text-foreground/80">
        Everything in CRUZ builds on that single account: inspecting its balance, composing
        cross-chain transactions, building and deploying apps and contracts, and browsing activity
        on Arbitrum, all from one console, with one identity underneath.
      </p>
    </section>
  );
}

function GettingStarted() {
  return (
    <section className="space-y-3">
      <SectionHeading id="getting-started">Getting started</SectionHeading>
      <ol className="space-y-3 text-sm leading-relaxed text-foreground/80">
        <li>
          <span className="font-bold text-foreground">1. Log in.</span> CRUZ uses Magic for a
          passwordless embedded wallet, email + one-time code, no seed phrase and no browser
          extension to install.
        </li>
        <li>
          <span className="font-bold text-foreground">2. Upgrade once.</span> From the Account
          Inspector, run the EIP-7702 upgrade. It's a single signed authorization that turns your
          address into a Universal Account on Arbitrum One. This costs real gas; there's no testnet.
        </li>
        <li>
          <span className="font-bold text-foreground">3. Use any module.</span> Once upgraded, every
          module reads and acts through that same account, nothing to reconnect or reconfigure per
          module.
        </li>
      </ol>
    </section>
  );
}

function Modules() {
  return (
    <section className="space-y-4">
      <SectionHeading id="modules">Modules</SectionHeading>
      <div className="space-y-4">
        {CRUZ_MODULES.map((m) => {
          const Icon = CRUZ_MODULE_ICONS[m.id];
          return (
            <Link
              key={m.id}
              to={m.path}
              className="block rounded-sm border border-border bg-surface p-4 transition hover:border-primary/50"
            >
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-primary" />
                <h3 className="font-display text-sm font-bold text-foreground">{m.label}</h3>
                <span className="ml-auto font-mono text-[10px] text-meta">{m.path}</span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-foreground/75">{m.description}</p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section className="space-y-3">
      <SectionHeading id="how-it-works">How it works</SectionHeading>
      <p className="text-sm leading-relaxed text-foreground/80">
        Particle's Universal Accounts SDK aggregates balances and routes transactions across chains
        from a single smart-account address. EIP-7702 (a 2025 Ethereum upgrade) lets a plain EOA
        temporarily delegate its execution logic to a contract via a signed authorization, without
        changing the address or requiring a separate deploy. CRUZ builds the smallest possible
        carrier transaction for that authorization, signs it through the connected Magic wallet, and
        submits it through Particle. From then on, every balance lookup or cross-chain transaction
        on that address flows through the same Universal Account.
      </p>
      <p className="text-sm leading-relaxed text-foreground/80">
        The AI Builder and Contract Editor are separate, self-contained tools layered on top: the
        Builder is an autonomous coding agent that plans, writes, tests, and iterates on a full app
        in a persistent, resumable task list, with a live file tree, diff review, and a real
        sandboxed preview; the Editor compiles and deploys Solidity contracts directly to Arbitrum
        One. Both read and write through the same wallet and chain as everything else in CRUZ.
      </p>
    </section>
  );
}

function Security() {
  return (
    <section className="space-y-3">
      <SectionHeading id="security">Security</SectionHeading>
      <ul className="list-inside list-disc space-y-2 text-sm leading-relaxed text-foreground/80">
        <li>
          No secrets in the client bundle. Publicly-inlined env vars are IDs only, never keys.
        </li>
        <li>
          The Magic embedded wallet is the sole signer for account actions; CRUZ never holds or
          transports a private key on your behalf.
        </li>
        <li>
          The Contract Editor's optional "generate a separate deployer wallet" flow creates a plain
          local key pair, held only in that browser tab's memory. It's never sent anywhere or
          persisted, and it's unrecoverable if the tab closes before you export it.
        </li>
        <li>
          GitHub access (for the Scaffolder's repo delivery) is a real OAuth connection made once on
          the Settings page, scoped to repo creation, never a hand-pasted personal access token.
        </li>
        <li>
          Arbitrum One is mainnet everywhere in CRUZ. There is no testnet or faucet, every
          transaction costs real gas.
        </li>
      </ul>
    </section>
  );
}

const FAQ_ITEMS = [
  {
    q: "What chains are supported?",
    a: "CRUZ itself runs on Arbitrum One only. Once upgraded, your Universal Account can aggregate balances and route transactions across every chain Particle's Universal Accounts SDK supports, all surfaced through Arbitrum One as the primary chain.",
  },
  {
    q: "What happens to my keys?",
    a: "Your Magic embedded wallet is the only signer CRUZ uses for account actions. CRUZ never generates, holds, or transports a private key for your main account. The Contract Editor's optional separate deployer wallet is the one exception, and it's explicitly opt-in, browser-only, and clearly disclosed before you use it.",
  },
  {
    q: "What is a Universal Account?",
    a: "A Universal Account is what your EOA becomes after an EIP-7702 upgrade: the same address, but able to aggregate balances and route transactions across multiple chains through Particle's infrastructure, instead of needing a separate wallet or manual bridge per chain.",
  },
  {
    q: "Can I undo the EIP-7702 upgrade?",
    a: "The upgrade delegates execution to a contract via a signed authorization; it doesn't lock your address into anything permanent or custodial. Your Magic wallet remains in full control of signing.",
  },
  {
    q: "Does the AI Builder deploy code automatically?",
    a: "No. The AI Builder plans, writes, tests, and iterates on a full app, but nothing reaches a real repo, host, or chain without a review step you can see, it pauses for your approval and for any security-relevant findings before applying changes. Each connected wallet gets five free prompts; after that, generation is pay-as-you-build, where you see an estimated cost and approve spending before any funds move.",
  },
];

function Faq() {
  return (
    <section className="space-y-3">
      <SectionHeading id="faq">FAQ</SectionHeading>
      <div className="divide-y divide-border rounded-sm border border-border bg-surface">
        {FAQ_ITEMS.map((item) => (
          <details key={item.q} className="group p-4">
            <summary className="cursor-pointer font-mono text-sm font-bold text-foreground marker:content-none">
              {item.q}
            </summary>
            <p className="mt-2 text-sm leading-relaxed text-foreground/75">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
