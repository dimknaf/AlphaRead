// GET /api/state — returns the dashboard sections + summary.
// All section reads are async (KV-backed). For the dashboard we serve the
// "all" payload; ?section= can fetch a single section if needed.

import { NextResponse } from "next/server";
import { state } from "@/lib/state";
import { WATCHLIST } from "@/lib/watchlist";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const section = url.searchParams.get("section") ?? "all";
  const activityLimit = Number(url.searchParams.get("activityLimit") ?? 100);
  const topLimit = Number(url.searchParams.get("topLimit") ?? 10);

  try {
    const summary = await state.summary();

    if (section === "activityFeed") {
      return NextResponse.json({ summary, activityFeed: await state.sectionActivityFeed(activityLimit) });
    }
    if (section === "topStories") {
      return NextResponse.json({ summary, topStories: await state.sectionTopStories(topLimit) });
    }
    if (section === "sectorWatch") {
      return NextResponse.json({ summary, sectorWatch: await state.sectionSectorWatch() });
    }
    if (section === "companiesUnderWatch") {
      return NextResponse.json({
        summary,
        companiesUnderWatch: await state.sectionCompaniesUnderWatch(WATCHLIST),
      });
    }

    // default: all sections — read in parallel
    const [activityFeed, topStories, sectorWatch, companiesUnderWatch] = await Promise.all([
      state.sectionActivityFeed(activityLimit),
      state.sectionTopStories(topLimit),
      state.sectionSectorWatch(),
      state.sectionCompaniesUnderWatch(WATCHLIST),
    ]);

    return NextResponse.json({
      summary,
      activityFeed,
      topStories,
      sectorWatch,
      companiesUnderWatch,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
