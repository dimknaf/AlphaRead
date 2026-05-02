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
import type { AnalysisResult, Story } from "./types";

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

type EnrichmentBundle = {
  similarStories: Array<{ title: string; source: string }>;
  sectors: Array<{ name: string; slug: string; level: number }>;
  adjacentCompanies: Array<{ name: string; ticker?: string; sector: string }>;
};

async function gatherEnrichment(story: Story): Promise<EnrichmentBundle> {
  // Parallel fetches; tolerate per-call failure (don't block the analyst).
  const ticker = story.assetTags[0] ?? "";
  const settled = await Promise.allSettled([
    getSimilarStories(story.uuid, 5),
    ticker ? getSectorClassification(ticker) : Promise.resolve({ classification: [] }),
  ]);

  const similarStories =
    settled[0].status === "fulfilled"
      ? settled[0].value.slice(0, 5).map((s) => ({ title: s.title, source: s.source.name }))
      : [];

  const sectors =
    settled[1].status === "fulfilled"
      ? (settled[1].value.classification ?? [])
          .filter((s) => (s.relevance ?? 0) >= 30)
          .slice(0, 3)
          .map((s) => ({ name: s.name, slug: s.slug, level: s.level }))
      : [];

  // Fetch adjacent companies for the top sector (level 2 typically), if any.
  let adjacentCompanies: EnrichmentBundle["adjacentCompanies"] = [];
  if (sectors[0]) {
    try {
      const r = await getCompaniesForSector(sectors[0].slug, sectors[0].level, {
        maxSecurities: 6,
      });
      adjacentCompanies = (r.portfolio ?? [])
        .filter((c) => c.ticker && c.ticker !== ticker)
        .slice(0, 6)
        .map((c) => ({ name: c.name, ticker: c.ticker, sector: sectors[0].name }));
    } catch {
      // ignore
    }
  }

  return { similarStories, sectors, adjacentCompanies };
}

export async function analyzeNewsImpact(story: Story): Promise<AnalysisResult> {
  "use step";

  const enrichment = await gatherEnrichment(story);

  const userMsg = `# Story
Tickers: ${story.assetTags.join(", ") || "(none)"}
Source: ${story.source.name}
Sentiment: ${story.sentiment} (CityFalcon score ${story.cityfalconScore}, duplicates ${story.duplicatesCount})
Published: ${story.publishTime}
Title: ${story.title}
Description: ${story.description}

# Related coverage (CityFalcon similar_stories, top 5)
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

  const { object } = await generateObject({
    model: "anthropic/claude-sonnet-4.6",
    schema: ANALYSIS_SCHEMA,
    system: SYSTEM,
    prompt: userMsg,
    temperature: 0.2,
    maxRetries: 1,
  });

  return object;
}
