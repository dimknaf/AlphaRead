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
] as const;

export type Ticker = (typeof WATCHLIST)[number];

export function pickRandomTicker(): Ticker {
  return WATCHLIST[Math.floor(Math.random() * WATCHLIST.length)];
}
