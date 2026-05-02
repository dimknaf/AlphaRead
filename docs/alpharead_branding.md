# AlphaRead — Brand & Pitch

## Identity

| Field | Value |
|---|---|
| **Name** | AlphaRead |
| **Slug** | `alpharead` |
| **Tagline** | Deep, long-term impact analysis of financial news. Cuts through the noise to surface what actually moves markets. |
| **Tone** | Institutional / sell-side analyst. Serious. Quietly confident. Not consumer-app cute. |
| **Domain candidates** | `alpharead.app`, `alpharead.io`, `alpharead.fyi` |

**Why "AlphaRead":** *Alpha* = the excess return / informational edge institutional investors chase. *Read* = analyst slang for an interpretation ("what's your read on this story?"). Together: an agent that gives you the *deep read* on news — long-term impact, second-order effects, signal vs noise — not headline regurgitation.

## One-line elevator pitch

> AlphaRead watches your portfolio's news in real time and tells you what *actually* matters — long-term impact, who else gets hit, and what the market is missing — before you've finished your coffee.

## 60-second demo script (use at judging)

1. **(0:00–0:10) Setup.** "AlphaRead watches a curated list of companies for news that actually matters — and uses Vercel's Workflow SDK to run deep, durable, multi-source analysis on every event."
2. **(0:10–0:25) Trigger.** Click manual-trigger button on the live URL → workflow fires for a real story currently flagged impactful → live activity feed streams in: "Fetching article via Bright Data… Searching analyst reactions… Mapping sector exposure via DCSC… Identifying adjacent companies…"
3. **(0:25–0:45) Output.** Right panel populates with the structured analyst note: impact magnitude, adjacent companies, signal vs noise, watch flags. "Most products would stop at headlines. AlphaRead tells you that this Apple supply-chain story is actually bullish for AMD because…"
4. **(0:45–0:60) Differentiator.** "And here's the Track 1 moment." Kill the dev server mid-workflow → restart → workflow resumes from the last completed step. "That's the WDK headline — durable, long-running agents that survive crashes. Most submissions won't show this."

## Headline metaphors / phrases (for README, dashboard, pitch)

- "the deep read on the news"
- "long-term impact, not headline noise"
- "what the market is missing"
- "second-order effects across sectors"
- "signal vs noise, scored"

## What AlphaRead is NOT

- Not a real-time price tracker.
- Not a news aggregator (it's an *analyst*, not a feed).
- Not a chatbot you have to prompt — it works in the background, durably, on its own schedule.
- Not a sentiment ticker — sentiment is *one input*, not the output.

## Where the name shows up

| Surface | Set during | Value |
|---|---|---|
| `package.json` `"name"` | Step 2 (scaffold) | `alpharead` |
| GitHub repo URL | Step 2 | `github.com/<user>/alpharead` |
| Vercel project name | Step 2 (`vercel link`) | `alpharead` |
| Vercel deploy URL | Step 2 | `alpharead.vercel.app` (or `alpharead-<hash>.vercel.app` for previews) |
| README H1 | Step 7 | `# AlphaRead` |
| Browser tab title | Step 6 (UI) | `AlphaRead — News-Impact Analyst` |
| Dashboard header | Step 6 | `AlphaRead` |
| Submission forms (both) | Step 8 | `AlphaRead` |
| Social posts (#ZeroToAgent) | Step 8 | `AlphaRead by @<user>` |

## What stays as `zero-to-agent-hackathon`

Just the local folder path. Cosmetic, invisible to anyone outside the user's machine.
