// GET /api/state/debug — bucketed snapshot of every state entry.
// GET /api/state/debug?uuid=XXX — diff a specific uuid via state.get() (hGet)
// vs listAll() (hGetAll-then-filter). Used to chase the "shows analyzed
// individually but byStatus.analyzed = 0" inconsistency for Microsoft and
// Merck-style entries.

import { NextResponse } from "next/server";
import { state } from "@/lib/state";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const uuid = url.searchParams.get("uuid");

    if (uuid) {
      // Diff mode — compare the two read paths for one specific story.
      const viaGet = await state.get(uuid);
      const all = await state.listAll();
      const viaListAll = all.find((s) => s.story?.uuid === uuid) ?? null;
      // Also raw hGetAll without listAll's filter, to see whether the entry
      // exists in Redis but gets dropped by the filter.
      const allRaw = await state.listAllRaw();
      const rawForUuid = allRaw[uuid] ?? null;

      const diff = (() => {
        if (!viaGet && !viaListAll) return "not-found-in-either";
        if (viaGet && !viaListAll) return "in-hGet-but-NOT-in-listAll";
        if (!viaGet && viaListAll) return "in-listAll-but-NOT-in-hGet";
        // Both exist — compare key fields.
        const a = viaGet!;
        const b = viaListAll!;
        const fields = ["status"] as const;
        for (const f of fields) {
          if (a[f] !== b[f]) return `field-mismatch:${f}`;
        }
        if ((a.verdict?.verdict ?? null) !== (b.verdict?.verdict ?? null))
          return "field-mismatch:verdict";
        if (Boolean(a.analysis) !== Boolean(b.analysis))
          return "field-mismatch:analysis-presence";
        return "identical";
      })();

      return NextResponse.json({
        uuid,
        diff,
        viaGet,
        viaListAll,
        rawJsonInHash: rawForUuid,
        rawListAllSize: Object.keys(allRaw).length,
      });
    }

    // Default mode — bucket all entries.
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
