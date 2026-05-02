# CityFalcon News API — Trigger Source for the WDK Agent

> **We are going Track 1 — Vercel WDK. CityFalcon news API is the trigger source for our durable agent.**

This file holds verbatim source material for the CityFalcon side of the durable agent (the news-driven trigger), followed by my own perception/recommendations clearly separated below a horizontal rule.

The agent watches a curated list of ~10 companies. When the CityFalcon API surfaces an "impactful enough" story for any of them, a durable Vercel WDK workflow kicks off and runs deep impact analysis. CityFalcon supplies (a) the trigger feed, (b) related-coverage signals (`similar_stories`), (c) entity sentiment trend, and (d) DCSC sector classification + adjacent-company lookup for spillover analysis.

---

## Source — Existing CityFalcon MCP prototype (reference only)

**Location:** `c:\Users\dimkn\source\repos\automation_agent\financial_mcp.py`
**Found:** 2026-05-02 in `automation_agent` (separate from CityFalcon repos).

Working Python `FastMCP` server that wraps the CityFalcon API and DCSC API for use as a Model Context Protocol server. **For our hackathon this is reference only — we will call the CityFalcon REST API directly from TypeScript inside `"use step"` functions, not via MCP.** The MCP code is the authoritative source for endpoint paths, query params, and response field names because it's working code that talks to the production API today.

### Files in the prototype repo

```
automation_agent/
  Dockerfile
  README.md
  TODO.md
  docker-compose.yml
  environment.yml
  financial_mcp.py           ← main MCP server (1098 lines)
  financial_mcp.py.legacy
  requirements.txt
  sectors.json
  serve_http.py
  tests.py
  weather.py
  .env                        ← contains CITYFALCON_API_KEY (masked below)
```

### `.env` keys (masked)

> `CITYFALCON_API_KEY="356***"` (real key in file; first 4 + masked)

---

## Source — CityFalcon API endpoints (verbatim from `financial_mcp.py`)

**Base URLs (verbatim from lines 10-11):**

```python
CITYFALCON_API_BASE_URL = "https://api.cityfalcon.com/v0.2"
DCSC_API_BASE_URL = "https://api.cityfalcon.com/dcsc/v0.1"
```

**Auth (verbatim from lines 14-31):**

```python
HEADERS = {
    "Content-Type": "application/json"
}

# Auth via query parameter, not header
async def make_cityfalcon_request(endpoint: str, params: Dict[str, Any] = None):
    url = f"{CITYFALCON_API_BASE_URL}/{endpoint}"
    if params is None:
        params = {}
    params["access_token"] = CITYFALCON_API_KEY
    async with httpx.AsyncClient() as client:
        response = await client.get(url, params=params, headers=HEADERS, timeout=30.0)
```

> **Auth pattern:** GET request with `access_token=<KEY>` as a query parameter. No Authorization header.

### Endpoints used by the prototype (verbatim list)

| Endpoint (relative) | Purpose | Key params |
|---|---|---|
| `/stories` | Latest news for a ticker/topic | `identifier_type` (`assets` / `topic_classes`), `identifiers` (comma-separated), `categories` (`mp` for major publications, `all`), `time_filter` (`d1`/`w1`...), `order_by` (`latest`), `with_sentiment` (bool), `limit` |
| `/stories/{uuid}/similar_stories` | Stories similar to a given UUID | `limit` |
| `/stories/by_uuid` | Fetch specific stories by UUID | `uuids` (comma-separated), `with_sentiment` |
| `/services/sentiment` | Time-series sentiment per entity | `identifier_type`, `identifiers`, `period`, `average_for_period`, `statistics_for_period` |
| `/analyst_price_targets` | Analyst price targets (US assets) | `identifier` (ticker) |
| `/analyst_price_targets/summary` | Summary of analyst targets | `identifier` |
| `/analyst_price_targets/consensus` | Buy/hold/sell breakdown | `identifier` |
| `/insider_transactions` | Insider trading activity | `identifiers`, `transaction_type`, `page`, `per` |

### DCSC endpoints (verbatim — these are the sector-spillover unlock)

| Endpoint (relative to `/dcsc/v0.1/`) | Purpose | Key params |
|---|---|---|
| `/sectors` | List all DCSC sector slugs (hierarchy levels 1-4) | none |
| `/sectors/fetch` | Hierarchy for a specific sector slug | `level`, `slug` |
| `/smart_portfolio` | **Get relevant companies for given sector slug(s)** — adjacent-companies finder | `level`, `slugs`, `max_securities`, `min_relevance`, `min_confidence`, `company_type`, `countries`, `allocation_type` |
| `/portfolio_classification` | **Get relevant sectors for given companies** | `identifiers`, `identifier_type` (`slug`/`name`/`ticker`/`full_ticker`/`legal_id`), `min_relevance`, `min_confidence`, `level` |
| `/portfolio_perf_risk` | Performance + risk for a portfolio | `identifiers`, `identifier_type`, `period` |
| `/classified_sectors/mappings` | Map other classification systems (e.g. NAICS) → DCSC | `classification_name`, `sector_name`/`sector_number` |

### Response field names (verbatim from `format_story` lines 72-115)

> Per-story fields the prototype expects: `title`, `description`, `url`, `lang`, `cityfalconScore`, `sentiment`, `paywall`, `registrationRequired`, `assetTags`, `source.name`, `source.countryName`.

### Stories endpoint default params (verbatim from `get_news_by_ticker_or_topic` lines 301-309)

```python
params = {
    "identifier_type": "assets",
    "identifiers": ticker,
    "categories": "mp",       # Major publications
    "time_filter": "d1",      # Last 24 hours
    "order_by": "latest",
    "with_sentiment": True,
    "limit": limit
}
```

### Sentiment endpoint default params (verbatim from `get_entity_sentiment` lines 408-415)

```python
params = {
    "identifier_type": "topic_classes",
    "identifiers": identifiers,
    "period": period,            # e.g. "d1", "w1"
    "average_for_period": True,
    "statistics_for_period": True
}
```

---

## Source — CityFalcon public API plan & pricing

**URL:** [www.cityfalcon.ai/products/api/financial-news/pricing-api/commercial](https://www.cityfalcon.ai/products/api/financial-news/pricing-api/commercial)
**Fetched:** 2026-05-02

### Plans (verbatim table)

| Plan | Monthly Cost | API Calls/Month | Stories/Response | Max Search Period |
|------|-------------|-----------------|------------------|-------------------|
| Business Starter | $240 | 25,000 | 100 | 1 month |
| Starter Plus | $520 | 200,000 | 100 | 1 month |
| Scale Up | $960 | 500,000 | 200 | Full Archive* |
| Premium Scale Up | $3,200 | 1,000,000 | 500 | Full Archive* |
| Enterprise | Custom | Unlimited | 10,000 | Full Archive* |

\*Full Archive available from January 1, 2018 onward.

> Per-hour limits exist alongside monthly limits "to control usage to a reasonable level". Webhooks are not addressed in the public pricing documentation. Sentiment analysis is in premium tiers.

### Search capabilities (verbatim)

> "By tickers, names, stocks, cryptocurrencies, commodities, private companies, forex, indices, people, and 300K+ topics"
>
> "By countries, sectors, and industries"
>
> "By macro topics, major business events, company documents"
>
> "Over 13,000 curated business and financial news and research sources"

---

## Source — Verified API call (live test, 2026-05-02)

### Request (key masked)

```bash
curl -s "https://api.cityfalcon.com/v0.2/stories?identifier_type=assets&identifiers=AAPL&categories=mp&time_filter=d1&order_by=latest&with_sentiment=true&limit=2&access_token=356***"
```

### Response

> HTTP 200 — 3343 bytes — 2 stories returned for AAPL in the last 24h.

### Top-level response shape

```json
{
  "stories": [ ... ]
}
```

### Per-story field list (sorted, verbatim from response)

```
additionalData
assetTags
category
cityfalconScore
cityfalcon_permalink
description
duplicatesCount
imageUrls
lang
paywall
publishTime
registrationRequired
searchTags
sentiment
source
title
url
uuid
```

### Sample values (one story, sensitive content trimmed)

| Field | Value |
|---|---|
| `title` | "Apple stops selling cheapest 256GB Mac mini due to component shortage" |
| `source.name` | `indiatoday.in` |
| `sentiment` | `-97.0` (range -100..+100) |
| `cityfalconScore` | `42` (range 0..100) |
| `publishTime` | `2026-05-02T11:02:07.000Z` |

---
---

## MY PERCEPTION (clearly separated from source above)

Below this divider is *not* from CityFalcon — it's my interpretation. Treat the section above as canonical; this section is opinion.

### Wiring as the WDK trigger

Two viable patterns. Pick one and don't overthink it on hack day.

**Pattern A — Cron poller (RECOMMENDED for the demo).** Vercel Cron hits `/api/cron/poll` every 5-10 min. The route invokes `pollWatchlistOnce()` (a `"use workflow"`). Inside, fan out per-ticker `getStoriesForTicker()` calls in parallel `"use step"` functions, dedupe-by-`uuid` against Vercel KV, filter through `isImpactful(story)`, then for each survivor kick off a child `analyzeNewsImpact(story)` durable workflow. Why this wins: zero infra to set up, demo-friendly (cron just keeps firing), retries free.

**Pattern B — Manual trigger only.** Skip cron, just expose `POST /api/manual-trigger?ticker=...` → workflow. Use this if Vercel cron config gets fiddly. Demo flow: judge clicks a button on the dashboard → manual trigger fires for a ticker that's currently lit up.

**On hack day, ship Pattern B first (10 min), add cron as a polish item if time permits (15 min on top).** Pattern B is what the live demo will use anyway because waiting 5+ min for cron is bad UX in front of judges.

### "Impactful enough" heuristic — initial formula

Based on the verified field semantics:

```ts
function isImpactful(story: Story): boolean {
  return (
    story.cityfalconScore >= 60 &&         // CF's own quality/relevance signal
    Math.abs(story.sentiment) >= 50 &&      // strong polarity (either direction)
    story.duplicatesCount >= 3 &&            // at least 3 sources covering it
    !story.paywall                           // skip paywalled (Bright Data can't login-bypass)
  );
}
```

This is a starting point. Tune live during hack day with real data — the verified sample story (Apple Mac mini, score 42, sentiment -97, presumably low duplicatesCount from a single India Today article) would NOT trigger under this formula, which is correct. Want to see ~1-3 triggers per hour across 10 large-cap tickers; if too quiet, drop the score threshold; if too noisy, raise duplicatesCount.

**Better formula candidate (if time):** `score = log(1+duplicatesCount) * abs(sentiment) * (cityfalconScore/100)` — a continuous score we threshold at e.g. 30. Easier to tune one number than three.

### Watchlist — pick 10 large-caps for max news flow

Default suggestion (high news velocity, well-covered, US large-caps that maximise the chance of triggering during the demo window):

```
AAPL, MSFT, NVDA, GOOGL, META, AMZN, TSLA, JPM, XOM, BRK.B
```

Tweakable via `lib/watchlist.ts`. For the demo, swap one ticker at the last minute for whatever has the loudest current news.

### Fields the durable agent will consume downstream

When `isImpactful(story)` passes, hand the durable workflow this payload:

```ts
type StoryTrigger = {
  uuid: string;            // dedupe key + similar_stories input
  title: string;
  description: string;
  url: string;             // → Bright Data fetchArticle()
  publishTime: string;
  source: { name: string };
  sentiment: number;
  cityfalconScore: number;
  duplicatesCount: number;
  assetTags: string[];     // → drives sector/spillover lookups
};
```

`assetTags` is critical — this is how we map the story back to ticker(s) for the DCSC sector classification call. The format isn't documented in the verified response sample (assetTags array values weren't inspected); confirm during build.

### The DCSC angle — sector spillover (this is differentiation gold)

The DCSC endpoints `/portfolio_classification` (ticker → sectors) and `/smart_portfolio` (sectors → adjacent companies) are the unlock. Most hackathon entries will do "fetch news, summarize". WE will:

1. Story for AAPL with `cityfalconScore 80, sentiment -75` (chip supply cut).
2. `getSectorClassification("AAPL")` → returns sectors `["consumer-electronics", "semiconductors", ...]` with relevance scores.
3. `getCompaniesForSector(level=2, slugs="semiconductors")` → returns NVDA, AMD, QCOM, AVGO with relevance + confidence.
4. Hand all of this to the DurableAgent and ask: "Which adjacent companies are most exposed to this story? Why? What's the second-order trade?"

That's a story you can tell judges in 30 seconds and they get it instantly.

### Polling cadence vs rate limits

- The user's `.env` has a paid-tier key — exact tier unknown but the prototype uses it freely. Assume at minimum Business Starter ($240/mo, 25k calls/month, ~35 calls/hour avg).
- 10 tickers × 12 polls/hour (every 5 min) = 120 calls/hour for the trigger feed alone. Tight against per-hour limits.
- **Safer cadence: every 10 min** (60 calls/hour for the trigger). Plus enrichment per impactful story (~5 CityFalcon calls per analysis × ~3 impactful/hr = 15) = ~75 calls/hour total. Comfortable.

### Polling vs webhooks

CityFalcon's public docs don't mention webhooks. The prototype only does GETs. **Polling it is.** No need to chase webhooks during the hackathon.

### Things I couldn't verify

- **Exact tier of the API key** in `.env` — the prototype calls succeed but the per-hour budget isn't visible. Mitigation: monitor 429s during build, throttle if hit.
- **`assetTags` array contents** — sample response didn't show; need to inspect during build to confirm it's tickers vs CityFalcon IDs vs slugs.
- **`duplicatesCount` semantics** — assumed to be "other sources covering same story", but the docs don't confirm. Verify by reading 5 sample stories during build.
- **DCSC pricing tier requirement** — the public API plans page didn't show DCSC explicitly; the prototype calls work, so the user's key has access. Don't change plans.
- **Webhooks/SSE feed** — none documented; we polling.

### Pre-event check (do this when validating Bright Data + Gateway keys)

Run a 2-minute smoke test:
```bash
# 1. Trigger feed
curl "https://api.cityfalcon.com/v0.2/stories?identifier_type=assets&identifiers=AAPL,NVDA,TSLA&categories=mp&time_filter=d1&order_by=latest&with_sentiment=true&limit=10&access_token=$CITYFALCON_API_KEY"

# 2. Sector classification (the spillover unlock)
curl "https://api.cityfalcon.com/dcsc/v0.1/portfolio_classification?identifiers=AAPL&identifier_type=ticker&access_token=$CITYFALCON_API_KEY"

# 3. Adjacent companies for a sector (spillover candidates)
curl "https://api.cityfalcon.com/dcsc/v0.1/smart_portfolio?level=2&slugs=semiconductors&max_securities=10&access_token=$CITYFALCON_API_KEY"
```

If all three return 200 with non-empty bodies, the trigger + spillover stack is green and we go straight to scaffolding on hack day.
