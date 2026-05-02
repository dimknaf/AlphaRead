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

import { createClient, type RedisClientType } from "redis";
import type {
  ActivityEvent,
  JudgeResult,
  SlimStory,
  Status,
  StoryState,
} from "./types";

const STORIES_KEY = "alpharead:stories";
const EVENTS_KEY = "alpharead:events";
const MAX_EVENTS = 500;

let clientPromise: Promise<RedisClientType> | null = null;

async function getClient(): Promise<RedisClientType> {
  if (!clientPromise) {
    const url = process.env.REDIS_URL;
    if (!url) throw new Error("REDIS_URL not set in env (connect a Vercel Marketplace Redis store)");
    clientPromise = (async () => {
      const c: RedisClientType = createClient({ url });
      c.on("error", (err) => {
        console.error("[state] Redis error", err);
      });
      await c.connect();
      return c;
    })();
  }
  return clientPromise;
}

class CentralStateImpl {
  /** Insert or update a story's state. Records an activity event. */
  async upsert(uuid: string, patch: Partial<StoryState> & { story?: SlimStory }): Promise<StoryState> {
    const c = await getClient();
    const now = new Date().toISOString();
    const existingRaw = await c.hGet(STORIES_KEY, uuid);
    const existing: StoryState | null = existingRaw ? (JSON.parse(existingRaw) as StoryState) : null;
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

  /** Fast existence check used by the workflow's dedup pass. */
  async hasUuid(uuid: string): Promise<boolean> {
    const c = await getClient();
    return Boolean(await c.hExists(STORIES_KEY, uuid));
  }

  async get(uuid: string): Promise<StoryState | null> {
    const c = await getClient();
    const raw = await c.hGet(STORIES_KEY, uuid);
    return raw ? (JSON.parse(raw) as StoryState) : null;
  }

  async listAll(): Promise<StoryState[]> {
    const c = await getClient();
    const all = await c.hGetAll(STORIES_KEY);
    return Object.values(all).map((v) => JSON.parse(v) as StoryState);
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
    const c = await getClient();
    await Promise.all([c.del(STORIES_KEY), c.del(EVENTS_KEY)]);
  }
}

export const state = new CentralStateImpl();
