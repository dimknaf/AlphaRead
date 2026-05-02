// Central state for the AlphaRead dashboard, backed by Vercel KV (Upstash
// Redis under the hood). Shared across serverless instances — the dashboard
// (/api/state) sees what the workflow (pollWatchlistOnce) writes regardless
// of which serverless instance handles each request.
//
// Storage layout:
//   state:stories  (Redis hash)  field=uuid  value=JSON of StoryState
//   state:events   (Redis list)  newest first, capped at 500 entries (LTRIM)
//
// All methods are async. Section derivations are pure functions over the
// loaded data so they can run unchanged client-side or server-side.

import { kv } from "@vercel/kv";
import type {
  ActivityEvent,
  JudgeResult,
  SlimStory,
  Status,
  StoryState,
} from "./types";

const STORIES_KEY = "state:stories";
const EVENTS_KEY = "state:events";
const MAX_EVENTS = 500;

class CentralStateImpl {
  /** Insert or update a story's state. Records an activity event. */
  async upsert(uuid: string, patch: Partial<StoryState> & { story?: SlimStory }): Promise<StoryState> {
    const now = new Date().toISOString();
    const existingRaw = await kv.hget<StoryState>(STORIES_KEY, uuid);
    const next: StoryState = existingRaw
      ? { ...existingRaw, ...patch, lastUpdated: now }
      : {
          // require a story on first insert
          story: patch.story as SlimStory,
          status: patch.status ?? "new",
          verdict: patch.verdict,
          firstSeen: now,
          lastUpdated: now,
        };
    await kv.hset(STORIES_KEY, { [uuid]: next });

    const ev: ActivityEvent = {
      id: `${next.story.uuid}:${next.status}:${now}`,
      uuid: next.story.uuid,
      ticker: next.story.assetTags[0],
      status: next.status,
      verdict: next.verdict?.verdict,
      reason: next.verdict?.reason,
      at: now,
    };
    // lpush newest first, then trim to MAX_EVENTS so the list stays bounded.
    await kv.lpush(EVENTS_KEY, ev);
    await kv.ltrim(EVENTS_KEY, 0, MAX_EVENTS - 1);

    return next;
  }

  /** Fast existence check used by the workflow's dedup pass. */
  async hasUuid(uuid: string): Promise<boolean> {
    return Boolean(await kv.hexists(STORIES_KEY, uuid));
  }

  async get(uuid: string): Promise<StoryState | null> {
    return kv.hget<StoryState>(STORIES_KEY, uuid);
  }

  async listAll(): Promise<StoryState[]> {
    const all = await kv.hgetall<Record<string, StoryState>>(STORIES_KEY);
    return all ? Object.values(all) : [];
  }

  async listByVerdict(verdict: JudgeResult["verdict"]): Promise<StoryState[]> {
    const xs = await this.listAll();
    return xs.filter((s) => s.verdict?.verdict === verdict);
  }

  // -------- Dashboard section projections (async I/O once, pure derivations after) --------

  async sectionActivityFeed(limit = 100): Promise<ActivityEvent[]> {
    const slice = await kv.lrange<ActivityEvent>(EVENTS_KEY, 0, limit - 1);
    return slice ?? [];
  }

  async sectionTopStories(limit = 10): Promise<Array<{ story: SlimStory; verdict: JudgeResult; lastUpdated: string }>> {
    const deep = await this.listByVerdict("deep");
    return deep
      .map((s) => ({
        story: s.story,
        verdict: s.verdict!,
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
    await Promise.all([kv.del(STORIES_KEY), kv.del(EVENTS_KEY)]);
  }
}

export const state = new CentralStateImpl();
