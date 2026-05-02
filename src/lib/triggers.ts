// pollWatchlistOnce — durable workflow that fans out per-ticker fetches,
// dedupes against KV via HTTP (workflow runtime can't import redis directly),
// runs the Pre-check Agent on each story, writes verdicts back to KV via
// HTTP, and returns a verdict-grouped summary.
//
// State R/W is done via fetch() to /api/state/upsert and /api/state/has-uuid
// because the WDK workflow runtime is Edge-like (no Node Buffer global) and
// can't load the `redis` package. Those API routes run in Node runtime where
// redis works fine.

import { analyzeNewsImpact } from "./analyst";
import { getStoriesForTicker } from "./cityfalcon";
import { judgeStory } from "./judge";
import { toSlim } from "./types";
import type { AnalysisResult, JudgeResult, PollResult, SlimStory, Status, Story } from "./types";
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

async function bulkHasUuid(uuids: string[]): Promise<boolean[]> {
  "use step";
  if (uuids.length === 0) return [];
  const r = await fetch(`${baseUrl()}/api/state/has-uuid`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uuids }),
  });
  const j = (await r.json()) as { ok: boolean; flags?: boolean[] };
  return j.flags ?? uuids.map(() => false);
}

async function upsertState(
  uuid: string,
  patch: { story?: SlimStory; status?: Status; verdict?: JudgeResult; analysis?: AnalysisResult },
): Promise<void> {
  "use step";
  await fetch(`${baseUrl()}/api/state/upsert`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uuid, ...patch }),
  });
}

/** For each deep verdict: run the Deep Analyst, then write the analysis to state. */
async function analyzeAndRecord(story: Story): Promise<void> {
  "use step";
  const t0 = Date.now();
  console.log("[analyze] start", { uuid: story.uuid, ticker: story.assetTags[0] });
  try {
    await upsertState(story.uuid, { status: "analyzing" });
    const analysis = await analyzeNewsImpact(story);
    await upsertState(story.uuid, { status: "analyzed", analysis });
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

/** Wrap judgeStory with a fallback so one Gateway hiccup doesn't fail the chunk. */
async function judgeOrFallback(story: Story): Promise<{
  story: Story;
  judge: JudgeResult;
  error?: string;
}> {
  try {
    const judge = await judgeStory(story);
    return { story, judge };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error("[judge] error", { uuid: story.uuid, error });
    return {
      story,
      judge: { verdict: "skip", reason: "judge error", confidence: 0 },
      error,
    };
  }
}

export async function pollWatchlistOnce(opts: PollOptions = {}): Promise<PollResult> {
  "use workflow";
  const tickers = opts.tickers ?? WATCHLIST;
  const concurrency = opts.judgeConcurrency ?? 8;
  const timeFilter = opts.timeFilter ?? "d1";

  // Step 1: fan-out fetch (allSettled — coverage gaps don't kill the poll).
  const perTicker = await Promise.allSettled(
    tickers.map((t) => getStoriesForTicker(t, { timeFilter })),
  );

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

  // Step 3: KV-side dedup (drop stories already known across runs/instances).
  const knownFlags = await bulkHasUuid(candidates.map((s) => s.uuid));
  const fresh: Story[] = candidates.filter((_s, i) => !knownFlags[i]);

  // Step 4: register fresh stories as "new" in KV up front (so dashboard
  // can show them flowing in even before judging completes).
  await Promise.all(fresh.map((s) => upsertState(s.uuid, { story: toSlim(s), status: "new" })));

  // Step 5: judge fan-out (concurrency-capped via chunkedAll). Each judge
  // call is "use step". Chunked Promise.all keeps step ordering deterministic
  // for WDK's event log; a worker-pool with a shared counter does NOT.
  const judged = await chunkedAll(fresh, concurrency, judgeOrFallback);

  // Step 6: state update per verdict + count.
  const counts: Record<"skip" | "watch" | "deep", number> = { skip: 0, watch: 0, deep: 0 };
  const deepStories: Array<{ story: SlimStory; judge: JudgeResult }> = [];
  const deepRaw: Story[] = [];
  for (const j of judged) {
    counts[j.judge.verdict]++;
    await upsertState(j.story.uuid, {
      story: toSlim(j.story),
      status: j.judge.verdict === "skip" ? "skipped" : "judged",
      verdict: j.judge,
    });
    if (j.judge.verdict === "deep") {
      deepStories.push({ story: toSlim(j.story), judge: j.judge });
      deepRaw.push(j.story);
    }
  }

  // Step 7: Deep Analyst fan-out — chunked Promise.all (concurrency 3).
  // Each story's analyzeAndRecord is "use step"; chunk.map keeps the
  // deterministic ordering WDK requires.
  const analysisConcurrency = 3;
  await chunkedAll(deepRaw, analysisConcurrency, analyzeAndRecord);

  return {
    checkedTickers: tickers.length,
    totalStories: fresh.length,
    failedTickers,
    verdicts: counts,
    deepStories,
  };
}
