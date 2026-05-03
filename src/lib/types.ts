// Types for AlphaRead — derived from verified live CityFalcon responses
// (2026-05-02 against https://api.cityfalcon.com/v0.2/stories) plus the
// agent + state schemas. See docs/cityfalcon_news_api_guide.md.

export type StorySource = {
  name: string;
  countryName?: string;
};

export type Story = {
  uuid: string;
  title: string;
  description: string;
  url: string;
  lang: string;
  source: StorySource;
  /** -100 (very negative) to +100 (very positive). Magnitude matters more than sign for "is this important". */
  sentiment: number;
  /** 0-100 — CityFalcon's quality/relevance score. */
  cityfalconScore: number;
  /** ISO 8601 UTC. */
  publishTime: string;
  paywall: boolean;
  registrationRequired: boolean;
  /** Number of other sources covering the same story — proxy for "the world cares". */
  duplicatesCount: number;
  /** Tags identifying the financial entities mentioned (tickers / asset identifiers). */
  assetTags: string[];
  searchTags?: string[];
  category?: string;
  imageUrls?: string[];
  cityfalcon_permalink?: string;
  additionalData?: Record<string, unknown>;
};

export type StoriesResponse = {
  stories: Story[];
};

// DCSC sector classification — for adjacent-company spillover analysis.
// Real response shape verified live against
// https://api.cityfalcon.com/dcsc/v0.1/portfolio_classification:
//   { companies: [...], summary: [...], relevant_sectors: [{...}] }
// The actual classification lives in `relevant_sectors`. The string `type`
// field is "Level 1" / "Level 2" / etc — analyst.ts parses it to a number.
export type SectorClassification = {
  name: string;
  slug: string;
  level: number;
  /** 1-100 */
  relevance?: number;
  /** 0-100 */
  confidence?: number;
};

export type DcscRelevantSector = {
  relevance: number;
  percentage_of_total?: number;
  /** "Level 1" | "Level 2" | "Level 3" | "Level 4" — string in the API. */
  type: string;
  name: string;
  slug: string;
  companies?: Array<{ slug: string; relevance: number; confidence: number }>;
};

export type PortfolioClassificationResponse = {
  companies?: unknown[];
  summary?: unknown[];
  relevant_sectors?: DcscRelevantSector[];
};

export type AdjacentCompany = {
  name: string;
  ticker?: string;
  allocation?: number;
  relevance?: number;
  confidence?: number;
};

export type SmartPortfolioResponse = {
  portfolio?: AdjacentCompany[];
};

// ----------------------- Agent outputs ----------------------------

/** Pre-check verdict: how seriously to take this story. */
export type Verdict = "skip" | "watch" | "deep";

export type JudgeResult = {
  verdict: Verdict;
  /** 1-2 sentence rationale shown in UI. */
  reason: string;
  /** 0-100. */
  confidence: number;
  /** Optional hints to the deep analyst about *why* this might matter long-term. */
  longTermAngles?: string[];
};

// ----------------------- Central state ----------------------------

/** Slim story projection — what the UI actually needs. Full Story is too heavy. */
export type SlimStory = {
  uuid: string;
  title: string;
  description: string;
  url: string;
  source: string;
  sentiment: number;
  cityfalconScore: number;
  duplicatesCount: number;
  publishTime: string;
  assetTags: string[];
};

export function toSlim(s: Story): SlimStory {
  return {
    uuid: s.uuid,
    title: s.title,
    description: s.description,
    url: s.url,
    source: s.source.name,
    sentiment: s.sentiment,
    cityfalconScore: s.cityfalconScore,
    duplicatesCount: s.duplicatesCount,
    publishTime: s.publishTime,
    assetTags: s.assetTags,
  };
}

export type Status = "new" | "judged" | "analyzing" | "analyzed" | "merged" | "skipped";

// Structured output from the Deep Analyst (Claude Sonnet 4.6).
export type AnalysisResult = {
  oneLineSummary: string;
  magnitude: "small" | "material" | "major";
  longTermHorizon: "days" | "weeks" | "months" | "quarters" | "years";
  primaryCompany: {
    ticker: string;
    direction: "bullish" | "bearish" | "neutral";
    rationale: string;
    sizingContext: string;
  };
  spillover: Array<{
    sector: string;
    direction: "bullish" | "bearish" | "neutral";
    rationale: string;
    candidateTickers: string[];
  }>;
  signalVsNoise: {
    marketIsMissing: string[];
    marketIsOverreacting: string[];
  };
  watchFlags: Array<{
    flag: string;
    horizon: "hours" | "days" | "weeks" | "months";
  }>;
};

/** Context the Deep Analyst gathered before the LLM call — useful for the
 * per-event page (related coverage list, sector classification, adjacent
 * companies) so we don't re-fetch on every render. */
export type EnrichmentBundle = {
  similarStories: Array<{
    title: string;
    source: string;
    uuid: string;
    url: string;
    publishTime: string;
  }>;
  sectors: Array<{ name: string; slug: string; level: number }>;
  adjacentCompanies: Array<{ name: string; ticker?: string; sector: string }>;
};

export type StoryState = {
  story: SlimStory;
  status: Status;
  verdict?: JudgeResult;
  /** Populated when the Deep Analyst step completes. */
  analysis?: AnalysisResult;
  /** Captured by the Deep Analyst for surfacing on the per-event page. */
  enrichment?: EnrichmentBundle;
  firstSeen: string;
  lastUpdated: string;
};

/** A single event entry on the activity feed. */
export type ActivityEvent = {
  id: string;            // unique per event (uuid:status timestamp)
  uuid: string;          // story uuid
  ticker?: string;       // primary ticker if known
  /** News headline — populated for "new" events that don't have a verdict
   * reason yet. Lets the dashboard show a meaningful line instead of a
   * truncated uuid. Verdict reason still wins when present. */
  title?: string;
  status: Status;
  verdict?: Verdict;
  reason?: string;
  at: string;            // ISO timestamp
};

// ----------------------- API responses ----------------------------

export type PollResult = {
  checkedTickers: number;
  totalStories: number;
  /** Tickers whose CityFalcon fetch failed (e.g. coverage gaps). Logged but not fatal. */
  failedTickers: string[];
  verdicts: {
    skip: number;
    watch: number;
    deep: number;
  };
  /** Slimmed deep verdicts so the route can return them directly. */
  deepStories: Array<{
    story: SlimStory;
    judge: JudgeResult;
  }>;
};
