# Bright Data — Web Access & Search Layer for the WDK Agent

> **We are going Track 1 — Vercel WDK. Bright Data is our web access + web search layer.**

This file holds verbatim source material from Bright Data docs for the article-fetching and web-search side of the durable agent, followed by my own perception/recommendations clearly separated below a horizontal rule.

For the news-monitoring durable agent: Bright Data covers (a) full article text fetch from a source URL after CityFalcon flags it impactful, and (b) web search for related context (analyst reactions, sector spillover, prior similar events) plus follow-up fetches of search-result URLs. Each fetch and each search is wired as one `"use step"` and exposed as a tool to `DurableAgent` from `@workflow/ai/agent`.

---

## Source — Bright Data product overview

**URL:** [docs.brightdata.com/llms.txt](https://docs.brightdata.com/llms.txt)
**Fetched:** 2026-05-02

The two products that fit our needs are surfaced from the docs index:

> **Unlocker API** — "Use the Bright Data Unlocker API to test and unlock websites in real time, bypassing anti-bot protections"
>
> **SERP API** — "Extract search engine results using Bright Data SERP API. Extract structured data from major search engines"
>
> **JavaScript SDK** — "Install and use the Bright Data JavaScript SDK to call scrapers, proxies, and Web Access APIs from Node.js applications"

---

## Source — Web Unlocker (article fetching)

**URL:** [docs.brightdata.com/api-reference/rest-api/unlocker/request.md](https://docs.brightdata.com/api-reference/rest-api/unlocker/request.md)
**Fetched:** 2026-05-02

### Endpoint and auth (verbatim from OpenAPI spec)

> Endpoint: `POST /unblocker/req` at `https://api.brightdata.com`
>
> Authorization: "Use your Bright Data API Key as a Bearer token in the Authorization header"

### Request body fields (verbatim from spec)

> Query parameter:
> - `zone` (required) — "The name of your Bright Data Unlocker zone"
>
> Request body:
> - `url`
> - `method`
> - `headers`
> - `body`
> - `country`
> - `webhook_url`
> - `webhook_method`
> - `webhook_data`

### Response shape (verbatim)

> Response object: `response_id`

### Pricing

**URL:** [brightdata.com/pricing/web-unlocker](https://brightdata.com/pricing/web-unlocker)

> Pay-as-you-go: **"$1.5/ 1K Results"** with "No commitment"
>
> Monthly commitment tiers: $1.30 to $1.00 per 1,000 results depending on volume.

---

## Source — SERP API (web search)

**URL:** [docs.brightdata.com/api-reference/rest-api/serp/request.md](https://docs.brightdata.com/api-reference/rest-api/serp/request.md)
**Fetched:** 2026-05-02

### Endpoint and auth (verbatim from OpenAPI spec)

> Endpoint: `POST /serp/req` at `https://api.brightdata.com`
>
> Authorization: "Use your Bright Data API Key as a Bearer token in the Authorization header"

### Request body (verbatim)

> Query parameter:
> - `zone` (required) — "The name of your Bright Data Unlocker zone"
>
> Request body:
> - `query` object with property `q` (the search term)
>
> Optional:
> - `brd_json` parameter for response format (enum: `json` or `html`)

### Response shape (verbatim)

> Response object: `response_id` — "Defines the job id"

### Pricing

Same product family — SERP API PAYG is **$1.50 per 1,000 successful requests** (per Bright Data pricing page).

---

## Source — Node.js SDK (`@brightdata/sdk`)

**URL:** [docs.brightdata.com/api-reference/SDK-JS.md](https://docs.brightdata.com/api-reference/SDK-JS.md)
**Fetched:** 2026-05-02

### Install (verbatim)

```bash
npm install @brightdata/sdk
```

### Client instantiation (verbatim)

```javascript
import { bdclient } from '@brightdata/sdk';

const client = new bdclient({
    apiKey: '[your_api_key_here]'
});
```

> The API key "can also be defined as `BRIGHTDATA_API_KEY` env variable."

### Scrape a URL

> *Note (2026-05-02 empirical): the docs page shows `client.scrape()` but the actual installed `@brightdata/sdk` exposes `client.scrapeUrl()`. Use the latter — verified working against Wikipedia + Reuters returning full markdown.*

```javascript
const result = await client.scrapeUrl('https://docs.brightdata.com/api-reference/SDK');
```

> `dataFormat` option choices: `"markdown"`, `"screenshot"`, or `"html"` (default).

### Search (verbatim)

```javascript
const result = await client.search('pizza restaurants');
```

> Search engine selection via `options.searchEngine` parameter — `"google"`, `"bing"`, or `"yandex"`.

---

## Source — Bright Data MCP server

**URL:** [github.com/brightdata/brightdata-mcp](https://github.com/brightdata/brightdata-mcp)
**Fetched:** 2026-05-02

### Package and run command (verbatim)

> Package: `@brightdata/mcp`
>
> Run: `npx @brightdata/mcp`

### Free tier (verbatim)

> "5,000 requests/month FREE"

### Configuration (verbatim, Claude Desktop example)

```json
{
  "mcpServers": {
    "Bright Data": {
      "command": "npx",
      "args": ["@brightdata/mcp"],
      "env": {
        "API_TOKEN": "your-token-here"
      }
    }
  }
}
```

### Advanced env vars (verbatim)

> `PRO_MODE`, `RATE_LIMIT`, `WEB_UNLOCKER_ZONE`, `BROWSER_ZONE`, `POLLING_TIMEOUT`

> Features: web search, markdown scraping, browser automation (Pro), 60+ specialized tools for e-commerce, social media, finance, and coding agents.

---
---

## MY PERCEPTION (clearly separated from source above)

Below this divider is *not* from Bright Data — it's my recommendation/interpretation. Treat the section above as canonical; this section is opinion.

### Recommended products for our two needs

| Need | Product | Why |
|---|---|---|
| (a) Fetch full article text from a source URL | **Web Unlocker** with `dataFormat: "markdown"` | Handles paywalls (some), JS render, anti-bot in one call. Markdown output drops in directly to the LLM context window. |
| (b) Web search for related context | **SERP API** | Parsed JSON results via `brd_json=json`. Same auth, same endpoint base, no separate billing setup. |

Both billed at **$1.50 / 1,000 successful requests** PAYG. One API key, one zone per product; the SDK auto-creates zones on first call.

### Wire it via the SDK, not raw HTTP

- The OpenAPI canonical paths are `/unblocker/req` and `/serp/req` (note: pricing pages and older blog posts often say `/request` — there's a doc/marketing inconsistency).
- The official SDK abstracts this. **Use `@brightdata/sdk`** — typed, auto-zones, fewer surprises.

### $100 budget breakdown

- $100 / $1.50 per 1k = **66,667 successful requests**.
- One full enrichment cycle = 1 search + 3-5 article fetches = **4-6 requests**.
- That gives us **~11,000 to 16,000 enrichment runs** — plenty of headroom for a hackathon weekend.
- Free MCP tier (5k/month) is *not* additive when calling via SDK — keep it as a fallback if we burn through credits.

### TS wrapper signatures to expose as DurableAgent tools

These are the `"use step"` functions the agent calls. Keep them tiny and pure so retries are safe.

```ts
// lib/brightdata.ts
import { bdclient } from '@brightdata/sdk';

const client = new bdclient({
  apiKey: process.env.BRIGHTDATA_API_KEY!,
  autoCreateZones: true, // REQUIRED on fresh accounts; SDK auto-creates sdk_unlocker / sdk_serp zones on first call
});

export type SearchResult = {
  title: string;
  url: string;
  snippet: string;
};

export async function fetchArticle(url: string): Promise<string> {
  "use step";
  const result = await client.scrapeUrl(url, { dataFormat: 'markdown' });
  return typeof result === 'string' ? result : result.body;
}

export async function searchWeb(query: string, limit = 10): Promise<SearchResult[]> {
  "use step";
  const result = await client.search(query, { searchEngine: 'google' });
  // SERP returns parsed JSON when brd_json=json is set under the hood
  return (result.organic ?? []).slice(0, limit).map((r: any) => ({
    title: r.title,
    url: r.link,
    snippet: r.description ?? '',
  }));
}
```

Then in the workflow:

```ts
import { DurableAgent } from "@workflow/ai/agent";
import { fetchArticle, searchWeb } from "./brightdata";

export async function enrichNewsItem(item: { title: string; description: string; url: string }) {
  "use workflow";
  const agent = new DurableAgent({
    model: "anthropic/claude-sonnet-4.6",
    instructions: "You are a financial news enrichment agent...",
    tools: { fetchArticle, searchWeb },
  });
  await agent.stream({ messages: [{ role: "user", content: JSON.stringify(item) }] });
}
```

### Caching strategy

**Skip caching for the hackathon.** Reasoning:
- Article URLs from CityFalcon are flagged once per impactful event — re-fetch rate is near zero.
- Search queries are LLM-generated and rarely repeat verbatim across runs.
- WDK already memoizes `"use step"` results within a single workflow run — that handles the only realistic dup case (agent calls the same tool twice in one trajectory).
- If we ship and notice repeat hits in observability, add Vercel KV with a 24h TTL keyed by `sha1(url)` for `fetchArticle` and `sha1(query)` for `searchWeb`. Five-line addition.

### Gotchas

- **Account-level prerequisite — payment method on file.** Even with $100 of trial credit, Bright Data refuses any zone-create call until a payment method is added. The error is misleading: the SDK throws `AuthenticationError("invalid API key or insufficient permissions")` but the underlying API response is `{"err_id":"payment_method_required"}`. Add any card in the dashboard before first SDK use. **Verified empirically 2026-05-02.**
- **Zone propagation delay (~2-3 min) after first creation.** First few `scrapeUrl` calls right after `autoCreateZones` succeeds may return HTTP 200 with an **empty body** — the proxy backend hasn't propagated the new zone credentials yet. The unlocker headers will say `proxy-status: ... received-status=407 ... Invalid authentication`. Wait ~2-3 min and retry; subsequent calls return full markdown.
- **`autoCreateZones: true` is required for fresh accounts** — without it the SDK looks for default zones (`sdk_unlocker`, `sdk_serp`) that don't exist and throws "invalid API key" without ever trying to create them.
- **Paywalls:** Web Unlocker bypasses bot detection but does NOT log into paywalled sites (WSJ, FT). Mark these in our domain registry and either drop the source, fall back to a free mirror, or accept title+description-only context for those items.
- **Premium-domain pricing:** Bright Data charges premium rates for some news sites (Bloomberg, Reuters, NYT, FT, WSJ). The exact list is **not on the public pricing page** — check the dashboard "Premium Domains" tab after signup. Budget could be up to 3-5× our base estimate if a news cycle hits Bloomberg-heavy.
- **JS-rendered news latency:** p50 for static pages ≈ 2-4s; p99 for JS-heavy sites with anti-bot ≈ 15-30s. Set the WDK step timeout to 60s, not the default. The durable runtime makes the long latency cheap (no compute charged while waiting).
- **Endpoint URL inconsistency:** Docs OpenAPI says `/unblocker/req` and `/serp/req`; pricing/blog pages say `/request`. Use the SDK and ignore both.

### What I couldn't verify

- **Premium-domain list for news sites** — only visible inside the Bright Data dashboard, not in public docs. Confirm in dashboard before committing to a source list.
- **Real p50/p99 latency on JS-rendered news** — Bright Data publishes "real-time" but no SLA numbers. Measure on day 1 with our actual top-10 sources.
- **Whether Web Scraper API has a news-specific dataset preset** — docs index shows generic dataset endpoints but no news-collection preset. Web Unlocker + markdown is the right primitive for arbitrary URLs anyway.
- **Exact `dataFormat: "markdown"` quality on JS-heavy financial sites** — needs an empirical pass against a sample of CityFalcon source URLs.
