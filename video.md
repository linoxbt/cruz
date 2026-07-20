# CRUZ — Demo Video Script

A conversational walkthrough script for a screen-recorded product demo of CRUZ.
Total runtime: **~4 minutes 30 seconds**. Tone: relaxed, confident, human —
like you're showing a friend something you're proud of, not reading a brochure.

**How to use this doc:** each section has a target duration, an **[ON SCREEN]**
cue (what to click/show), and a **[SAY]** block (what to say, written the way
you'd actually talk). The say-lines are a guide, not a teleprompter — paraphrase
so it sounds like you. Pauses are marked with `—`.

**Before you record:**
- Log in ahead of time so you're not waiting on the email OTP on camera (or pre-stage a second take for the login beat).
- Make sure the wallet has a little ETH on Arbitrum One if you plan to show a live on-chain action; otherwise keep those beats to preview-only.
- Close other tabs, set the browser zoom to ~110%, and use dark mode — it's the app's default and it looks best.
- Have one or two ideas in mind for the AI Builder prompt so you're not typing slowly while talking.

---

## 0:00 – 0:20 · Cold open (Landing page)

**[ON SCREEN]** Start on the CRUZ landing page. Let the hero animation (the orbiting nodes around the logo) play for a beat before you talk.

**[SAY]**
> "So — wallets today are kind of a mess. You've got assets scattered across five different chains, you're bridging, you're switching networks, you're backing up seed phrases. CRUZ is my take on fixing that. One account, any chain. Let me just show you."

**[ON SCREEN]** Scroll slowly down the landing page so the module sections animate in, then stop.

---

## 0:20 – 0:45 · The one-liner + logging in

**[ON SCREEN]** Click the main call-to-action ("Launch app" / "Get started"). The connect modal opens.

**[SAY]**
> "There's no extension to install and no seed phrase. You log in with email or a social account — it's a Magic embedded wallet under the hood. I'll drop in my email... and I'm in. That's the whole onboarding."

**[ON SCREEN]** Complete login (or cut to the logged-in dashboard if you pre-staged it). Land on the dashboard at `/app`.

---

## 0:45 – 1:15 · The dashboard & the core idea

**[ON SCREEN]** The Universal Account dashboard. Point the cursor at the unified balance card and the per-chain breakdown.

**[SAY]**
> "This is the home screen. The big number here is my unified balance — that's everything I hold, aggregated across every chain, in one place. I'm not looking at 'my Base wallet' or 'my Arbitrum wallet' anymore. It's just... my account. And underneath, you can see the per-chain breakdown if you want the detail."

**[ON SCREEN]** Hover the account-status card (EOA vs. upgraded).

**[SAY]**
> "The way this works is an EIP-7702 upgrade — one signature turns my regular wallet into what's called a Universal Account, without changing my address. I'll show you where that lives in a second."

---

## 1:15 – 1:45 · Account Inspector

**[ON SCREEN]** Click **Account Inspector** in the sidebar. Show the balance, the delegation status, and the upgrade panel.

**[SAY]**
> "This is the Account Inspector. It reads my balance straight from Particle's Universal Accounts SDK, and it checks on-chain whether my address has been upgraded yet — it's literally reading the delegation code on the account. If I haven't upgraded, there's a one-click upgrade flow right here. It's a single signed authorization — same address, now chain-abstracted."

**[ON SCREEN]** *(Optional, only if the wallet is funded and you've tested it live)* trigger the upgrade and show the signing prompt. Otherwise just point at the button and move on.

---

## 1:45 – 2:20 · Transaction Composer

**[ON SCREEN]** Click **Transaction Composer**. Fill in a simple transfer — a token, an amount, a recipient. Click **Preview**.

**[SAY]**
> "Say I want to send something. Normally you'd think about which chain the funds are on, whether you need to bridge first — none of that here. I pick the token, the amount, who it's going to, and I preview. What comes back is the actual route and the fees, resolved by the SDK — but nothing's been sent yet. It's a real dry run."

**[ON SCREEN]** Point at the preview details (route/fees). Then click the **Export** / "export as code" option and show the generated TypeScript snippet.

**[SAY]**
> "And here's a nice touch for developers — I can export this exact transaction as runnable TypeScript. So whatever I just composed by clicking around, I can drop straight into my own project. Compose it visually, ship it as code."

---

## 2:20 – 3:20 · AI Builder (the showpiece)

**[ON SCREEN]** Click **AI Builder**. Start a new conversation. Type a real prompt, e.g. *"Build a token-gated event RSVP page with a countdown and a guest list."* Send it.

**[SAY]**
> "Okay, this is the part I'm most excited about. The AI Builder. I describe what I want in plain English, and an agent actually builds it — not a snippet, a whole runnable project."

**[ON SCREEN]** As it streams: let the analysis/plan card appear, then the file tree filling in, then flip to the **Preview** tab.

**[SAY]**
> "Notice what it's doing first — it doesn't just start spitting out code. It thinks. It tells me what it understood, lays out a plan, and then it starts writing files. You can watch the file tree fill in live on the right... and then this — the preview — is the app actually running, right here in the browser. No deploy step to see it."

**[ON SCREEN]** Send a follow-up prompt, e.g. *"Add a dark mode toggle in the header."* Show that only the relevant files change (the diff view).

**[SAY]**
> "And it's conversational. If I say 'add a dark mode toggle,' it doesn't throw everything away and start over — it edits just the files that need to change and keeps the rest of my app intact. It remembers the whole project. Every message makes it a little better."

**[ON SCREEN]** Briefly show the diff review / the "Apply" step.

**[SAY]**
> "Nothing's forced on me either — I review the diff before anything's applied. It's like pairing with a senior engineer who happens to be really fast."

---

## 3:20 – 3:45 · Billing (only if you want to show it; skip if unconfigured)

**[ON SCREEN]** Open the AI Builder's usage/settings panel showing free prompts remaining and the balance.

**[SAY]**
> "On the business side — every wallet gets five free prompts to try it. After that it's pay-as-you-build: you fund a small balance, you see the estimated cost before each run, and it never spends anything without you approving it first. No subscription, no surprise bill."

> *(If billing isn't switched on for this demo, skip this section entirely — the Builder just runs free.)*

---

## 3:45 – 4:10 · Contract Editor + Explorer (the blockchain-native bit)

**[ON SCREEN]** Click **Contract Editor**. Show a Solidity file compiling, the "Code with AI" panel, and the Deploy button.

**[SAY]**
> "And because this is a wallet-native, on-chain product, it goes deeper than a normal app builder. There's a full Solidity editor — it compiles right in the browser, there's an AI assistant to write and audit contracts, and I can deploy straight to Arbitrum from here."

**[ON SCREEN]** Click **Explorer**. Show blocks/transactions and the live stats.

**[SAY]**
> "There's even a built-in block explorer, so after I deploy or send something, I can go look at it on-chain without ever leaving CRUZ."

---

## 4:10 – 4:30 · Close

**[ON SCREEN]** Navigate back to the dashboard, or the landing page. Calm, wide shot.

**[SAY]**
> "So that's CRUZ. One login, one account, any chain — inspect your balance, move funds across chains, build a whole app from a sentence, write and deploy contracts, all in one place. No bridges, no network-switching, no seed phrases. If that sounds like the way this should've worked all along... yeah, that's the idea. Thanks for watching."

**[ON SCREEN]** Hold on the logo for a beat, then end.

---

## Recording notes & tips

- **Pace:** the AI Builder section is the emotional peak — let the preview actually render before you talk over it. Silence while something impressive loads is fine.
- **If something errors on camera:** don't fight it live. Cut, fix, and re-take that one beat. The script is modular — each section stands alone.
- **On-chain actions cost real gas** (Arbitrum One, no testnet). Only show a live upgrade/send/deploy if you've funded the wallet and rehearsed it; otherwise keep those beats to preview/compile only and say "I'll spare you the signing prompt."
- **Length:** to make a tight 60-second cut, keep 0:00–0:20 (hook), 2:20–3:20 (AI Builder), and 4:10–4:30 (close).
- **Captions:** the say-lines double as caption copy if you're posting to social.
