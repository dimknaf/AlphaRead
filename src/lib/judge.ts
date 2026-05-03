// Pre-check Agent — judges a single news story for whether it deserves
// deep analysis. Lightweight one-shot LLM call (Claude Haiku 4.5 via the
// Vercel AI Gateway). Wraps `generateObject` so the output is schema-
// validated and never free-form.
//
// "use step" so WDK retries on transient failures and the call is durable.

import { generateObject } from "ai";
import { z } from "zod";
import type { JudgeResult, Story } from "./types";

const JUDGE_SCHEMA = z.object({
  verdict: z.enum(["skip", "watch", "deep"]),
  reason: z.string().max(280),
  confidence: z.number().int().min(0).max(100),
  longTermAngles: z.array(z.string().max(140)).max(5).optional(),
});

const SYSTEM = `You are a senior financial analyst triaging incoming news for AlphaRead — a deep-impact research tool for long-horizon investors.

Your job: judge a single news story given title + description + ticker(s) + source. You DO NOT have the full article body.

**Default to "deep" when in doubt.** A separate Deep Analyst runs after you and refines the actual magnitude. Your job here is plausibility, not certainty. False positives are cheap; false negatives mean we miss alpha.

Verdicts:
- "skip"  — ONLY for unambiguous noise that cannot possibly inform a long-term thesis: pure price-move recaps ("stock up 2% today"), generic analyst-rating changes with no underlying thesis, listicles, sports/lifestyle blurbs that mention the ticker incidentally, social-media-driven coverage of stale events. If you find yourself thinking "hmm maybe this matters slightly" — that is NOT skip.
- "watch" — only when there is genuinely no causal mechanism to a long-term thesis: a sector-wide trend that doesn't single out this company, an ambiguous early signal with no concrete event yet, internal corporate news with no external impact (e.g. routine board meeting). If the story names a concrete event involving the company, prefer "deep".
- "deep"  — the working default. Any story with a plausible causal mechanism: strategic shifts (channel/product/pricing/geography), supply-chain events, regulatory or legal exposure, M&A and partnership news, earnings or guidance moves, leadership changes, technology platform shifts, geopolitical exposure, capital allocation pivots, operational changes, competitive moves, demand-signal stories (orders, contracts, customer wins/losses), sector spillover candidates.

When in doubt — DEEP. The dashboard needs analyst output to feel alive; the Deep Analyst will figure out magnitude.

Be terse. Reason field: 1 sentence, no fluff. longTermAngles: 1-3 short hints whenever you choose "deep".`;

export async function judgeStory(story: Story): Promise<JudgeResult> {
  "use step";
  const userMsg = `Tickers: ${story.assetTags.join(", ") || "(none)"}
Source: ${story.source.name}
Title: ${story.title}
Description: ${story.description}`;

  const { object } = await generateObject({
    model: "anthropic/claude-haiku-4.5",
    schema: JUDGE_SCHEMA,
    system: SYSTEM,
    prompt: userMsg,
    // temperature 0: deterministic so the same prompt → same verdict every
    // time. With 0.3 we saw the judge produce "deep" on first call and then
    // (on workflow replay or a re-fire across polls) produce "watch" or
    // "skip" for the same story, which the state.upsert would happily
    // overwrite. Temperature 0 + the verdict ratchet in state.ts kill that
    // path. Slight loss of variety in `reason` strings is acceptable.
    temperature: 0,
    maxRetries: 1,
  });

  return object;
}
