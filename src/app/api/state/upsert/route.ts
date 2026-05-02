// POST /api/state/upsert  — write a story state entry to Redis.
// Called from the WDK workflow via fetch (workflow runtime is Edge-like with
// no Buffer, can't use the redis client directly; HTTP boundary into a Node
// route bypasses that).

import { NextResponse } from "next/server";
import { state } from "@/lib/state";
import type { AnalysisResult, JudgeResult, SlimStory, Status } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type UpsertBody = {
  uuid: string;
  story?: SlimStory;
  status?: Status;
  verdict?: JudgeResult;
  analysis?: AnalysisResult;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as UpsertBody;
    if (!body?.uuid) {
      return NextResponse.json({ ok: false, error: "uuid required" }, { status: 400 });
    }
    await state.upsert(body.uuid, {
      story: body.story,
      status: body.status,
      verdict: body.verdict,
      analysis: body.analysis,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
