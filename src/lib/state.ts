// Central in-memory state for the AlphaRead dashboard.
// Hackathon scope: in-process Map, no persistence. Survives within one
// serverless instance lifetime; fresh on cold start. For production, swap
// the implementation behind the same interface for Vercel KV.
//
// The dashboard subscribes to *sections* (derived projections of state).
// Each section is computed by a pure function so the SSE feed (Step 6)
// can diff old-vs-new section payloads and only push changed sections.

import type {
  ActivityEvent,
  JudgeResult,
  SlimStory,
  Status,
  StoryState,
} from "./types";

class CentralStateImpl {
  private byUuid = new Map<string, StoryState>();
  private events: ActivityEvent[] = [];
  /** Cap activity feed to the last N events (memory-bounded). */
  private static MAX_EVENTS = 500;

  upsert(uuid: string, patch: Partial<StoryState> & { story?: SlimStory }): StoryState {
    const now = new Date().toISOString();
    const existing = this.byUuid.get(uuid);
    const next: StoryState = existing
      ? { ...existing, ...patch, lastUpdated: now }
      : {
          // require a story on first insert
          story: patch.story as SlimStory,
          status: patch.status ?? "new",
          verdict: patch.verdict,
          firstSeen: now,
          lastUpdated: now,
        };
    this.byUuid.set(uuid, next);
    this.recordEvent(next);
    return next;
  }

  private recordEvent(s: StoryState): void {
    const ev: ActivityEvent = {
      id: `${s.story.uuid}:${s.status}:${s.lastUpdated}`,
      uuid: s.story.uuid,
      ticker: s.story.assetTags[0],
      status: s.status,
      verdict: s.verdict?.verdict,
      reason: s.verdict?.reason,
      at: s.lastUpdated,
    };
    this.events.unshift(ev); // newest first
    if (this.events.length > CentralStateImpl.MAX_EVENTS) {
      this.events.length = CentralStateImpl.MAX_EVENTS;
    }
  }

  get(uuid: string): StoryState | undefined {
    return this.byUuid.get(uuid);
  }

  list(filter?: { status?: Status; verdict?: JudgeResult["verdict"] }): StoryState[] {
    let xs = Array.from(this.byUuid.values());
    if (filter?.status) xs = xs.filter((s) => s.status === filter.status);
    if (filter?.verdict) xs = xs.filter((s) => s.verdict?.verdict === filter.verdict);
    return xs;
  }

  // -------- Dashboard section projections (pure derivations) --------

  /** activityFeed — newest events first, up to MAX_EVENTS. */
  sectionActivityFeed(limit = 100): ActivityEvent[] {
    return this.events.slice(0, limit);
  }

  /** topStories — top N "deep" verdicts ranked by confidence × recency. */
  sectionTopStories(limit = 10): Array<{ story: SlimStory; verdict: JudgeResult; lastUpdated: string }> {
    const deep = this.list({ verdict: "deep" });
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

  /** sectorWatch — counts of "deep" verdicts per first-tag in last 24h. */
  sectionSectorWatch(): Array<{ ticker: string; count: number }> {
    const since = Date.now() - 24 * 3600 * 1000;
    const counts = new Map<string, number>();
    for (const s of this.list({ verdict: "deep" })) {
      if (new Date(s.lastUpdated).getTime() < since) continue;
      const t = s.story.assetTags[0] ?? "unknown";
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([ticker, count]) => ({ ticker, count }))
      .sort((a, b) => b.count - a.count);
  }

  /** companiesUnderWatch — last verdict + lastImpactAt per ticker. */
  sectionCompaniesUnderWatch(tickers: readonly string[]): Array<{
    ticker: string;
    lastImpactAt?: string;
    lastVerdict?: JudgeResult["verdict"];
  }> {
    const out = tickers.map((ticker) => {
      const matches = this.list().filter((s) => s.story.assetTags.includes(ticker));
      if (matches.length === 0) return { ticker };
      // most recent
      const latest = matches.sort(
        (a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime(),
      )[0];
      return {
        ticker,
        lastImpactAt: latest.lastUpdated,
        lastVerdict: latest.verdict?.verdict,
      };
    });
    return out;
  }

  /** Counts summary — useful for /api/state header. */
  summary(): { total: number; byStatus: Record<Status, number>; byVerdict: Record<"skip" | "watch" | "deep", number> } {
    const byStatus: Record<Status, number> = {
      new: 0, judged: 0, analyzing: 0, analyzed: 0, merged: 0, skipped: 0,
    };
    const byVerdict: Record<"skip" | "watch" | "deep", number> = { skip: 0, watch: 0, deep: 0 };
    for (const s of this.byUuid.values()) {
      byStatus[s.status]++;
      if (s.verdict) byVerdict[s.verdict.verdict]++;
    }
    return { total: this.byUuid.size, byStatus, byVerdict };
  }
}

// Module-scoped singleton; one instance per serverless cold-start.
export const state = new CentralStateImpl();
