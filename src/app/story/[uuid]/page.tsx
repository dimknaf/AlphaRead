// Per-event page — server component. Fetches /api/story/<uuid> and renders
// the 5-section AnalysisResult plus story header. Falls back gracefully when
// the story is judged but not yet (or never) deeply analyzed.

import Link from "next/link";
import { notFound } from "next/navigation";
import type { AnalysisResult, JudgeResult, SlimStory, Status } from "@/lib/types";

function baseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const prodUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (prodUrl) return `https://${prodUrl}`;
  const v = process.env.VERCEL_URL;
  if (v) return `https://${v}`;
  return "http://localhost:3000";
}

type StoryPayload = {
  ok: true;
  story: SlimStory;
  status: Status;
  verdict?: JudgeResult;
  analysis?: AnalysisResult;
  firstSeen: string;
  lastUpdated: string;
};

async function fetchState(uuid: string): Promise<StoryPayload | null> {
  const r = await fetch(`${baseUrl()}/api/story/${uuid}`, { cache: "no-store" });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`state fetch failed: ${r.status}`);
  const j = (await r.json()) as StoryPayload | { ok: false };
  if (!("ok" in j) || j.ok !== true) return null;
  return j;
}

export default async function StoryPage({
  params,
}: {
  params: Promise<{ uuid: string }>;
}) {
  const { uuid } = await params;
  const s = await fetchState(uuid);
  if (!s) notFound();

  const { story, status, verdict, analysis } = s;

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-200 font-mono p-4 sm:p-6">
      <div className="max-w-3xl mx-auto flex flex-col gap-4">
        <Link
          href="/"
          className="text-xs text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1"
        >
          ← back to dashboard
        </Link>

        {/* Story header */}
        <section className="bg-zinc-900 border border-zinc-800 rounded p-4 flex flex-col gap-2">
          <div className="flex items-center gap-2 flex-wrap text-[10px] uppercase tracking-wide">
            {story.assetTags.slice(0, 3).map((t) => (
              <span key={t} className="px-2 py-0.5 bg-zinc-800 text-zinc-300 rounded">
                {t}
              </span>
            ))}
            <span className="text-zinc-500">{story.source}</span>
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-500">{story.publishTime.slice(0, 16).replace("T", " ")} UTC</span>
            <StatusChip status={status} />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-zinc-100 leading-snug">
            {story.title}
          </h1>
          <p className="text-sm text-zinc-400 leading-relaxed">{story.description}</p>
          <div className="flex items-center gap-3 text-[10px] text-zinc-500 pt-1">
            <span>sentiment {story.sentiment}</span>
            <span>·</span>
            <span>cf-score {story.cityfalconScore}</span>
            <span>·</span>
            <span>{story.duplicatesCount} sources</span>
            <span className="ml-auto">
              <a
                href={story.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-400 hover:text-emerald-300"
              >
                source ↗
              </a>
            </span>
          </div>
        </section>

        {verdict && <JudgeCard verdict={verdict} />}

        {analysis ? (
          <AnalysisSections a={analysis} />
        ) : (
          <NoAnalysisCard status={status} />
        )}
      </div>
    </main>
  );
}

function StatusChip({ status }: { status: Status }) {
  const cls =
    status === "analyzed"
      ? "text-emerald-400"
      : status === "analyzing"
      ? "text-yellow-400 animate-pulse"
      : status === "judged"
      ? "text-zinc-400"
      : status === "skipped"
      ? "text-zinc-600"
      : "text-zinc-500";
  return <span className={`ml-auto ${cls}`}>{status}</span>;
}

function JudgeCard({ verdict }: { verdict: JudgeResult }) {
  const verdictColor =
    verdict.verdict === "deep"
      ? "text-rose-400"
      : verdict.verdict === "watch"
      ? "text-yellow-400"
      : "text-zinc-500";
  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded p-4 flex flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <span className={`text-[10px] uppercase tracking-wide font-semibold ${verdictColor}`}>
          {verdict.verdict}
        </span>
        <span className="text-[10px] text-zinc-500">conf {verdict.confidence}</span>
        <span className="ml-auto text-[10px] text-zinc-500">pre-check agent · Haiku 4.5</span>
      </div>
      <p className="text-sm text-zinc-300">{verdict.reason}</p>
      {verdict.longTermAngles && verdict.longTermAngles.length > 0 && (
        <ul className="text-xs text-zinc-500 list-disc list-inside mt-1 space-y-0.5">
          {verdict.longTermAngles.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function NoAnalysisCard({ status }: { status: Status }) {
  const msg =
    status === "analyzing"
      ? "Deep Analyst is working on this story right now. Refresh in a few seconds."
      : status === "skipped"
      ? "This story was skipped by the pre-check agent — no deep analysis was run."
      : "No deep analysis for this story yet. Only stories judged 'deep' get the full analyst note.";
  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded p-4">
      <p className="text-xs text-zinc-500">{msg}</p>
    </section>
  );
}

function AnalysisSections({ a }: { a: AnalysisResult }) {
  return (
    <>
      {/* Section 1 — headline */}
      <section className="bg-zinc-900 border border-zinc-800 rounded p-4 flex flex-col gap-3">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-wide text-zinc-500">
            analyst summary
          </span>
          <span className="ml-auto" />
          <MagnitudeBadge m={a.magnitude} />
          <HorizonChip h={a.longTermHorizon} />
        </div>
        <p className="text-base sm:text-lg text-zinc-100 leading-relaxed">
          {a.oneLineSummary}
        </p>
        <p className="text-[10px] text-zinc-500">deep analyst · Sonnet 4.6</p>
      </section>

      {/* Section 2 — primary company */}
      <section className="bg-zinc-900 border border-zinc-800 rounded p-4 flex flex-col gap-2">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-wide text-zinc-500">
            primary impact
          </span>
          <span className="text-zinc-200 font-semibold">{a.primaryCompany.ticker}</span>
          <DirectionBadge d={a.primaryCompany.direction} />
        </div>
        <p className="text-sm text-zinc-300 leading-relaxed">
          {a.primaryCompany.rationale}
        </p>
        <p className="text-xs italic text-zinc-500 mt-1">
          {a.primaryCompany.sizingContext}
        </p>
      </section>

      {/* Section 3 — sector spillover */}
      {a.spillover.length > 0 && (
        <section className="bg-zinc-900 border border-zinc-800 rounded p-4 flex flex-col gap-3">
          <span className="text-[10px] uppercase tracking-wide text-zinc-500">
            sector spillover
          </span>
          <ul className="flex flex-col gap-3">
            {a.spillover.map((sp, i) => (
              <li key={i} className="border border-zinc-800 rounded p-3 flex flex-col gap-2">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-zinc-200 font-semibold text-sm">{sp.sector}</span>
                  <DirectionBadge d={sp.direction} />
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed">{sp.rationale}</p>
                {sp.candidateTickers.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {sp.candidateTickers.map((t) => (
                      <span
                        key={t}
                        className="px-1.5 py-0.5 text-[10px] bg-zinc-800 text-zinc-300 rounded"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Section 4 — signal vs noise */}
      <section className="bg-zinc-900 border border-zinc-800 rounded p-4 flex flex-col gap-3">
        <span className="text-[10px] uppercase tracking-wide text-zinc-500">
          signal vs noise
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-emerald-400">
              market is missing
            </span>
            {a.signalVsNoise.marketIsMissing.length > 0 ? (
              <ul className="text-xs text-zinc-300 space-y-1 list-disc list-inside">
                {a.signalVsNoise.marketIsMissing.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-zinc-600 italic">(nothing flagged)</p>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-rose-400">
              market is overreacting
            </span>
            {a.signalVsNoise.marketIsOverreacting.length > 0 ? (
              <ul className="text-xs text-zinc-300 space-y-1 list-disc list-inside">
                {a.signalVsNoise.marketIsOverreacting.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-zinc-600 italic">(nothing flagged)</p>
            )}
          </div>
        </div>
      </section>

      {/* Section 5 — watch flags */}
      <section className="bg-zinc-900 border border-zinc-800 rounded p-4 flex flex-col gap-3">
        <span className="text-[10px] uppercase tracking-wide text-zinc-500">
          watch flags
        </span>
        <ol className="flex flex-col gap-2">
          {a.watchFlags.map((wf, i) => (
            <li key={i} className="flex items-baseline gap-2 text-sm text-zinc-300">
              <span className="text-zinc-600 shrink-0">{i + 1}.</span>
              <span className="flex-1">{wf.flag}</span>
              <HorizonChip h={wf.horizon} />
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}

function MagnitudeBadge({ m }: { m: AnalysisResult["magnitude"] }) {
  const cls =
    m === "major"
      ? "bg-rose-950/60 text-rose-300 border-rose-900"
      : m === "material"
      ? "bg-yellow-950/60 text-yellow-300 border-yellow-900"
      : "bg-zinc-800 text-zinc-400 border-zinc-700";
  return (
    <span className={`px-2 py-0.5 text-[10px] uppercase tracking-wide rounded border ${cls}`}>
      {m}
    </span>
  );
}

function DirectionBadge({ d }: { d: "bullish" | "bearish" | "neutral" }) {
  const cls =
    d === "bullish"
      ? "bg-emerald-950/60 text-emerald-300 border-emerald-900"
      : d === "bearish"
      ? "bg-rose-950/60 text-rose-300 border-rose-900"
      : "bg-zinc-800 text-zinc-400 border-zinc-700";
  return (
    <span className={`px-2 py-0.5 text-[10px] uppercase tracking-wide rounded border ${cls}`}>
      {d}
    </span>
  );
}

function HorizonChip({ h }: { h: string }) {
  return (
    <span className="px-2 py-0.5 text-[10px] uppercase tracking-wide rounded border border-zinc-700 text-zinc-400">
      {h}
    </span>
  );
}
