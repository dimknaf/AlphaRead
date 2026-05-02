// Central state for the AlphaRead dashboard, backed by Vercel Marketplace
// Redis (Upstash). Shared across serverless instances — the dashboard
// (/api/state) sees what the workflow (pollWatchlistOnce) writes regardless
// of which serverless instance handles each request.
//
// Storage layout:
//   alpharead:stories  (Redis hash)  field=uuid  value=JSON of StoryState
//   alpharead:events   (Redis list)  newest first, capped at 500 (LTRIM)
//
// Connection model: a per-process singleton client connected lazily on the
// first call, kept warm across invocations on the same serverless instance.

// Lazy import of `redis` — the WDK workflow runtime is Edge-like (no Node
// `Buffer` global) so `redis` cannot be top-level imported. State methods
// are called from inside "use step" boundaries that run in Node runtime
// (where Buffer exists), so dynamic `import("redis")` works at call time.

import type {
  ActivityEvent,
  AnalysisResult,
  JudgeResult,
  SlimStory,
  Status,
  StoryState,
} from "./types";

const STORIES_KEY = "alpharead:stories";
const EVENTS_KEY = "alpharead:events";
const MAX_EVENTS = 500;

// Use unknown for the cached client type so we don't have to import the
// redis types at module load (they'd pull the same Buffer-needing code).
let clientPromise: Promise<unknown> | null = null;

async function getClient(): Promise<{
  hGet(key: string, field: string): Promise<string | null>;
  hSet(key: string, field: string, value: string): Promise<number>;
  hExists(key: string, field: string): Promise<boolean>;
  hGetAll(key: string): Promise<Record<string, string>>;
  lPush(key: string, value: string): Promise<number>;
  lRange(key: string, start: number, stop: number): Promise<string[]>;
  lTrim(key: string, start: number, stop: number): Promise<string>;
  del(key: string): Promise<number>;
}> {
  if (!clientPromise) {
    const url = process.env.REDIS_URL;
    if (!url) throw new Error("REDIS_URL not set in env (connect a Vercel Marketplace Redis store)");
    clientPromise = (async () => {
      const { createClient } = await import("redis");
      const c = createClient({ url });
      c.on("error", (err) => {
        console.error("[state] Redis error", err);
      });
      await c.connect();
      return c;
    })();
  }
  // The any-cast is bounded by the structural type returned by getClient.
  return clientPromise as Promise<ReturnType<typeof getClient> extends Promise<infer T> ? T : never>;
}

class CentralStateImpl {
  /** Insert or update a story's state. Records an activity event. */
  async upsert(uuid: string, patch: Partial<StoryState> & { story?: SlimStory }): Promise<StoryState | null> {
    const c = await getClient();
    const now = new Date().toISOString();
    const existingRaw = await c.hGet(STORIES_KEY, uuid);
    const existing: StoryState | null = existingRaw ? (JSON.parse(existingRaw) as StoryState) : null;
    // Refuse to create a brand-new state without a story — that produces
    // corrupt entries (story:undefined) that crash every dashboard read.
    // This can happen during workflow retries when an analyzer step replays
    // for a uuid whose state was never properly created in this run.
    if (!existing && !patch.story) {
      console.error("[state.upsert] refusing to create story-less entry", { uuid, patch });
      return null;
    }
    const next: StoryState = existing
      ? { ...existing, ...patch, lastUpdated: now }
      : {
          story: patch.story as SlimStory,
          status: patch.status ?? "new",
          verdict: patch.verdict,
          firstSeen: now,
          lastUpdated: now,
        };
    await c.hSet(STORIES_KEY, uuid, JSON.stringify(next));

    const ev: ActivityEvent = {
      id: `${next.story.uuid}:${next.status}:${now}`,
      uuid: next.story.uuid,
      ticker: next.story.assetTags[0],
      status: next.status,
      verdict: next.verdict?.verdict,
      reason: next.verdict?.reason,
      at: now,
    };
    await c.lPush(EVENTS_KEY, JSON.stringify(ev));
    await c.lTrim(EVENTS_KEY, 0, MAX_EVENTS - 1);

    return next;
  }

  /**
   * "Has been judged" check used by the workflow's dedup pass. Returns true
   * only if the story exists AND already has a verdict — stories registered
   * as "new" by a previous run that never got judged will return false so
   * the next poll picks them back up. Without this, any uuid registered as
   * "new" in a half-finished workflow stayed undead forever (the hExists
   * check alone treated registration as judgment).
   */
  async hasUuid(uuid: string): Promise<boolean> {
    const c = await getClient();
    const raw = await c.hGet(STORIES_KEY, uuid);
    if (!raw) return false;
    try {
      const s = JSON.parse(raw) as StoryState;
      return Boolean(s.verdict);
    } catch {
      return false;
    }
  }

  async get(uuid: string): Promise<StoryState | null> {
    const c = await getClient();
    const raw = await c.hGet(STORIES_KEY, uuid);
    return raw ? (JSON.parse(raw) as StoryState) : null;
  }

  /**
   * List all story states, defensively skipping entries that are unparseable
   * or missing the `story` field. Earlier workflow crash-and-retry races left
   * a few half-written entries in Redis (`story: undefined`); without this
   * filter, any `/api/state` projection that touches `s.story.assetTags`
   * crashes the whole dashboard.
   */
  async listAll(): Promise<StoryState[]> {
    const c = await getClient();
    const all = await c.hGetAll(STORIES_KEY);
    const out: StoryState[] = [];
    for (const v of Object.values(all)) {
      try {
        const s = JSON.parse(v) as StoryState;
        if (s && s.story && typeof s.story.uuid === "string") {
          out.push(s);
        }
      } catch {
        // skip — corrupt JSON entry
      }
    }
    return out;
  }

  async listByVerdict(verdict: JudgeResult["verdict"]): Promise<StoryState[]> {
    const xs = await this.listAll();
    return xs.filter((s) => s.verdict?.verdict === verdict);
  }

  // -------- Dashboard section projections --------

  async sectionActivityFeed(limit = 100): Promise<ActivityEvent[]> {
    const c = await getClient();
    const slice = await c.lRange(EVENTS_KEY, 0, limit - 1);
    return slice.map((s) => JSON.parse(s) as ActivityEvent);
  }

  async sectionTopStories(limit = 10): Promise<Array<{
    story: SlimStory;
    verdict: JudgeResult;
    analysis?: AnalysisResult;
    status: Status;
    lastUpdated: string;
  }>> {
    const deep = await this.listByVerdict("deep");
    return deep
      .map((s) => ({
        story: s.story,
        verdict: s.verdict!,
        analysis: s.analysis,
        status: s.status,
        lastUpdated: s.lastUpdated,
        rank:
          (s.verdict!.confidence / 100) *
          Math.exp(-(Date.now() - new Date(s.lastUpdated).getTime()) / (24 * 3600 * 1000)),
      }))
      .sort((a, b) => b.rank - a.rank)
      .slice(0, limit)
      .map(({ rank: _r, ...rest }) => rest);
  }

  async sectionSectorWatch(): Promise<Array<{ ticker: string; count: number }>> {
    const since = Date.now() - 24 * 3600 * 1000;
    const counts = new Map<string, number>();
    for (const s of await this.listByVerdict("deep")) {
      if (new Date(s.lastUpdated).getTime() < since) continue;
      const t = s.story.assetTags[0] ?? "unknown";
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([ticker, count]) => ({ ticker, count }))
      .sort((a, b) => b.count - a.count);
  }

  async sectionCompaniesUnderWatch(tickers: readonly string[]): Promise<Array<{
    ticker: string;
    lastImpactAt?: string;
    lastVerdict?: JudgeResult["verdict"];
  }>> {
    const all = await this.listAll();
    return tickers.map((ticker) => {
      const matches = all.filter((s) => s.story.assetTags.includes(ticker));
      if (matches.length === 0) return { ticker };
      const latest = matches.sort(
        (a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime(),
      )[0];
      return {
        ticker,
        lastImpactAt: latest.lastUpdated,
        lastVerdict: latest.verdict?.verdict,
      };
    });
  }

  // -------- Insight projections (analysed stories only) --------

  /** All stories whose Deep Analyst step has produced an analysis. */
  private async listAnalysed(): Promise<StoryState[]> {
    const xs = await this.listAll();
    return xs.filter((s): s is StoryState & { analysis: AnalysisResult } => Boolean(s.analysis));
  }

  async sectionMagnitudeMix(): Promise<{ small: number; material: number; major: number }> {
    const xs = await this.listAnalysed();
    const out = { small: 0, material: 0, major: 0 };
    for (const s of xs) out[s.analysis!.magnitude]++;
    return out;
  }

  async sectionDirectionMix(): Promise<{ bullish: number; bearish: number; neutral: number }> {
    const xs = await this.listAnalysed();
    const out = { bullish: 0, bearish: 0, neutral: 0 };
    for (const s of xs) out[s.analysis!.primaryCompany.direction]++;
    return out;
  }

  async sectionHorizonMix(): Promise<Record<"days" | "weeks" | "months" | "quarters" | "years", number>> {
    const xs = await this.listAnalysed();
    const out = { days: 0, weeks: 0, months: 0, quarters: 0, years: 0 };
    for (const s of xs) out[s.analysis!.longTermHorizon]++;
    return out;
  }

  async sectionHotTickers(limit = 10): Promise<Array<{ ticker: string; weight: number; appearances: number }>> {
    const xs = await this.listAnalysed();
    const wByMag = { small: 1, material: 3, major: 8 } as const;
    const acc = new Map<string, { weight: number; appearances: number }>();
    const bump = (t: string, w: number) => {
      if (!t) return;
      const cur = acc.get(t) ?? { weight: 0, appearances: 0 };
      cur.weight += w;
      cur.appearances++;
      acc.set(t, cur);
    };
    for (const s of xs) {
      const w = wByMag[s.analysis!.magnitude];
      bump(s.analysis!.primaryCompany.ticker, w);
      for (const sp of s.analysis!.spillover) {
        for (const t of sp.candidateTickers) bump(t, w * 0.5);
      }
    }
    return Array.from(acc.entries())
      .map(([ticker, v]) => ({ ticker, weight: Math.round(v.weight * 10) / 10, appearances: v.appearances }))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, limit);
  }

  async sectionMarketIsMissingDigest(limit = 12): Promise<Array<{
    insight: string;
    ticker: string;
    uuid: string;
    at: string;
  }>> {
    const xs = (await this.listAnalysed()).sort(
      (a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime(),
    );
    const out: Array<{ insight: string; ticker: string; uuid: string; at: string }> = [];
    for (const s of xs) {
      for (const m of s.analysis!.signalVsNoise.marketIsMissing) {
        out.push({
          insight: m,
          ticker: s.analysis!.primaryCompany.ticker || s.story.assetTags[0] || "",
          uuid: s.story.uuid,
          at: s.lastUpdated,
        });
        if (out.length >= limit) return out;
      }
    }
    return out;
  }

  async sectionWatchFlagDigest(limit = 18): Promise<Array<{
    flag: string;
    horizon: "hours" | "days" | "weeks" | "months";
    ticker: string;
    uuid: string;
    at: string;
  }>> {
    const xs = (await this.listAnalysed()).sort(
      (a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime(),
    );
    const out: Array<{
      flag: string;
      horizon: "hours" | "days" | "weeks" | "months";
      ticker: string;
      uuid: string;
      at: string;
    }> = [];
    for (const s of xs) {
      for (const wf of s.analysis!.watchFlags) {
        out.push({
          flag: wf.flag,
          horizon: wf.horizon,
          ticker: s.analysis!.primaryCompany.ticker || s.story.assetTags[0] || "",
          uuid: s.story.uuid,
          at: s.lastUpdated,
        });
        if (out.length >= limit) return out;
      }
    }
    return out;
  }

  async summary(): Promise<{
    total: number;
    byStatus: Record<Status, number>;
    byVerdict: Record<"skip" | "watch" | "deep", number>;
  }> {
    const all = await this.listAll();
    const byStatus: Record<Status, number> = {
      new: 0, judged: 0, analyzing: 0, analyzed: 0, merged: 0, skipped: 0,
    };
    const byVerdict: Record<"skip" | "watch" | "deep", number> = { skip: 0, watch: 0, deep: 0 };
    for (const s of all) {
      byStatus[s.status]++;
      if (s.verdict) byVerdict[s.verdict.verdict]++;
    }
    return { total: all.length, byStatus, byVerdict };
  }

  /** Optional: wipe everything (for testing or a "reset" button). */
  async clear(): Promise<void> {
    const c = await getClient();
    await Promise.all([c.del(STORIES_KEY), c.del(EVENTS_KEY)]);
  }
}

export const state = new CentralStateImpl();
