// GET /api/state/orphans — list deep verdicts that never got analysed.
// Called by the workflow's orphan-recovery step (workflow runtime can't
// import redis directly, hence HTTP bridge into Node route).

import { NextResponse } from "next/server";
import { state } from "@/lib/state";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const xs = await state.listDeepOrphans();
    const orphans = xs.map((s) => ({
      uuid: s.story.uuid,
      slim: s.story,
      verdict: s.verdict!,
    }));
    return NextResponse.json({ ok: true, orphans });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
