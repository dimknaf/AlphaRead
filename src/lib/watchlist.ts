// AlphaRead default watchlist — 15 US-listed large-caps with high news velocity
// + sector diversity, so the DCSC sector-spillover analysis has plenty to chew on.
//
// Sector spread: 6 tech, 1 auto, 3 financials, 2 energy, 2 healthcare, 1 consumer.
// Format: TICKER-US (CityFalcon `full_tickers` identifier scheme — the canonical
// format that works reliably; verified empirically 2026-05-02 against /v0.2/stories).
// Edit the array to change what AlphaRead watches.

export const WATCHLIST = [
  // Tech / AI
  "AAPL-US",   // Apple — supply chain, services
  "MSFT-US",   // Microsoft — cloud, AI, enterprise
  "NVDA-US",   // NVIDIA — AI chip cycle
  "GOOGL-US",  // Alphabet — search, ads, AI
  "AMZN-US",   // Amazon — retail + AWS
  "META-US",   // Meta — social, AR/VR
  // Auto / EV
  "TSLA-US",   // Tesla — auto/EV/energy/AI cross-sector
  // Financials
  "JPM-US",    // JPMorgan Chase — rates-sensitive bank
  "GS-US",     // Goldman Sachs — investment bank
  "BRK.B-US",  // Berkshire Hathaway — Buffett moves, diversified
  // Energy
  "XOM-US",    // Exxon Mobil — oil majors / geopolitics
  "CVX-US",    // Chevron — oil + ME exposure
  // Healthcare / Pharma
  "UNH-US",    // UnitedHealth Group — insurance, regulation
  "LLY-US",    // Eli Lilly — GLP-1, biotech mega-stories
  // Consumer
  "WMT-US",    // Walmart — retail bellwether, supply chain

  // ---------------- Expansion (Sat eve, +30 for higher news velocity) ----------------
  // More tech / software
  "ORCL-US",   // Oracle — enterprise SaaS, cloud
  "CRM-US",    // Salesforce — SaaS bellwether
  "ADBE-US",   // Adobe — creative + AI
  "AMD-US",    // AMD — chip cycle alt to NVDA
  "INTC-US",   // Intel — turnaround story
  "CSCO-US",   // Cisco — enterprise networking
  "AVGO-US",   // Broadcom — AI infra adjacent
  "IBM-US",    // IBM — enterprise + Watson
  // More financials
  "BAC-US",    // Bank of America — consumer bank
  "WFC-US",    // Wells Fargo — regional/national bank
  "MS-US",     // Morgan Stanley — IB + wealth
  "V-US",      // Visa — payments rails
  "MA-US",     // Mastercard — payments rails
  "AXP-US",    // American Express — premium spend
  "BLK-US",    // BlackRock — asset manager, ETF flows
  // More healthcare / pharma
  "PFE-US",    // Pfizer — vaccines, pipeline
  "JNJ-US",    // Johnson & Johnson — diversified pharma
  "ABBV-US",   // AbbVie — Humira / pipeline
  "MRK-US",    // Merck — Keytruda
  "TMO-US",    // Thermo Fisher — life sciences tools
  // More consumer
  "KO-US",     // Coca-Cola — staples, defensive
  "PEP-US",    // PepsiCo — staples + snacks
  "MCD-US",    // McDonald's — global consumer
  "NKE-US",    // Nike — China + brand cycles
  "COST-US",   // Costco — membership economics
  "PG-US",     // Procter & Gamble — consumer staples king
  // Industrials
  "BA-US",     // Boeing — aerospace + safety newsflow
  "CAT-US",    // Caterpillar — global construction cycle
  "UNP-US",    // Union Pacific — rails / freight bellwether
  "F-US",      // Ford — legacy auto + EV transition
] as const;

export type Ticker = (typeof WATCHLIST)[number];

export function pickRandomTicker(): Ticker {
  return WATCHLIST[Math.floor(Math.random() * WATCHLIST.length)];
}
