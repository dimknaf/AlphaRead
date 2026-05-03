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
  title?: string;
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

type MagnitudeMix = { small: number; material: number; major: number };
type DirectionMix = { bullish: number; bearish: number; neutral: number };
type HorizonMix = Record<Horizon, number>;
type HotTicker = { ticker: string; weight: number; appearances: number };
type MissingDigestItem = { insight: string; ticker: string; uuid: string; at: string };
type WatchFlagDigestItem = { flag: string; horizon: "hours" | "days" | "weeks" | "months"; ticker: string; uuid: string; at: string };

type StateResp = {
  summary: Summary;
  activityFeed: ActivityEvent[];
  topStories: TopStory[];
  sectorWatch: SectorCount[];
  companiesUnderWatch: CompanyRow[];
  magnitudeMix: MagnitudeMix;
  directionMix: DirectionMix;
  horizonMix: HorizonMix;
  hotTickers: HotTicker[];
  marketIsMissingDigest: MissingDigestItem[];
  watchFlagDigest: WatchFlagDigestItem[];
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

          {/* HERO STRIP — analyses front-and-center */}
          <Hero
            magnitudeMix={data?.magnitudeMix}
            directionMix={data?.directionMix}
            hotTickers={data?.hotTickers ?? []}
          />

          {/* MAIN INSIGHT RAIL — Today's deep reads + market-is-missing */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
            <Section
              title="Today's deep reads"
              hint="Top analyst notes. Click for the full structured analysis."
              className="lg:col-span-3"
            >
              <DeepReadsHero stories={data?.topStories ?? []} />
            </Section>
            <Section
              title="What the market is missing"
              hint="Edges the consensus is overlooking right now."
              className="lg:col-span-2"
            >
              <MarketMissingDigest items={data?.marketIsMissingDigest ?? []} />
            </Section>
          </div>

          {/* QUICK STATS — magnitude / direction / horizon / hot tickers */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Section title="Impact magnitude" hint="Across analyzed stories.">
              <MagnitudeMixTile data={data?.magnitudeMix} />
            </Section>
            <Section title="Direction split" hint="Primary-company calls.">
              <DirectionMixTile data={data?.directionMix} />
            </Section>
            <Section title="Horizon mix" hint="Long-term effect plays out…">
              <HorizonMixTile data={data?.horizonMix} />
            </Section>
            <Section title="Hot tickers" hint="Weighted by magnitude. Includes spillover.">
              <HotTickersTile data={data?.hotTickers ?? []} />
            </Section>
          </div>

          {/* WATCH FLAGS digest (full-width) */}
          <Section title="Watch flags" hint="Forward-looking signals from the analyst, by horizon.">
            <WatchFlagDigest items={data?.watchFlagDigest ?? []} />
          </Section>

          {/* OPERATIONS — feed + secondary tiles */}
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
  className = "",
}: { title: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`bg-zinc-900 border border-zinc-800 rounded ${className}`}>
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
      {events.slice(0, 80).map((e) => {
        // For "new" status events the verdict hasn't been computed yet, so
        // there's no reason — fall through to the news title (set in
        // state.upsert). Last-resort fallback is a short uuid slice.
        const text = e.reason ?? e.title ?? e.uuid.slice(0, 8);
        // Native browser tooltip on hover so the user can read the full
        // judge reason without losing scroll position. Truncation stays for
        // line layout — tooltip is the escape hatch.
        const tip = `${e.at.slice(11, 19)}  [${e.verdict ?? e.status}]${e.ticker ? `  ${e.ticker}` : ""}\n${text}`;
        return (
          <li key={e.id} className="flex items-baseline gap-2" title={tip}>
            <span className="text-zinc-600 shrink-0">{e.at.slice(11, 19)}</span>
            <span className={`shrink-0 ${verdictColor(e.verdict)}`}>
              [{e.verdict ?? e.status}]
            </span>
            {e.ticker && <span className="text-zinc-300 shrink-0">{e.ticker}</span>}
            <span className="text-zinc-400 truncate">{text}</span>
          </li>
        );
      })}
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

// ---------------- Insight tiles ----------------

function MagnitudeMixTile({ data }: { data?: MagnitudeMix }) {
  if (!data) return <Empty />;
  const total = data.small + data.material + data.major;
  if (total === 0) return <p className="text-xs text-zinc-500">No analyses yet.</p>;
  const seg = (n: number, cls: string, label: string) => {
    const pct = (n / total) * 100;
    if (pct < 1) return null;
    return (
      <div
        key={label}
        className={`${cls} flex items-center justify-center text-[10px] font-semibold text-zinc-950`}
        style={{ width: `${pct}%` }}
        title={`${label}: ${n}`}
      >
        {pct >= 12 ? n : ""}
      </div>
    );
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-5 rounded overflow-hidden border border-zinc-800">
        {seg(data.small, "bg-zinc-600", "small")}
        {seg(data.material, "bg-yellow-500", "material")}
        {seg(data.major, "bg-rose-500", "major")}
      </div>
      <div className="flex justify-between text-[10px] text-zinc-500">
        <span>small {data.small}</span>
        <span className="text-yellow-400">material {data.material}</span>
        <span className="text-rose-400">major {data.major}</span>
      </div>
    </div>
  );
}

function DirectionMixTile({ data }: { data?: DirectionMix }) {
  if (!data) return <Empty />;
  const total = data.bullish + data.bearish + data.neutral;
  if (total === 0) return <p className="text-xs text-zinc-500">No analyses yet.</p>;
  return (
    <div className="grid grid-cols-3 gap-2">
      <Pill label="bullish" value={data.bullish} cls="bg-emerald-950/60 border-emerald-900 text-emerald-300" />
      <Pill label="bearish" value={data.bearish} cls="bg-rose-950/60 border-rose-900 text-rose-300" />
      <Pill label="neutral" value={data.neutral} cls="bg-zinc-800 border-zinc-700 text-zinc-400" />
    </div>
  );
}

function Pill({ label, value, cls }: { label: string; value: number; cls: string }) {
  return (
    <div className={`rounded border px-2 py-2 flex flex-col items-center ${cls}`}>
      <span className="text-lg font-bold leading-none">{value}</span>
      <span className="text-[10px] uppercase tracking-wide mt-1">{label}</span>
    </div>
  );
}

function HorizonMixTile({ data }: { data?: HorizonMix }) {
  if (!data) return <Empty />;
  const order: Horizon[] = ["days", "weeks", "months", "quarters", "years"];
  const max = Math.max(1, ...order.map((k) => data[k]));
  const total = order.reduce((acc, k) => acc + data[k], 0);
  if (total === 0) return <p className="text-xs text-zinc-500">No analyses yet.</p>;
  const colors = ["bg-zinc-600", "bg-zinc-500", "bg-emerald-700", "bg-emerald-500", "bg-emerald-300"];
  return (
    <div className="flex items-end gap-1 h-20">
      {order.map((k, i) => (
        <div key={k} className="flex-1 flex flex-col items-center gap-1">
          <span className="text-[10px] text-zinc-400">{data[k]}</span>
          <div
            className={`${colors[i]} w-full rounded-sm`}
            style={{ height: `${(data[k] / max) * 100}%`, minHeight: data[k] ? "4px" : "0" }}
          />
          <span className="text-[9px] text-zinc-500 uppercase">{k.slice(0, 1)}</span>
        </div>
      ))}
    </div>
  );
}

function HotTickersTile({ data }: { data: HotTicker[] }) {
  if (data.length === 0) return <p className="text-xs text-zinc-500">No analyses yet.</p>;
  const max = Math.max(...data.map((d) => d.weight));
  return (
    <ul className="space-y-1">
      {data.slice(0, 8).map((d, i) => (
        <li key={d.ticker} className="flex items-center gap-2 text-xs">
          <span className={`shrink-0 w-12 font-semibold ${i === 0 ? "text-emerald-400" : "text-zinc-300"}`}>
            {d.ticker}
          </span>
          <div className="flex-1 h-1.5 bg-zinc-800 rounded overflow-hidden">
            <div
              className={i === 0 ? "h-full bg-emerald-400" : "h-full bg-zinc-500"}
              style={{ width: `${(d.weight / max) * 100}%` }}
            />
          </div>
          <span className="shrink-0 text-zinc-500 text-[10px] tabular-nums w-10 text-right">
            ×{d.appearances}
          </span>
        </li>
      ))}
    </ul>
  );
}

function MarketMissingDigest({ items }: { items: MissingDigestItem[] }) {
  if (items.length === 0) {
    return <p className="text-xs text-zinc-500">No insights yet — waiting for the Deep Analyst.</p>;
  }
  return (
    <ul className="space-y-2 max-h-[18rem] overflow-y-auto">
      {items.map((it, i) => (
        <li key={`${it.uuid}:${i}`} className="flex items-start gap-2 text-xs">
          <span className="text-emerald-400 shrink-0 mt-0.5">+</span>
          <Link
            href={`/story/${it.uuid}`}
            className="px-1.5 py-0.5 text-[10px] bg-zinc-800 text-zinc-300 rounded shrink-0 hover:bg-zinc-700"
          >
            {it.ticker}
          </Link>
          <Link
            href={`/story/${it.uuid}`}
            className="text-zinc-300 italic leading-snug hover:text-zinc-100"
          >
            {it.insight}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function WatchFlagDigest({ items }: { items: WatchFlagDigestItem[] }) {
  if (items.length === 0) {
    return <p className="text-xs text-zinc-500">No flags yet — waiting for the Deep Analyst.</p>;
  }
  const order: WatchFlagDigestItem["horizon"][] = ["hours", "days", "weeks", "months"];
  const grouped = order
    .map((h) => ({ horizon: h, items: items.filter((i) => i.horizon === h) }))
    .filter((g) => g.items.length > 0);
  const horizonCls = (h: WatchFlagDigestItem["horizon"]) =>
    h === "hours"
      ? "bg-rose-950/60 text-rose-300 border-rose-900"
      : h === "days"
      ? "bg-yellow-950/60 text-yellow-300 border-yellow-900"
      : h === "weeks"
      ? "bg-emerald-950/60 text-emerald-300 border-emerald-900"
      : "bg-zinc-800 text-zinc-400 border-zinc-700";
  return (
    <div className="flex flex-col gap-3 max-h-[18rem] overflow-y-auto">
      {grouped.map((g) => (
        <div key={g.horizon} className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 text-[10px] uppercase tracking-wide rounded border ${horizonCls(g.horizon)}`}>
              {g.horizon}
            </span>
            <span className="text-[10px] text-zinc-600">{g.items.length}</span>
          </div>
          <ul className="flex flex-col gap-1 pl-2">
            {g.items.map((it, i) => (
              <li key={`${it.uuid}:${i}`} className="flex items-start gap-2 text-xs">
                <Link
                  href={`/story/${it.uuid}`}
                  className="px-1.5 py-0.5 text-[10px] bg-zinc-800 text-zinc-300 rounded shrink-0 hover:bg-zinc-700"
                >
                  {it.ticker}
                </Link>
                <Link
                  href={`/story/${it.uuid}`}
                  className="text-zinc-300 leading-snug hover:text-zinc-100"
                >
                  {it.flag}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Empty() {
  return <p className="text-xs text-zinc-500">…</p>;
}

// ---------------- Hero strip ----------------

function Hero({
  magnitudeMix,
  directionMix,
  hotTickers,
}: {
  magnitudeMix?: MagnitudeMix;
  directionMix?: DirectionMix;
  hotTickers: HotTicker[];
}) {
  const totalAnalysed =
    (magnitudeMix?.small ?? 0) + (magnitudeMix?.material ?? 0) + (magnitudeMix?.major ?? 0);
  const totalDirected =
    (directionMix?.bullish ?? 0) + (directionMix?.bearish ?? 0) + (directionMix?.neutral ?? 0);
  return (
    <section className="bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-950 border border-zinc-800 rounded p-4 sm:p-5 flex flex-col gap-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
        {/* Big stat */}
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-wide text-zinc-500">
            deep analyses today
          </span>
          <span className="text-5xl sm:text-6xl font-bold tracking-tight text-emerald-400 leading-none mt-1">
            {totalAnalysed}
          </span>
          <span className="text-[10px] text-zinc-500 mt-1">
            structured analyst notes from Sonnet 4.6
          </span>
        </div>

        {/* Magnitude bar (fat) */}
        <div className="flex flex-col gap-2">
          <span className="text-[10px] uppercase tracking-wide text-zinc-500">
            impact magnitude
          </span>
          <FatMagnitudeBar data={magnitudeMix} />
          <div className="flex justify-between text-[10px] text-zinc-500">
            <span>small {magnitudeMix?.small ?? 0}</span>
            <span className="text-yellow-400">material {magnitudeMix?.material ?? 0}</span>
            <span className="text-rose-400">major {magnitudeMix?.major ?? 0}</span>
          </div>
        </div>

        {/* Direction ratio */}
        <div className="flex flex-col gap-2">
          <span className="text-[10px] uppercase tracking-wide text-zinc-500">
            sentiment of analysis
          </span>
          <DirectionRatio data={directionMix} />
          <div className="flex justify-between text-[10px] text-zinc-500">
            <span className="text-emerald-400">bull {directionMix?.bullish ?? 0}</span>
            <span>neutral {directionMix?.neutral ?? 0}</span>
            <span className="text-rose-400">bear {directionMix?.bearish ?? 0}</span>
          </div>
        </div>
      </div>

      {hotTickers.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-zinc-800">
          <span className="text-[10px] uppercase tracking-wide text-zinc-500 mr-1">
            most affected:
          </span>
          {hotTickers.slice(0, 8).map((t, i) => (
            <span
              key={t.ticker}
              className={`px-2 py-1 text-[11px] rounded border ${
                i === 0
                  ? "bg-emerald-950/60 border-emerald-900 text-emerald-300 font-semibold"
                  : "bg-zinc-800 border-zinc-700 text-zinc-300"
              }`}
            >
              {t.ticker}{" "}
              <span className="text-[9px] opacity-60">×{t.appearances}</span>
            </span>
          ))}
        </div>
      )}

      {totalAnalysed === 0 && (
        <p className="text-xs text-zinc-500 italic">
          {totalDirected === 0
            ? "Waiting for the Deep Analyst to produce its first note. Hit \"Run poll now\" if nothing appears in the next minute."
            : "Analyses are arriving — refresh shortly."}
        </p>
      )}
    </section>
  );
}

function FatMagnitudeBar({ data }: { data?: MagnitudeMix }) {
  const total = (data?.small ?? 0) + (data?.material ?? 0) + (data?.major ?? 0);
  if (total === 0) {
    return <div className="h-12 bg-zinc-800/60 border border-zinc-800 rounded" />;
  }
  const seg = (n: number, cls: string, label: string) => {
    const pct = (n / total) * 100;
    if (pct < 1) return null;
    return (
      <div
        key={label}
        className={`${cls} flex items-center justify-center text-sm font-bold text-zinc-950`}
        style={{ width: `${pct}%` }}
        title={`${label}: ${n}`}
      >
        {pct >= 10 ? n : ""}
      </div>
    );
  };
  return (
    <div className="flex h-12 rounded overflow-hidden border border-zinc-700">
      {seg(data?.small ?? 0, "bg-zinc-500", "small")}
      {seg(data?.material ?? 0, "bg-yellow-500", "material")}
      {seg(data?.major ?? 0, "bg-rose-500", "major")}
    </div>
  );
}

function DirectionRatio({ data }: { data?: DirectionMix }) {
  const total = (data?.bullish ?? 0) + (data?.bearish ?? 0) + (data?.neutral ?? 0);
  if (total === 0) {
    return <div className="h-12 bg-zinc-800/60 border border-zinc-800 rounded" />;
  }
  const seg = (n: number, cls: string, label: string) => {
    const pct = (n / total) * 100;
    if (pct < 1) return null;
    return (
      <div
        key={label}
        className={`${cls} flex items-center justify-center text-sm font-bold text-zinc-950`}
        style={{ width: `${pct}%` }}
        title={`${label}: ${n}`}
      >
        {pct >= 10 ? n : ""}
      </div>
    );
  };
  return (
    <div className="flex h-12 rounded overflow-hidden border border-zinc-700">
      {seg(data?.bullish ?? 0, "bg-emerald-500", "bullish")}
      {seg(data?.neutral ?? 0, "bg-zinc-500", "neutral")}
      {seg(data?.bearish ?? 0, "bg-rose-500", "bearish")}
    </div>
  );
}

// ---------------- Today's deep reads (large, prominent) ----------------

function DeepReadsHero({ stories }: { stories: TopStory[] }) {
  const analysed = stories.filter((s) => s.analysis);
  if (analysed.length === 0) {
    if (stories.length > 0) {
      return (
        <p className="text-xs text-zinc-500 italic">
          {stories.length} deep verdict{stories.length === 1 ? "" : "s"} queued. The Deep Analyst is
          working — full analyses appear here as they complete.
        </p>
      );
    }
    return (
      <p className="text-xs text-zinc-500 italic">
        No deep stories yet. Hit &quot;Run poll now&quot; to seed the dashboard.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-3 max-h-[34rem] overflow-y-auto pr-1">
      {analysed.slice(0, 6).map((s) => (
        <li
          key={s.story.uuid}
          className="border border-zinc-800 rounded p-3 hover:border-zinc-700 hover:bg-zinc-950/40 transition-colors"
        >
          <div className="flex items-baseline gap-2 flex-wrap mb-1">
            {s.analysis && <MagnitudeChip m={s.analysis.magnitude} />}
            {s.analysis && <DirectionChip d={s.analysis.primaryCompany.direction} />}
            <span className="text-[10px] text-zinc-500">
              {s.analysis?.primaryCompany.ticker || s.story.assetTags[0]} ·{" "}
              {s.analysis?.longTermHorizon}
            </span>
            <span className="ml-auto text-[10px] text-zinc-600">{s.story.source}</span>
          </div>
          <Link
            href={`/story/${s.story.uuid}`}
            className="block text-base sm:text-lg text-zinc-100 hover:text-emerald-400 leading-snug"
          >
            {s.story.title}
          </Link>
          {s.analysis && (
            <p className="text-sm text-zinc-300 mt-2 leading-relaxed">
              {s.analysis.oneLineSummary}
            </p>
          )}
          <div className="flex items-center gap-3 mt-3 text-[10px]">
            <Link
              href={`/story/${s.story.uuid}`}
              className="text-emerald-400 hover:text-emerald-300 font-semibold"
            >
              full analysis →
            </Link>
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

function DirectionChip({ d }: { d: Direction }) {
  const cls =
    d === "bullish"
      ? "bg-emerald-950/60 border-emerald-900 text-emerald-300"
      : d === "bearish"
      ? "bg-rose-950/60 border-rose-900 text-rose-300"
      : "bg-zinc-800 border-zinc-700 text-zinc-400";
  return (
    <span className={`px-1.5 py-0.5 text-[9px] uppercase tracking-wide rounded border ${cls}`}>
      {d}
    </span>
  );
}
