// GET /api/story/[uuid] — full StoryState (story + verdict + analysis + status)
// for the per-event page. Node runtime so the redis client works.

import { NextResponse } from "next/server";
import { state } from "@/lib/state";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ uuid: string }> },
) {
  const { uuid } = await params;
  if (!uuid) {
    return NextResponse.json({ ok: false, error: "uuid required" }, { status: 400 });
  }
  const s = await state.get(uuid);
  if (!s) {
    return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, ...s });
}
