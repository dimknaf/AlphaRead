# AlphaRead — Deep Read on the News That Moves Markets

> *Long-term impact analysis of financial news. Cuts through headline noise to surface what actually matters.*

This file is auto-loaded by Claude Code at the start of every session in this directory. Read it first to know what's going on.

## What this project is

**AlphaRead** — a solo hackathon entry for **Zero to Agent: London** (Saturday at Halkin, 1-2 Paris Garden, SE1 8ND). Built on **Track 1 — Vercel Workflow Development Kit (WDK)**: long-running, durable async agents (`"use workflow"` / `"use step"` directives + `DurableAgent` from `@workflow/ai/agent`), deployed to Vercel.

**Brand note:** The folder on disk is `zero-to-agent-hackathon` (Claude Code can't rename its own CWD on Windows, and renaming costs nothing functionally). Everything *visible* — repo name, package.json, Vercel project, README, dashboard title, demo URL — is **AlphaRead** / `alpharead`. See [docs/alpharead_branding.md](docs/alpharead_branding.md) for the full brand block.

## 🔒 Locked concept — News-Impact Durable Analyst

> The agent watches a curated list of ~10 companies via CityFalcon's `/v0.2/stories` endpoint (poll-based, every 5-10 min per ticker). When a story crosses an "impactful enough" threshold (heuristic combining `cityfalconScore`, `|sentiment|`, `duplicatesCount`, source tier), it triggers a long-running durable Vercel WDK workflow that runs deep impact analysis. **Bright Data fetches the full article** from the source URL. Parallel `"use step"` calls enrich with related context: Bright Data SERP for analyst reactions, CityFalcon `similar_stories` for related coverage, CityFalcon `services/sentiment` for sentiment trend, and CityFalcon DCSC `portfolio_classification` + `smart_portfolio` to identify **adjacent sectors and companies that could be affected by the same event**. A Claude `DurableAgent` (sonnet for reasoning, haiku for parallel extraction) produces a structured analyst note: long-term impact magnitude, earnings/market-cap context, adjacent sectors and companies, signal vs noise (what the market is missing), and 1-3 watch flags. Output streams to a single-page Next.js UI showing live workflow steps + the final note. **The Track 1 differentiator demo is killing the server mid-workflow and showing it resumes from the last completed step.**

## Working style for this project

This is a competitive build. The user has explicitly asked for maximum reliability and zero laziness — but also no bloat.

- **Bias to maximum thought, not minimum tokens.** Spend tokens on real reasoning — trace data flow end-to-end, anticipate edge cases, double-check against verified source-of-truth in [docs/](docs/).
- **Maximum thought ≠ maximum code.** No bloat, no speculative features, no fallbacks for impossible cases. The 6-hour build window punishes scope creep harder than it punishes simplicity.
- **Stay on the locked concept spine.** News → impact analysis via WDK. Side-quests (Mubit, UI polish, extra data sources) only after the spine is shippable. Re-read the locked concept paragraph above when uncertain.
- **Verify, don't assume.** Before claiming something works: run the curl, hit the URL, read the actual response. CityFalcon `/stories` already verified live (HTTP 200, real news data) — that's the pattern.
- **Reliability beats cleverness.** The kill-and-resume durability demo is the headline; protect it. A workflow that demonstrably resumes is worth more than a clever architecture that almost works.

## Status (update as we go)

- [x] Notion source pages rendered + read (Playwright dumps in [c:\tmp\notion-fetch\](c:/tmp/notion-fetch/)).
- [x] Track 1 commitment locked.
- [x] Reference docs saved into [docs/](docs/) (verbatim source separated from perception).
- [x] **Concept locked** — News-Impact Durable Analyst (paragraph above).
- [x] CityFalcon API key found ([c:\Users\dimkn\source\repos\automation_agent\\.env](c:/Users/dimkn/source/repos/automation_agent/.env)) + verified working (HTTP 200 against `/v0.2/stories?identifiers=AAPL`).
- [x] Pre-event setup partial: all 3 API keys verified live (CityFalcon, Vercel AI Gateway, Bright Data scrapeUrl on Wikipedia + Reuters). Vercel CLI installed (v53.1.0). Vercel WDK + AI SDK skills installed at [.claude/skills/](.claude/skills/).
- [ ] Pre-event remaining: `vercel login` (browser auth — user step), confirm `vercel whoami`.
- [ ] Project scaffolded (Next.js + WDK + first deploy).
- [ ] Vertical slice: CityFalcon trigger working end-to-end.
- [ ] Vertical slice: Bright Data enrichment working.
- [ ] Deep-analysis workflow + DurableAgent producing structured note.
- [ ] UI live (v0-generated components + streaming).
- [ ] Submission paperwork (BOTH forms).

## Where to look

| File | What's in it |
|---|---|
| [docs/track1_vercel_resources.md](docs/track1_vercel_resources.md) | Verbatim Vercel + WDK source + my perception. Source-of-truth for stack/tooling. |
| [docs/track1_event_info.md](docs/track1_event_info.md) | Verbatim event/prizes/submission/judging info + my perception. Logistics. |
| [docs/cityfalcon_news_api_guide.md](docs/cityfalcon_news_api_guide.md) | CityFalcon API source-of-truth (verbatim from the user's working MCP prototype + verified live curl) + my perception on triggering, impact heuristic, watchlist, DCSC spillover angle. |
| [docs/brightdata_guide.md](docs/brightdata_guide.md) | Bright Data Web Unlocker + SERP API source + my perception (TS wrapper signatures, $100 budget math, gotchas). |
| [docs/mubit_guide.md](docs/mubit_guide.md) | Mubit memory SDK source + my perception (stretch add-on; integrate only if 60+ min slack). |
| [docs/hackathon_useful_links.md](docs/hackathon_useful_links.md) | Restructured index of every link from all source pages. |
| [C:\Users\dimkn\.claude\plans\can-you-clearly-read-cuddly-plum.md](C:/Users/dimkn/.claude/plans/can-you-clearly-read-cuddly-plum.md) | The MEGA PLAN — sequenced course of action from now through submission. Read this for the full 8-step build plan with timing and ownership. |
| [c:\tmp\notion-fetch\](c:/tmp/notion-fetch/) | Raw Playwright dumps of both Notion pages (track1.txt, vercel.txt). |

## Stack decisions (locked)

- **Frontend + backend:** Next.js (App Router, TypeScript, Tailwind) — `npx create-next-app@latest --no-src-dir`.
- **Workflow engine:** WDK — `npm i workflow @workflow/ai`, wrap config with `withWorkflow` from `workflow/next`.
- **Agent:** `DurableAgent` from `@workflow/ai/agent`.
- **LLM access:** Vercel AI Gateway (single env var `GATEWAY_API_KEY`). Models: `anthropic/claude-sonnet-4.6` for reasoning, `anthropic/claude-haiku-4.5` for cheap per-step extraction.
- **Data trigger:** CityFalcon `/v0.2/stories` (auth via `access_token` query param, key in `.env.local`).
- **Web access (full article + search):** `@brightdata/sdk` — `client.scrape(url, {dataFormat:'markdown'})` and `client.search(query)`.
- **Sector spillover:** CityFalcon DCSC `/dcsc/v0.1/portfolio_classification` (ticker → sectors) + `/smart_portfolio` (sectors → adjacent companies). This is the differentiator — most entries won't have it.
- **Deploy:** GitHub repo (public — submission requires it) → Vercel auto-deploy on push.
- **No Python.** WDK in TS replaces the "always-on backend" pattern. v0 used surgically for UI components only.

## Build sequence (mega plan in one screen)

| Step | When | Who | What |
|---|---|---|---|
| 0 | Now | Me | Living-doc realignment (this file + cityfalcon guide + links + memory). |
| 1 | TODAY pre-event | Me + you | Bright Data signup, Vercel + AI Gateway key, `vercel login`, install WDK skill. Smoke-test all 3 keys. |
| 2 | 11:30-12:00 (30m) | Me (you on auth prompts) | Scaffold Next.js + WDK, create GitHub repo, `vercel link` + first deploy live. |
| 3 | 12:00-13:30 (90m) | Me | CityFalcon trigger: `lib/cityfalcon.ts` wrappers, `isImpactful()` heuristic, `pollWatchlistOnce()` workflow, manual-trigger API route. |
| 4 | 13:30-14:30 (60m) | Me (you on dashboard sanity check) | Bright Data enrichment: `lib/brightdata.ts` `fetchArticle` + `searchWeb` `"use step"` functions. |
| 5 | 14:30-16:30 (2h) | Me | Deep-analysis workflow + `DurableAgent` with the analyst prompt. End-to-end: trigger → enrichment → structured note. |
| 6 | 16:30-18:00 (90m) | You (v0) + me (wire) | UI: v0 generates dashboard components, I wire AI SDK streaming. |
| 7 | 18:00-19:00 (60m) | Me + you | README + screenshot + **kill-and-resume durability demo rehearsal**. |
| 8 | 19:00-19:30 (30m) | You (I assemble) | Submit BOTH local + global pool forms. Tag #ZeroToAgent. |
| 9 (stretch) | If 18:00 ships with 60+m slack | Me | Mubit `recall()`/`remember()` around the deep-analysis step. |

## Open decisions (small, can be answered during execution)

- **Exact `isImpactful` formula** — start with `cityfalconScore >= 60 && abs(sentiment) >= 50 && duplicatesCount >= 3 && !paywall`; tune live with real data.
- **Mubit add-on?** — gated by 60+ min slack at end. Skip if WDK is fragile.
- **Watchlist 10 tickers** — default: AAPL, MSFT, NVDA, GOOGL, META, AMZN, TSLA, JPM, XOM, BRK.B. Tweak last-minute for whatever has the loudest news.

## Hard rules (non-negotiable)

- **Reference docs format:** verbatim source above a `---` divider, "MY PERCEPTION" header below. Never silently mix the two.
- **Submission requires all three:** public GitHub repo + Vercel deployment + BOTH submission forms (local pool on oscarama.notion.site + global pool on community.vercel.com). Easy to forget the second.
- **19:30 hard stop** on hack day. Set a 19:00 alarm for "start submission paperwork."
- **Track 1 differentiator demo:** kill the server mid-workflow → show it resumes. Most submissions won't do this; it's the WDK headline. Protect it.
- **Three keys, one place:** [.env.local](.env.local) holds `CITYFALCON_API_KEY`, `BRIGHTDATA_API_KEY`, `GATEWAY_API_KEY`. Mirror to Vercel via `vercel env add`.

## Useful URLs to feed any LLM working in this repo

- [https://vercel.com/docs/llms-full.txt](https://vercel.com/docs/llms-full.txt) — full Vercel docs as one Markdown file.
- [https://ai-sdk.dev/llms.txt](https://ai-sdk.dev/llms.txt) — full AI SDK docs as one Markdown file.
- [https://workflow-sdk.dev/docs/ai](https://workflow-sdk.dev/docs/ai) — WDK + DurableAgent guide.

## What NOT to do

- Don't scaffold via v0 — v0 doesn't know about WDK directives or `withWorkflow` config.
- Don't add Python — WDK in TS handles the always-on/durable pattern natively.
- Don't mix verbatim source and my perception in the reference docs.
- Don't pivot toward the Mubit-only $100k track. Single-day demo can't show the learning curve their pitch needs.
- Don't skip the kill-and-resume rehearsal. That's the whole reason we're on Track 1.
