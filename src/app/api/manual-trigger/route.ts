// POST /api/manual-trigger
// Demo endpoint: fires pollWatchlistOnce() (durable workflow) and returns
// the verdict-grouped summary. The central state is updated as a side effect;
// the dashboard hydrates from /api/state.
//
// Body (all optional):
//   { tickers?: string[], timeFilter?: "h1"|"d1"|"w1"|"m1", judgeConcurrency?: number }

import { NextResponse } from "next/server";
import { start } from "workflow/api";
import { pollWatchlistOnce } from "@/lib/triggers";
import type { PollResult } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Allow long-running judge fan-out (~17s for 200 stories at concurrency 8).
export const maxDuration = 60;

async function runPoll(opts: {
  tickers?: string[];
  timeFilter?: "h1" | "d1" | "w1" | "m1";
  judgeConcurrency?: number;
}) {
  try {
    const run = await start(pollWatchlistOnce, [opts]);
    const result = (await run.returnValue) as PollResult;
    return NextResponse.json({ ok: true, ...result });
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
    // empty body is fine — use defaults
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

  return runPoll({ tickers, timeFilter, judgeConcurrency });
}

// Vercel Cron sends GET. Same handler, default options (full watchlist, last hour).
export async function GET() {
  return runPoll({ timeFilter: "h1" });
}
