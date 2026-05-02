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
- "skip"  — noise, daily price chatter, generic recap, low signal, anything a long-horizon investor can ignore.
- "watch" — mildly relevant; surface on the live feed but no deep dive needed yet. Use this for things that *might* matter but don't yet have a clear causal mechanism.
- "deep"  — potentially material long-term impact OR sector spillover candidate. Reserve this for stories with a real causal mechanism that could matter beyond a daily price move (e.g. supply chain shock, regulatory event, M&A, earnings beat/miss with guidance change, leadership change at a critical role).

Bias toward "skip" for headline noise. Bias toward "deep" only when there's a real reason a long-term investor should care.

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
