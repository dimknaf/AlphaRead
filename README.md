# AlphaRead

[![AlphaRead — demo video](https://img.youtube.com/vi/pOXXeI-CUDU/maxresdefault.jpg)](https://youtu.be/pOXXeI-CUDU)

> **Alpha for long-horizon investors — separates noise from meaningful events, traces sector spillover, reveals what the market misses.**

**Live demo:** [https://alpharead.vercel.app](https://alpharead.vercel.app)
**Stack:** Next.js 16 · Vercel Workflow Development Kit (WDK) · Vercel AI Gateway · Claude (Sonnet 4.6 + Haiku 4.5) · CityFalcon news API · Bright Data web access · Vercel Marketplace Redis

Submitted to **Zero to Agent: London** — Track 1 (Vercel WDK).

---

## What it does

AlphaRead is an always-on, durable agent that watches a curated list of large-cap US tickers. When a piece of news lands, a lightweight **Pre-check Agent** (Claude Haiku 4.5) decides if it's noise or worth a closer look. Stories that pass the gate go to a **Deep Analyst** (Claude Sonnet 4.6) that pulls the full article, related coverage, and adjacent-sector context — then writes a structured analyst note: long-term impact magnitude, what the market is missing, and which other companies are exposed.

Built on **Vercel WDK** so the workflow is durable end-to-end: kill the server mid-run and it picks back up from the last completed step. That's the Track 1 differentiator.

---

## How it works

```
┌─ CityFalcon /v0.2/stories  (poll every 10 min via Vercel Cron)
│  - 15 watchlist tickers, identifier_type=full_tickers (TICKER-US scheme)
│  - Returns title, description, source, sentiment, cityfalconScore
│
├─ Dedup against Redis (KV-side hexists check across runs / instances)
│
├─ Pre-check Agent  (Claude Haiku 4.5 via Vercel AI Gateway)
│  - generateObject + Zod schema → { verdict: skip|watch|deep, reason, confidence }
│  - "use step" so retries are durable
│
├─ State update  →  Redis hash + Redis list (activity feed)
│
└─ For "deep" verdicts:  Deep Analyst  (Claude Sonnet 4.6 via Gateway)
   ├─ Bright Data fetchArticle  →  full article text
   ├─ Bright Data searchWeb     →  analyst reactions, prior similar events
   ├─ CityFalcon similar_stories  →  related coverage
   ├─ CityFalcon DCSC portfolio_classification  →  sectors the company belongs to
   ├─ CityFalcon DCSC smart_portfolio  →  adjacent companies in those sectors
   └─ Structured AnalysisResult (5 sections):
      1. Headline impact + magnitude (small / material / major) + horizon
      2. Primary company impact (direction + rationale + sizing context)
      3. Sector spillover (which other sectors / companies are exposed)
      4. Signal vs noise (what the market is missing or over-reacting to)
      5. Watch flags (1-3 forward-looking things to monitor)
```

The dashboard reads from `/api/state` every 5 seconds and renders four sections:
- **Activity feed** — terminal-style log of every event (story arrived → judged → analyzed)
- **Top stories** — deep-verdict stories ranked by confidence × recency
- **Sector watch** — count of impactful stories per ticker in last 24h
- **Companies under watch** — last verdict per ticker

The **Track 1 differentiator demo:** kill the server while a workflow is running, restart, and watch it resume from the last completed step. Most submissions won't show this.

---

## Try it yourself

1. Open [https://alpharead.vercel.app](https://alpharead.vercel.app).
2. Click **Run poll now** in the top-right. The workflow starts in the background.
3. Watch the activity feed populate as judges classify incoming stories.
4. Hit refresh after a few minutes — Vercel Cron also fires the poll every 10 min.

---

## Local development

```bash
git clone https://github.com/dimknaf/AlphaRead.git
cd AlphaRead
cp .env.local.example .env.local
# fill in CITYFALCON_API_KEY, BRIGHTDATA_API_KEY, AI_GATEWAY_API_KEY
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

For Redis-backed state to work locally too, point `REDIS_URL` at any Redis instance (e.g. a free Upstash Redis URL).

---

## Project structure

```
src/
├── app/
│   ├── page.tsx                    # AlphaRead dashboard (client, auto-refresh)
│   ├── layout.tsx                  # AlphaRead branding
│   └── api/
│       ├── manual-trigger/route.ts # POST/GET — fire-and-return workflow
│       ├── state/
│       │   ├── route.ts            # GET dashboard sections
│       │   ├── upsert/route.ts     # POST single story state (called by workflow steps)
│       │   └── has-uuid/route.ts   # POST batch dedup check
│       └── ...
├── lib/
│   ├── types.ts            # Story, JudgeResult, StoryState, etc. (Zod-validated)
│   ├── cityfalcon.ts       # 5 endpoint wrappers (stories, similar, sentiment, sectors)
│   ├── watchlist.ts        # 15 large-cap tickers (TICKER-US format)
│   ├── judge.ts            # Pre-check Agent (Haiku 4.5 + generateObject + Zod)
│   ├── triggers.ts         # pollWatchlistOnce "use workflow" + step wrappers
│   └── state.ts            # Redis-backed CentralState + dashboard section derivations
docs/
├── alpharead_branding.md   # Brand block + 60-sec demo script
├── cityfalcon_news_api_guide.md
├── brightdata_guide.md
├── mubit_guide.md          # Stretch only
├── track1_vercel_resources.md
└── track1_event_info.md
vercel.json                 # Cron */10 * * * * + maxDuration 800
```

---

## Architecture decisions

- **Two-runtime split (WDK).** Workflow functions run in an Edge-like sandbox (no `Buffer`, no global `fetch`); step functions run in regular Node. ALL I/O — including Redis writes and HTTP calls — must live inside `"use step"` boundaries. State R/W is bridged through `/api/state/*` Node routes that the workflow calls via `fetch()` from inside step wrappers.
- **Identifier scheme.** CityFalcon's `identifier_type=full_tickers` with `TICKER-US` format is the only scheme that works reliably across mega-caps. The `assets` type gave sporadic 422s on MSFT, AMZN, UNH.
- **`fire-and-return`.** `/api/manual-trigger` enqueues the workflow and returns the runId in <1s. The dashboard polls `/api/state` every 5s to see results stream in. No long-blocking requests, no curl timeouts.
- **In-memory fallback dropped.** First version used an in-process `Map` for state; broken on Vercel because each serverless invocation is a fresh process. Switched to Vercel Marketplace Redis (Upstash) shared across instances.

---

## Status

- ✅ Pre-check Agent (Haiku 4.5) — live, judging news in production.
- ✅ Watchlist of 15 sector-diverse US large-caps — `AAPL-US, MSFT-US, NVDA-US, GOOGL-US, AMZN-US, META-US, TSLA-US, JPM-US, GS-US, BRK.B-US, XOM-US, CVX-US, UNH-US, LLY-US, WMT-US`.
- ✅ Vercel Cron every 10 min.
- ✅ Manual "Run poll now" button.
- ✅ Activity feed, top stories, sector watch, companies-under-watch sections.
- 🚧 Deep Analyst (Sonnet 4.6, full structured 5-section output) — **on `staging` branch**, post-submission iteration.
- 🚧 Per-story page with full analysis — staging.
- 🔮 Mubit memory integration — stretch goal.

---

## Credits

- **Vercel** — Workflow Development Kit (WDK), AI Gateway, Marketplace Redis, hosting. The whole platform is the foundation.
- **Anthropic / Claude** — Haiku 4.5 (judge) + Sonnet 4.6 (analyst).
- **CityFalcon** — financial news API + DCSC sector classification (the user's employer's product).
- **Bright Data** — Web Unlocker (full-article scraping) + SERP API.
- **Oscar Falemara** — host of Zero to Agent: London.
- **Halkin** — venue.

---

## License

MIT — see [LICENSE](LICENSE).
