// POST /api/manual-trigger  — kick off pollWatchlistOnce() in the background
// and return immediately with the runId. The workflow updates the central
// state as judges complete; the dashboard polls /api/state.
// GET /api/manual-trigger  — same, used by Vercel Cron.

import { NextResponse } from "next/server";
import { start } from "workflow/api";
import { pollWatchlistOnce } from "@/lib/triggers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Allow up to the Pro plan max — workflow may take a few minutes if many
// stories. Returning early via fire-and-return makes this mostly moot but
// some background work continues after the response.
export const maxDuration = 300;

async function fireAndReturn(opts: {
  tickers?: string[];
  timeFilter?: "h1" | "d1" | "w1" | "m1";
  judgeConcurrency?: number;
}) {
  try {
    const run = await start(pollWatchlistOnce, [opts]);
    return NextResponse.json({
      ok: true,
      started: true,
      runId: run.runId,
      message: "Poll started in background. Watch /api/state for results streaming in.",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    // empty body is fine
  }

  const tickers = Array.isArray(body.tickers)
    ? body.tickers.filter((t): t is string => typeof t === "string")
    : undefined;
  const timeFilter = typeof body.timeFilter === "string"
    ? (body.timeFilter as "h1" | "d1" | "w1" | "m1")
    : undefined;
  const judgeConcurrency = typeof body.judgeConcurrency === "number"
    ? body.judgeConcurrency
    : undefined;

  return fireAndReturn({ tickers, timeFilter, judgeConcurrency });
}

// Vercel Cron sends GET. Default options (full watchlist, last hour).
export async function GET() {
  return fireAndReturn({ timeFilter: "h1" });
}
