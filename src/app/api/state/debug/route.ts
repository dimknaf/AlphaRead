// GET /api/state/debug — diagnostic snapshot of every entry in state,
// bucketed by (status × hasVerdict × hasAnalysis). Used to chase the
// "Berkshire shows analyzed individually but byStatus.analyzed = 0"
// counter discrepancy and similar corruption-shaped bugs.

import { NextResponse } from "next/server";
import { state } from "@/lib/state";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const all = await state.listAll();
    const samples: Record<string, Array<Record<string, unknown>>> = {};
    const counts: Record<string, number> = {};

    for (const s of all) {
      const k = `${s.status}|verdict=${s.verdict?.verdict ?? "null"}|analysis=${s.analysis ? "yes" : "no"}`;
      counts[k] = (counts[k] ?? 0) + 1;
      if (!samples[k]) samples[k] = [];
      if (samples[k].length < 3) {
        samples[k].push({
          uuid: s.story.uuid,
          ticker: s.story.assetTags[0],
          title: s.story.title.slice(0, 80),
          status: s.status,
          verdictVerdict: s.verdict?.verdict ?? null,
          confidence: s.verdict?.confidence ?? null,
          hasAnalysis: Boolean(s.analysis),
          hasEnrichment: Boolean(s.enrichment),
          firstSeen: s.firstSeen,
          lastUpdated: s.lastUpdated,
        });
      }
    }

    return NextResponse.json({
      total: all.length,
      bucketCounts: counts,
      samples,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
