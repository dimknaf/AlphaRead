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

Verdicts:
- "skip"  — true noise. Daily price chatter, after-hours move recaps, generic analyst rating changes with no underlying thesis, listicles, social-media-driven blurbs, repeated coverage of stale events, opinion pieces with no new information.
- "watch" — on the radar but not yet a thesis-mover. Incremental product news, minor exec changes, sector-wide trends that don't single out this company, ambiguous early signals.
- "deep"  — plausibly material long-term impact OR clear sector spillover candidate. Includes (non-exhaustive): strategic shifts (channel/product/pricing/geography), supply-chain events, regulatory or legal exposure, M&A and partnership news, earnings or guidance moves, leadership changes at critical roles, technology platform shifts, geopolitical exposure, capital allocation pivots, material operational changes, competitive moves with structural implications.

Lean toward "deep" when there's a clear causal mechanism — even if the magnitude is uncertain. The Deep Analyst that runs after this judgment is designed to refine magnitude; you only need to flag plausibility. Reserve "skip" only for stories that genuinely cannot move a long-term thesis.

Be terse. Reason field: 1 sentence, no fluff. longTermAngles: 1-3 short hints if you chose "deep", omit otherwise.`;

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
    temperature: 0,
    maxRetries: 1,
  });

  return object;
}
