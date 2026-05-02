// GET /api/state
// Returns the central dashboard state — the 5 derived sections + a summary.
// Frontend (Step 6) hydrates from this on page load and subscribes to /api/stream
// for live deltas (SSE — coming in Step 6).
//
// Query params:
//   ?section=activityFeed|topStories|sectorWatch|companiesUnderWatch|all (default: all)
//   ?activityLimit=100  (only meaningful when section includes activityFeed)
//   ?topLimit=10        (only meaningful when section includes topStories)

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

  const summary = state.summary();

  if (section === "activityFeed") {
    return NextResponse.json({ summary, activityFeed: state.sectionActivityFeed(activityLimit) });
  }
  if (section === "topStories") {
    return NextResponse.json({ summary, topStories: state.sectionTopStories(topLimit) });
  }
  if (section === "sectorWatch") {
    return NextResponse.json({ summary, sectorWatch: state.sectionSectorWatch() });
  }
  if (section === "companiesUnderWatch") {
    return NextResponse.json({
      summary,
      companiesUnderWatch: state.sectionCompaniesUnderWatch(WATCHLIST),
    });
  }
  // default: all sections
  return NextResponse.json({
    summary,
    activityFeed: state.sectionActivityFeed(activityLimit),
    topStories: state.sectionTopStories(topLimit),
    sectorWatch: state.sectionSectorWatch(),
    companiesUnderWatch: state.sectionCompaniesUnderWatch(WATCHLIST),
  });
}
