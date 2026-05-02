// pollWatchlistOnce — durable workflow that fans out per-ticker fetches,
// dedupes against KV via HTTP (workflow runtime can't import redis directly),
// runs the Pre-check Agent on each story, writes verdicts back to KV via
// HTTP, and returns a verdict-grouped summary.
//
// State R/W is done via fetch() to /api/state/upsert and /api/state/has-uuid
// because the WDK workflow runtime is Edge-like (no Node Buffer global) and
// can't load the `redis` package. Those API routes run in Node runtime where
// redis works fine.

import { getStoriesForTicker } from "./cityfalcon";
import { judgeStory } from "./judge";
import { toSlim } from "./types";
import type { JudgeResult, PollResult, SlimStory, Status, Story } from "./types";
import { WATCHLIST } from "./watchlist";

function baseUrl(): string {
  // Vercel injects VERCEL_URL (host only, no protocol). Fallback to localhost
  // for dev. NEXT_PUBLIC_BASE_URL can override if needed.
  const explicit = process.env.NEXT_PUBLIC_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
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
  patch: { story?: SlimStory; status?: Status; verdict?: JudgeResult },
): Promise<void> {
  "use step";
  await fetch(`${baseUrl()}/api/state/upsert`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uuid, ...patch }),
  });
}

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

  // Step 5: judge fan-out (concurrency-capped). Each judge call is "use step".
  const judged = await judgeWithLimit(fresh, concurrency);

  // Step 6: state update per verdict + count.
  const counts = { skip: 0, watch: 0, deep: 0 };
  const deepStories: Array<{ story: SlimStory; judge: JudgeResult }> = [];
  for (const j of judged) {
    counts[j.judge.verdict]++;
    await upsertState(j.story.uuid, {
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
