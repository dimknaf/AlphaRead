// pollWatchlistOnce — durable workflow that fans out per-ticker fetches,
// dedupes by uuid, runs the Pre-check Agent on each story, updates the
// central state, and returns a verdict-grouped summary.
//
// In Step 5, "deep" verdicts will additionally trigger analyzeNewsImpact()
// (Bright Data fetch + DCSC sectors + Sonnet 4.6 deep analyst).

import { getStoriesForTicker } from "./cityfalcon";
import { judgeStory } from "./judge";
import { state } from "./state";
import { toSlim } from "./types";
import type { JudgeResult, PollResult, SlimStory, Story } from "./types";
import { WATCHLIST } from "./watchlist";

export type PollOptions = {
  tickers?: readonly string[];
  /** "h1" / "d1" / "w1" / "m1" — defaults to "d1" (last 24h). */
  timeFilter?: "h1" | "d1" | "w1" | "m1";
  /** Concurrency cap for the per-story judge fan-out. */
  judgeConcurrency?: number;
};

async function judgeWithLimit(
  stories: Story[],
  concurrency: number,
): Promise<Array<{ story: Story; judge: JudgeResult; error?: string }>> {
  const results: Array<{ story: Story; judge: JudgeResult; error?: string }> = [];
  let i = 0;
  async function worker(): Promise<void> {
    while (true) {
      const idx = i++;
      if (idx >= stories.length) return;
      const story = stories[idx];
      try {
        const judge = await judgeStory(story);
        results[idx] = { story, judge };
      } catch (e) {
        results[idx] = {
          story,
          judge: { verdict: "skip", reason: "judge error", confidence: 0 },
          error: e instanceof Error ? e.message : String(e),
        };
      }
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, stories.length) }, () => worker());
  await Promise.all(workers);
  return results;
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

  // Step 2: flatten + dedupe by uuid (within this run + KV-shared across runs).
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

  // KV-side dedup: drop stories already in our state (any prior poll, any
  // serverless instance). Parallel hexists checks.
  const knownFlags = await Promise.all(candidates.map((s) => state.hasUuid(s.uuid)));
  const fresh: Story[] = candidates.filter((_s, i) => !knownFlags[i]);

  // Step 3: register fresh stories as "new" in KV up front (so dashboard
  // can show them flowing in even before judging completes).
  await Promise.all(fresh.map((s) => state.upsert(s.uuid, { story: toSlim(s), status: "new" })));

  // Step 4: judge fan-out (concurrency-capped). Each judge call is "use step".
  const judged = await judgeWithLimit(fresh, concurrency);

  // Step 5: state update per verdict + count (sequential to keep KV writes
  // sane; each is fast).
  const counts = { skip: 0, watch: 0, deep: 0 };
  const deepStories: Array<{ story: SlimStory; judge: JudgeResult }> = [];
  for (const j of judged) {
    counts[j.judge.verdict]++;
    await state.upsert(j.story.uuid, {
      story: toSlim(j.story),
      status: j.judge.verdict === "skip" ? "skipped" : "judged",
      verdict: j.judge,
    });
    if (j.judge.verdict === "deep") {
      deepStories.push({ story: toSlim(j.story), judge: j.judge });
    }
  }

  return {
    checkedTickers: tickers.length,
    totalStories: fresh.length,
    failedTickers,
    verdicts: counts,
    deepStories,
  };
}
