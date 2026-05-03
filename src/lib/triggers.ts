// pollWatchlistOnce — durable workflow that fans out per-ticker fetches,
// dedupes against KV, runs the Pre-check Agent on each story, writes
// verdicts back to KV, and returns a verdict-grouped summary.
//
// SPRINT 10 architecture change: state R/W happens via direct dynamic
// import of `./state` from inside `"use step"` bodies (which run in Node
// runtime where the redis client works). Earlier we used an HTTP bridge
// to /api/state/* routes because the WORKFLOW runtime can't load redis,
// but step bodies can. The HTTP bridge had silent-failure modes (no
// r.ok check) that we believe were dropping the analyser's
// post-analysis upserts, leaving Microsoft/Merck-style "ghost analyzed"
// rows visible to state.get but invisible to listAll.
//
// The HTTP routes (/api/state/upsert, /api/state/has-uuid,
// /api/state/orphans) remain available for any external caller and as
// a fallback path, but the workflow no longer uses them.

import { analyzeNewsImpact } from "./analyst";
import { getStoriesForTicker } from "./cityfalcon";
import { judgeStory } from "./judge";
import { toSlim } from "./types";
import type {
  AnalysisResult,
  EnrichmentBundle,
  JudgeResult,
  PollResult,
  SlimStory,
  Status,
  Story,
  StoryState,
} from "./types";
import { WATCHLIST } from "./watchlist";

function baseUrl(): string {
  // Use the canonical production domain (alpharead.vercel.app) when on Vercel.
  // The per-deploy URL (VERCEL_URL) has Deployment Protection that returns an
  // HTML login page on auth-walled requests, breaking fetch -> JSON.parse.
  const explicit = process.env.NEXT_PUBLIC_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const prodUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (prodUrl) return `https://${prodUrl}`;
  const v = process.env.VERCEL_URL;
  if (v) return `https://${v}`;
  return "http://localhost:3000";
}

// "use step" wrappers: fetch from inside workflow context is forbidden, but
// step functions run in regular Node runtime where global fetch is available.

/** Fetch deep-verdict stories that don't have analysis yet, via the
 * HTTP-bridge route (workflow runtime can't import redis directly). */
async function fetchOrphans(): Promise<Array<{ uuid: string; slim: SlimStory; verdict: JudgeResult }>> {
  "use step";
  // Direct state import.
  const { state } = await import("./state");
  const xs = await state.listDeepOrphans();
  return xs.map((s) => ({
    uuid: s.story.uuid,
    slim: s.story,
    verdict: s.verdict!,
  }));
}

/** Reconstruct a minimal Story from SlimStory so analyzeAndRecord (which
 * takes a Story) can run on an orphan. The CityFalcon enrichment in the
 * analyser only reads assetTags + uuid + title + description anyway. */
function reconstructStory(slim: SlimStory): Story {
  return {
    uuid: slim.uuid,
    title: slim.title,
    description: slim.description,
    url: slim.url,
    lang: "en",
    source: { name: slim.source },
    sentiment: slim.sentiment,
    cityfalconScore: slim.cityfalconScore,
    publishTime: slim.publishTime,
    paywall: false,
    registrationRequired: false,
    duplicatesCount: slim.duplicatesCount,
    assetTags: slim.assetTags,
  };
}

async function analyzeOrphan(o: { uuid: string; slim: SlimStory; verdict: JudgeResult }): Promise<void> {
  "use step";
  const story = reconstructStory(o.slim);
  await analyzeAndRecord(story);
}

async function bulkHasUuid(uuids: string[]): Promise<boolean[]> {
  "use step";
  if (uuids.length === 0) return [];
  // Direct state import — step body runs in Node runtime so redis loads.
  const { state } = await import("./state");
  return Promise.all(uuids.map((u) => state.hasUuid(u)));
}

async function upsertState(
  uuid: string,
  patch: {
    story?: SlimStory;
    status?: Status;
    verdict?: JudgeResult;
    analysis?: AnalysisResult;
    enrichment?: EnrichmentBundle;
  },
): Promise<void> {
  "use step";
  // Direct state import — eliminates the HTTP-bridge silent-failure mode
  // that we believe was dropping analyser writes (Microsoft/Merck pattern).
  const { state } = await import("./state");
  const result = await state.upsert(uuid, patch);
  console.log("[upsertState] direct", {
    uuid,
    patchKeys: Object.keys(patch),
    finalStatus: result?.status ?? null,
    finalVerdict: result?.verdict?.verdict ?? null,
    finalHasAnalysis: Boolean(result?.analysis),
  });
}

/** For each deep verdict: run the Deep Analyst, then write the analysis +
 * enrichment back to state. The enrichment is stored alongside the analysis
 * so the per-event page can render related coverage and adjacent companies
 * without re-fetching CityFalcon on every render. */
async function analyzeAndRecord(story: Story): Promise<void> {
  "use step";
  const t0 = Date.now();
  console.log("[analyze] start", { uuid: story.uuid, ticker: story.assetTags[0] });
  try {
    await upsertState(story.uuid, { status: "analyzing" });
    const { analysis, enrichment } = await analyzeNewsImpact(story);
    await upsertState(story.uuid, { status: "analyzed", analysis, enrichment });
    console.log("[analyze] done", {
      uuid: story.uuid,
      ms: Date.now() - t0,
      magnitude: analysis.magnitude,
    });
  } catch (e) {
    // Don't crash the workflow on a single analysis failure.
    const error = e instanceof Error ? e.message : String(e);
    console.error("[analyze] error", { uuid: story.uuid, ms: Date.now() - t0, error });
    await upsertState(story.uuid, { status: "judged" });
  }
}

export type PollOptions = {
  tickers?: readonly string[];
  /** "h1" / "d1" / "w1" / "m1" — defaults to "d1" (last 24h). */
  timeFilter?: "h1" | "d1" | "w1" | "m1";
  /** Concurrency cap for the per-story judge fan-out. */
  judgeConcurrency?: number;
};

/**
 * Sequential chunks, parallel within chunk. Deterministic step order — safe
 * inside a `"use workflow"` function. The previous worker-pool pattern with a
 * shared mutable index counter (`let i = 0; i++`) violated WDK's deterministic
 * replay requirements and crashed every poll with
 * "uncommitted operation(s)... corrupted event log". chunk.map() preserves
 * input order, so the event log sees N step starts and N completions in the
 * exact same order on every replay.
 */
async function chunkedAll<T, R>(
  items: T[],
  chunkSize: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    const results = await Promise.all(chunk.map(fn));
    out.push(...results);
  }
  return out;
}

/**
 * Judge a story AND persist the verdict to state, all inside one chunked
 * fan-out. Removes the prior sequential post-judge state-update loop that
 * was the dashboard bottleneck — the analyser fan-out used to wait minutes
 * for ~290 sequential upsertState calls before it could even start. Now
 * each judge writes its own state in parallel with siblings inside the
 * chunk, and the analyser fan-out begins right after the last chunk lands.
 */
async function judgeAndPersist(story: Story): Promise<{
  story: Story;
  judge: JudgeResult;
  isDeep: boolean;
  error?: string;
}> {
  try {
    const judge = await judgeStory(story);
    await upsertState(story.uuid, {
      story: toSlim(story),
      status: judge.verdict === "skip" ? "skipped" : "judged",
      verdict: judge,
    });
    return { story, judge, isDeep: judge.verdict === "deep" };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error("[judge] error", { uuid: story.uuid, error });
    const fallback: JudgeResult = { verdict: "skip", reason: "judge error", confidence: 0 };
    await upsertState(story.uuid, {
      story: toSlim(story),
      status: "skipped",
      verdict: fallback,
    });
    return { story, judge: fallback, isDeep: false, error };
  }
}

export async function pollWatchlistOnce(opts: PollOptions = {}): Promise<PollResult> {
  "use workflow";
  const tickers = opts.tickers ?? WATCHLIST;
  const concurrency = opts.judgeConcurrency ?? 8;
  const timeFilter = opts.timeFilter ?? "d1";

  // Step 0: recover orphaned deep verdicts — stories judged "deep" in a
  // prior poll that never had their analyser step complete. They'd otherwise
  // stay orphans forever because dedup excludes them. Capped at 20 per run
  // so a backlog can't blow the workflow's maxDuration.
  const tOrphanStart = Date.now();
  const orphans = await fetchOrphans();
  const orphanBatch = orphans.slice(0, 20);
  console.log("[workflow] orphan-recovery", {
    found: orphans.length,
    processing: orphanBatch.length,
  });
  if (orphanBatch.length > 0) {
    await chunkedAll(orphanBatch, 3, analyzeOrphan);
    console.log("[workflow] orphan-recovery done", { ms: Date.now() - tOrphanStart });
  }

  // Step 1: fan-out fetch (allSettled — coverage gaps don't kill the poll).
  const tFetchStart = Date.now();
  const perTicker = await Promise.allSettled(
    tickers.map((t) => getStoriesForTicker(t, { timeFilter })),
  );
  console.log("[workflow] fetch", { ms: Date.now() - tFetchStart, tickers: tickers.length });

  // Step 2: flatten + dedupe by uuid (within this run).
  const seenInRun = new Set<string>();
  const candidates: Story[] = [];
  const failedTickers: string[] = [];
  for (let idx = 0; idx < perTicker.length; idx++) {
    const r = perTicker[idx];
    if (r.status === "rejected") {
      failedTickers.push(tickers[idx]);
      continue;
    }
    for (const s of r.value) {
      if (seenInRun.has(s.uuid)) continue;
      seenInRun.add(s.uuid);
      candidates.push(s);
    }
  }

  // Diagnostic: how many stories CityFalcon returned (after in-run dedup).
  console.log("[workflow] fetch-stats", {
    candidates: candidates.length,
    failedTickers: failedTickers.length,
  });

  // Step 3: KV-side dedup (drop stories already known across runs/instances).
  const knownFlags = await bulkHasUuid(candidates.map((s) => s.uuid));
  const fresh: Story[] = candidates.filter((_s, i) => !knownFlags[i]);

  // Diagnostic: how many were filtered out by the KV-side dedup.
  // If candidates>0 and fresh=0, dedup ate everything (all already judged).
  // If candidates=0, the fetch returned no stories.
  console.log("[workflow] dedup-stats", {
    candidates: candidates.length,
    knownInKv: knownFlags.filter(Boolean).length,
    fresh: fresh.length,
  });

  // Step 4: register fresh stories as "new" in KV up front (so dashboard
  // can show them flowing in even before judging completes).
  const tRegisterStart = Date.now();
  await Promise.all(fresh.map((s) => upsertState(s.uuid, { story: toSlim(s), status: "new" })));
  console.log("[workflow] register-new", { ms: Date.now() - tRegisterStart, count: fresh.length });

  // Step 5: judge AND persist verdict in one chunked fan-out. The previous
  // version had a separate sequential post-judge state-update loop (Step 6)
  // that took ~90s for 290 stories and blocked the analyser fan-out from
  // even starting. judgeAndPersist now writes its own state in parallel
  // inside each chunk, so analyses begin almost immediately after judges.
  const tJudgeStart = Date.now();
  const judged = await chunkedAll(fresh, concurrency, judgeAndPersist);
  console.log("[workflow] judges", { ms: Date.now() - tJudgeStart, count: judged.length });

  const counts: Record<"skip" | "watch" | "deep", number> = { skip: 0, watch: 0, deep: 0 };
  const deepStories: Array<{ story: SlimStory; judge: JudgeResult }> = [];
  const deepRaw: Story[] = [];
  for (const j of judged) {
    counts[j.judge.verdict]++;
    if (j.isDeep) {
      deepStories.push({ story: toSlim(j.story), judge: j.judge });
      deepRaw.push(j.story);
    }
  }
  console.log("[workflow] verdicts", counts);

  // Step 6: Deep Analyst fan-out — chunked Promise.all (concurrency 3).
  // Each story's analyzeAndRecord is "use step"; chunk.map keeps the
  // deterministic ordering WDK requires.
  const analysisConcurrency = 3;
  const tAnalyzeStart = Date.now();
  await chunkedAll(deepRaw, analysisConcurrency, analyzeAndRecord);
  console.log("[workflow] analyzers", { ms: Date.now() - tAnalyzeStart, count: deepRaw.length });

  return {
    checkedTickers: tickers.length,
    totalStories: fresh.length,
    failedTickers,
    verdicts: counts,
    deepStories,
  };
}
