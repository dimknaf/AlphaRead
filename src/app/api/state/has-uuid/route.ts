// GET /api/state/has-uuid?uuid=...  — bulk-check up to N uuids in one call.
// Used by the workflow to dedup against KV without importing redis directly.

import { NextResponse } from "next/server";
import { state } from "@/lib/state";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { uuids: string[] };
    if (!Array.isArray(body?.uuids)) {
      return NextResponse.json({ ok: false, error: "uuids[] required" }, { status: 400 });
    }
    const flags = await Promise.all(body.uuids.map((u) => state.hasUuid(u)));
    return NextResponse.json({ ok: true, flags });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
