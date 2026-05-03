// Typed wrappers around the verified CityFalcon endpoints used by the AlphaRead
// agent. Each function is a `"use step"` so WDK retries on transient failures
// (network, 5xx). Auth via the `access_token` query param (verified empirically
// 2026-05-02; see docs/cityfalcon_news_api_guide.md).

import type {
  PollResult,
  PortfolioClassificationResponse,
  SmartPortfolioResponse,
  StoriesResponse,
  Story,
} from "./types";

const CF_BASE = "https://api.cityfalcon.com/v0.2";
const DCSC_BASE = "https://api.cityfalcon.com/dcsc/v0.1";

function getKey(): string {
  const k = process.env.CITYFALCON_API_KEY;
  if (!k) throw new Error("CITYFALCON_API_KEY missing in env");
  return k;
}

type ParamValue = string | number | boolean | undefined;

async function cfFetch<T>(
  base: string,
  path: string,
  params: Record<string, ParamValue>,
): Promise<T> {
  const url = new URL(`${base}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    url.searchParams.set(k, String(v));
  }
  url.searchParams.set("access_token", getKey());
  const res = await fetch(url.toString(), {
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    // Don't log url (contains key) — log path + status only.
    throw new Error(`CityFalcon ${path} HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ---------- /stories ----------

type StoriesOpts = {
  limit?: number;
  /** "h1" / "d1" / "w1" / "m1" — last hour / day / week / month. */
  timeFilter?: "h1" | "d1" | "w1" | "m1";
  /** "mp" = major publications (recommended); "all" = include long tail. */
  categories?: "mp" | "all";
  withSentiment?: boolean;
};

export async function getStoriesForTicker(
  ticker: string,
  opts: StoriesOpts = {},
): Promise<Story[]> {
  "use step";
  const r = await cfFetch<StoriesResponse>(CF_BASE, "/stories", {
    // CityFalcon's `full_tickers` scheme (e.g. "MSFT-US") is the only one that
    // works reliably across mega-caps; "assets" gives sporadic 422s.
    identifier_type: "full_tickers",
    identifiers: ticker,
    categories: opts.categories ?? "mp",
    time_filter: opts.timeFilter ?? "d1",
    order_by: "latest",
    with_sentiment: opts.withSentiment ?? true,
    limit: opts.limit ?? 20,
  });
  return r.stories ?? [];
}

// ---------- /stories/{uuid}/similar_stories ----------

export async function getSimilarStories(
  uuid: string,
  limit = 5,
): Promise<Story[]> {
  "use step";
  const r = await cfFetch<StoriesResponse>(
    CF_BASE,
    `/stories/${encodeURIComponent(uuid)}/similar_stories`,
    { limit },
  );
  return r.stories ?? [];
}

// ---------- /services/sentiment ----------

export async function getEntitySentiment(
  identifiers: string,
  period: "d1" | "w1" | "m1" = "d1",
): Promise<unknown> {
  "use step";
  return cfFetch<unknown>(CF_BASE, "/services/sentiment", {
    identifier_type: "topic_classes",
    identifiers,
    period,
    average_for_period: true,
    statistics_for_period: true,
  });
}

// ---------- DCSC: ticker -> sectors ----------

export async function getSectorClassification(
  ticker: string,
): Promise<PortfolioClassificationResponse> {
  "use step";
  // identifier_type MUST be "full_ticker" (singular) for the TICKER-US format
  // we use elsewhere. "ticker" (plain) accepts only bare exchange-ambiguous
  // symbols like "BA" — verified empirically returns Bangkok Airways for "BA".
  return cfFetch<PortfolioClassificationResponse>(
    DCSC_BASE,
    "/portfolio_classification",
    {
      identifiers: ticker,
      identifier_type: "full_ticker",
      min_relevance: 30,
      min_confidence: 30,
      show_missing_sectors: false,
    },
  );
}

// ---------- DCSC: sector -> adjacent companies ----------

export async function getCompaniesForSector(
  slugs: string,
  level: number,
  opts: { maxSecurities?: number; minRelevance?: number; minConfidence?: number } = {},
): Promise<SmartPortfolioResponse> {
  "use step";
  return cfFetch<SmartPortfolioResponse>(DCSC_BASE, "/smart_portfolio", {
    level,
    slugs,
    max_securities: opts.maxSecurities ?? 10,
    min_relevance: opts.minRelevance ?? 30,
    min_confidence: opts.minConfidence ?? 30,
    company_type: "public",
    countries: "all",
    allocation_type: "relevance",
  });
}

// Re-export PollResult here for convenience of API route consumers.
export type { PollResult };
