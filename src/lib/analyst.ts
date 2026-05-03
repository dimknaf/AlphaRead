// Deep Analyst — for each "deep" verdict from the Pre-check Agent, produces
// a structured 5-section AnalysisResult. Single "use step" so it runs in Node
// runtime (with Buffer / fetch / SDK clients all working).
//
// Inside the step: parallel enrichment fetches, then one Claude Sonnet 4.6
// call via Vercel AI Gateway with a Zod schema.

import { generateObject } from "ai";
import { z } from "zod";
import {
  getCompaniesForSector,
  getSectorClassification,
  getSimilarStories,
} from "./cityfalcon";
import type { AnalysisResult, EnrichmentBundle, Story } from "./types";

const ANALYSIS_SCHEMA = z.object({
  oneLineSummary: z.string().max(280),
  magnitude: z.enum(["small", "material", "major"]),
  longTermHorizon: z.enum(["days", "weeks", "months", "quarters", "years"]),
  primaryCompany: z.object({
    ticker: z.string(),
    direction: z.enum(["bullish", "bearish", "neutral"]),
    rationale: z.string().max(800),
    sizingContext: z.string().max(400),
  }),
  spillover: z
    .array(
      z.object({
        sector: z.string(),
        direction: z.enum(["bullish", "bearish", "neutral"]),
        rationale: z.string().max(400),
        candidateTickers: z.array(z.string()).max(8),
      }),
    )
    .max(5),
  signalVsNoise: z.object({
    marketIsMissing: z.array(z.string()).max(3),
    marketIsOverreacting: z.array(z.string()).max(3),
  }),
  watchFlags: z
    .array(
      z.object({
        flag: z.string().max(200),
        horizon: z.enum(["hours", "days", "weeks", "months"]),
      }),
    )
    .min(1)
    .max(3),
});

const SYSTEM = `You are a sell-side equity analyst writing a structured impact note for AlphaRead, a deep-impact research tool for long-horizon investors.

You will be given:
- The original news story (title, description, source, ticker, sentiment).
- Related coverage (up to 5 similar stories from CityFalcon).
- Sector classification for the primary company (from CityFalcon DCSC).
- Adjacent companies in those sectors (potential spillover candidates from CityFalcon DCSC smart_portfolio).

Your job is to produce a structured analyst note focused on LONG-TERM IMPACT, not headline reaction.

Be precise about:
- Magnitude: "small" = won't move the thesis, "material" = a few weeks of attention, "major" = re-rating event.
- Horizon: how long the effect plays out.
- Sector spillover: which OTHER named companies could be affected and why.
- Signal vs noise: what is the market missing OR over-reacting to right now?
- Watch flags: 1-3 forward-looking things to monitor in the next hours/days/weeks.

Be concise. Avoid corporate-speak. Quote specific numbers when the data supports it; don't make up numbers.`;

/** CityFalcon stories include both company names and exchange-formatted
 * tickers in `assetTags` — e.g. ["Boeing Co", "BOEI BRU", "BA NYSE", "BA US",
 * "BCO XETRA", ...]. Picking `assetTags[0]` gives "Boeing Co" which DCSC's
 * full_ticker endpoint won't match (it expects "BA-US"). Find a US-listed
 * symbol formatted "<symbol> US" and convert to dash form for DCSC. */
function pickTickerForDcsc(assetTags: string[]): string | null {
  const usListing = assetTags.find((t) => /^[A-Z.]+ US$/.test(t));
  return usListing ? usListing.replace(/\s+/g, "-") : null;
}

async function gatherEnrichment(story: Story): Promise<EnrichmentBundle> {
  // Parallel fetches; tolerate per-call failure (don't block the analyst).
  const ticker = pickTickerForDcsc(story.assetTags);
  const settled = await Promise.allSettled([
    getSimilarStories(story.uuid, 3),
    ticker ? getSectorClassification(ticker) : Promise.resolve({ relevant_sectors: [] }),
  ]);

  const similarStories =
    settled[0].status === "fulfilled"
      ? settled[0].value.slice(0, 3).map((s) => ({
          title: s.title,
          source: s.source.name,
          uuid: s.uuid,
          url: s.url,
          publishTime: s.publishTime,
        }))
      : [];

  // The DCSC API field is `relevant_sectors` (verified live), NOT
  // `classification`. The `type` field is a string like "Level 4" — parse to
  // a number for downstream consumers. Without this fix every analyser run
  // logged `sectors: 0` because we were reading a non-existent field.
  const sectors =
    settled[1].status === "fulfilled"
      ? (settled[1].value.relevant_sectors ?? [])
          .filter((s) => (s.relevance ?? 0) >= 30)
          .slice(0, 3)
          .map((s) => ({
            name: s.name,
            slug: s.slug,
            level: parseInt((s.type ?? "Level 0").replace("Level ", ""), 10) || 0,
          }))
      : [];

  // Fetch adjacent companies for the top sector (level 2 typically), if any.
  let adjacentCompanies: EnrichmentBundle["adjacentCompanies"] = [];
  if (sectors[0]) {
    try {
      const r = await getCompaniesForSector(sectors[0].slug, sectors[0].level, {
        maxSecurities: 4,
      });
      adjacentCompanies = (r.portfolio ?? [])
        .filter((c) => c.ticker && c.ticker !== ticker)
        .slice(0, 4)
        .map((c) => ({ name: c.name, ticker: c.ticker, sector: sectors[0].name }));
    } catch {
      // ignore
    }
  }

  return { similarStories, sectors, adjacentCompanies };
}

export async function analyzeNewsImpact(
  story: Story,
): Promise<{ analysis: AnalysisResult; enrichment: EnrichmentBundle }> {
  "use step";

  const tEnrichStart = Date.now();
  const enrichment = await gatherEnrichment(story);
  console.log("[analyze:enrich] done", {
    uuid: story.uuid,
    ms: Date.now() - tEnrichStart,
    similar: enrichment.similarStories.length,
    sectors: enrichment.sectors.length,
    adjacent: enrichment.adjacentCompanies.length,
  });

  const userMsg = `# Story
Tickers: ${story.assetTags.join(", ") || "(none)"}
Source: ${story.source.name}
Sentiment: ${story.sentiment} (CityFalcon score ${story.cityfalconScore}, duplicates ${story.duplicatesCount})
Published: ${story.publishTime}
Title: ${story.title}
Description: ${story.description}

# Related coverage (CityFalcon similar_stories, top 3)
${
  enrichment.similarStories.length
    ? enrichment.similarStories.map((s) => `- "${s.title}" (${s.source})`).join("\n")
    : "(none)"
}

# Sector classification (CityFalcon DCSC)
${
  enrichment.sectors.length
    ? enrichment.sectors.map((s) => `- ${s.name} (level ${s.level})`).join("\n")
    : "(no DCSC data)"
}

# Adjacent companies in primary sector (potential spillover candidates)
${
  enrichment.adjacentCompanies.length
    ? enrichment.adjacentCompanies
        .map((c) => `- ${c.name}${c.ticker ? ` (${c.ticker})` : ""} — ${c.sector}`)
        .join("\n")
    : "(no spillover candidates found)"
}

Now produce the structured analyst note.`;

  // 25s ceiling on the LLM call — if Sonnet hangs, the surrounding
  // analyzeAndRecord try/catch can clean up and move on rather than the
  // workflow burning its whole maxDuration on one call.
  const ctrl = new AbortController();
  const timeoutId = setTimeout(() => ctrl.abort(), 25_000);
  const tLlmStart = Date.now();
  try {
    const { object } = await generateObject({
      model: "anthropic/claude-sonnet-4.6",
      schema: ANALYSIS_SCHEMA,
      system: SYSTEM,
      prompt: userMsg,
      temperature: 0.2,
      maxRetries: 1,
      abortSignal: ctrl.signal,
    });
    console.log("[analyze:llm] done", {
      uuid: story.uuid,
      ms: Date.now() - tLlmStart,
      magnitude: object.magnitude,
    });
    return { analysis: object, enrichment };
  } finally {
    clearTimeout(timeoutId);
  }
}
