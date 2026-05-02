"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";

type Summary = {
  total: number;
  byStatus: Record<string, number>;
  byVerdict: { skip: number; watch: number; deep: number };
};

type ActivityEvent = {
  id: string;
  uuid: string;
  ticker?: string;
  status: string;
  verdict?: "skip" | "watch" | "deep";
  reason?: string;
  at: string;
};

type SlimStory = {
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

type Magnitude = "small" | "material" | "major";
type Direction = "bullish" | "bearish" | "neutral";
type Horizon = "days" | "weeks" | "months" | "quarters" | "years";

type AnalysisPreview = {
  oneLineSummary: string;
  magnitude: Magnitude;
  longTermHorizon: Horizon;
  primaryCompany: { ticker: string; direction: Direction };
};

type TopStory = {
  story: SlimStory;
  verdict: { verdict: "deep"; reason: string; confidence: number; longTermAngles?: string[] };
  analysis?: AnalysisPreview;
  status: string;
  lastUpdated: string;
};

type SectorCount = { ticker: string; count: number };

type CompanyRow = {
  ticker: string;
  lastImpactAt?: string;
  lastVerdict?: "skip" | "watch" | "deep";
};

type StateResp = {
  summary: Summary;
  activityFeed: ActivityEvent[];
  topStories: TopStory[];
  sectorWatch: SectorCount[];
  companiesUnderWatch: CompanyRow[];
};

const REFRESH_MS = 5_000;

export default function Page() {
  const [data, setData] = useState<StateResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [lastTriggerMsg, setLastTriggerMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/state", { cache: "no-store" });
      const j: StateResp = await r.json();
      setData(j);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(t);
  }, [refresh]);

  const trigger = async () => {
    setTriggering(true);
    setLastTriggerMsg("Starting…");
    try {
      const r = await fetch("/api/manual-trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timeFilter: "h1", judgeConcurrency: 8 }),
      });
      const j = await r.json();
      setLastTriggerMsg(
        j.ok
          ? `Started runId ${(j.runId ?? "").slice(0, 12)}… results stream into state below.`
          : `Error: ${j.error}`,
      );
      refresh();
    } catch (e) {
      setLastTriggerMsg(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setTriggering(false);
    }
  };

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-200 font-mono p-4 sm:p-6 flex flex-col gap-4">
      <header className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2 border-b border-zinc-800 pb-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            <span className="text-emerald-400">α</span>lphaRead
          </h1>
          <p className="text-xs text-zinc-500 mt-1">
            Alpha for long-horizon investors — separates noise from meaningful events,
            traces sector spillover, reveals what the market misses.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500 inline-flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            live • refresh {REFRESH_MS / 1000}s
          </span>
          <button
            onClick={trigger}
            disabled={triggering}
            className="px-3 py-1.5 text-xs rounded bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white font-semibold transition-colors"
          >
            {triggering ? "Starting…" : "Run poll now"}
          </button>
        </div>
      </header>

      {lastTriggerMsg && (
        <div className="text-xs text-zinc-400 bg-zinc-900 border border-zinc-800 rounded px-3 py-2">
          {lastTriggerMsg}
        </div>
      )}

      {loading && !data ? (
        <p className="text-sm text-zinc-500">Loading state…</p>
      ) : (
        <>
          <SummaryRow s={data?.summary} />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Section title="Activity feed" hint="Newest first. Color-coded by verdict.">
              <ActivityFeed events={data?.activityFeed ?? []} />
            </Section>
            <Section title="Top stories" hint="Deep-verdict stories ranked by confidence × recency.">
              <TopStories stories={data?.topStories ?? []} />
            </Section>
            <div className="flex flex-col gap-4">
              <Section title="Sector watch" hint="Deep-verdict count per ticker, last 24h.">
                <SectorWatch counts={data?.sectorWatch ?? []} />
              </Section>
              <Section title="Companies under watch" hint="Last verdict per ticker.">
                <CompaniesUnderWatch rows={data?.companiesUnderWatch ?? []} />
              </Section>
            </div>
          </div>
        </>
      )}

      <footer className="text-xs text-zinc-600 border-t border-zinc-800 pt-3">
        Track 1 — Vercel Workflow SDK · Pre-check Agent: Claude Haiku 4.5 via Vercel AI Gateway ·
        News: CityFalcon · Web: Bright Data
      </footer>
    </main>
  );
}

function SummaryRow({ s }: { s?: Summary }) {
  if (!s) return null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
      <Stat label="seen" value={s.total} />
      <Stat label="judged" value={s.byStatus.judged ?? 0} />
      <Stat label="skip" value={s.byVerdict.skip} colorClass="text-zinc-500" />
      <Stat label="watch" value={s.byVerdict.watch} colorClass="text-yellow-400" />
      <Stat label="deep" value={s.byVerdict.deep} colorClass="text-rose-400" />
    </div>
  );
}

function Stat({
  label,
  value,
  colorClass = "text-zinc-200",
}: { label: string; value: number; colorClass?: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className={`text-xl font-bold ${colorClass}`}>{value}</div>
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded">
      <header className="px-3 py-2 border-b border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-200">{title}</h2>
        {hint && <p className="text-[10px] text-zinc-500 mt-0.5">{hint}</p>}
      </header>
      <div className="p-3">{children}</div>
    </section>
  );
}

function verdictColor(v?: string): string {
  if (v === "deep") return "text-rose-400";
  if (v === "watch") return "text-yellow-400";
  if (v === "skip") return "text-zinc-500";
  return "text-zinc-400";
}

function ActivityFeed({ events }: { events: ActivityEvent[] }) {
  if (events.length === 0) {
    return <p className="text-xs text-zinc-500">No activity yet. Click &quot;Run poll now&quot;.</p>;
  }
  return (
    <ul className="text-xs space-y-1 max-h-[28rem] overflow-y-auto">
      {events.slice(0, 80).map((e) => (
        <li key={e.id} className="flex items-baseline gap-2">
          <span className="text-zinc-600 shrink-0">{e.at.slice(11, 19)}</span>
          <span className={`shrink-0 ${verdictColor(e.verdict)}`}>
            [{e.verdict ?? e.status}]
          </span>
          {e.ticker && <span className="text-zinc-300 shrink-0">{e.ticker}</span>}
          <span className="text-zinc-400 truncate">{e.reason ?? e.uuid.slice(0, 8)}</span>
        </li>
      ))}
    </ul>
  );
}

function TopStories({ stories }: { stories: TopStory[] }) {
  if (stories.length === 0) {
    return <p className="text-xs text-zinc-500">No deep-verdict stories yet.</p>;
  }
  return (
    <ul className="space-y-3 max-h-[28rem] overflow-y-auto">
      {stories.map((s) => (
        <li key={s.story.uuid} className="border border-zinc-800 rounded p-2 hover:border-zinc-700 transition-colors">
          <div className="flex items-baseline justify-between gap-2">
            <div className="flex items-baseline gap-2">
              <span className="text-rose-400 text-[10px] font-semibold">DEEP</span>
              {s.analysis && <MagnitudeChip m={s.analysis.magnitude} />}
              {s.status === "analyzing" && (
                <span className="text-[10px] text-yellow-400 animate-pulse">analyzing…</span>
              )}
            </div>
            <span className="text-[10px] text-zinc-500">
              {s.story.source} · conf {s.verdict.confidence}
            </span>
          </div>
          <Link
            href={`/story/${s.story.uuid}`}
            className="block text-sm text-zinc-100 hover:text-emerald-400 mt-1"
          >
            {s.story.title}
          </Link>
          {s.analysis ? (
            <p className="text-xs text-zinc-300 mt-1 leading-relaxed">
              {s.analysis.oneLineSummary}
            </p>
          ) : (
            <p className="text-xs text-zinc-400 mt-1">{s.verdict.reason}</p>
          )}
          <div className="flex items-center gap-2 mt-2 text-[10px]">
            <Link
              href={`/story/${s.story.uuid}`}
              className="text-emerald-400 hover:text-emerald-300"
            >
              full analysis →
            </Link>
            <span className="text-zinc-700">·</span>
            <a
              href={s.story.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-500 hover:text-zinc-300"
            >
              source ↗
            </a>
          </div>
        </li>
      ))}
    </ul>
  );
}

function MagnitudeChip({ m }: { m: Magnitude }) {
  const cls =
    m === "major"
      ? "bg-rose-950/60 text-rose-300 border-rose-900"
      : m === "material"
      ? "bg-yellow-950/60 text-yellow-300 border-yellow-900"
      : "bg-zinc-800 text-zinc-400 border-zinc-700";
  return (
    <span className={`px-1.5 py-0.5 text-[9px] uppercase tracking-wide rounded border ${cls}`}>
      {m}
    </span>
  );
}

function SectorWatch({ counts }: { counts: SectorCount[] }) {
  if (counts.length === 0) {
    return <p className="text-xs text-zinc-500">No sector activity yet.</p>;
  }
  return (
    <ul className="text-xs space-y-1">
      {counts.map((c) => (
        <li key={c.ticker} className="flex items-baseline justify-between">
          <span className="text-zinc-300">{c.ticker}</span>
          <span className="text-rose-400 font-semibold">{c.count}</span>
        </li>
      ))}
    </ul>
  );
}

function CompaniesUnderWatch({ rows }: { rows: CompanyRow[] }) {
  return (
    <ul className="text-xs grid grid-cols-2 gap-1">
      {rows.map((r) => (
        <li key={r.ticker} className="flex items-baseline gap-2">
          <span className={`shrink-0 ${verdictColor(r.lastVerdict)}`}>•</span>
          <span className="text-zinc-300 shrink-0">{r.ticker}</span>
          {r.lastImpactAt && (
            <span className="text-zinc-600 text-[10px] truncate">
              {r.lastImpactAt.slice(11, 16)}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
