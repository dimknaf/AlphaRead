# Mubit Reference Guide (Stretch Add-On)

> **We are going Track 1 — Vercel WDK. Mubit is a STRETCH add-on; integrate only if time permits.**

Context: $10k Mubit credits per guest, separate $100k Mubit-only track prize. This file holds verbatim source material on Mubit, followed by my own perception/recommendations clearly separated below a horizontal rule. Today: 2026-05-02.

---

## Source — What Mubit is

**URLs:**
- [mubit.ai](https://mubit.ai/)
- [docs.mubit.ai/introduction](https://docs.mubit.ai/introduction)

**Fetched:** 2026-05-02

### From mubit.ai marketing page (verbatim)

> "Built to make agents smarter every run, Mubit is the best way to run production AI agents."
>
> "Execution memory SDK — captures what your agents did, what failed, and what worked, then injects it into the next run automatically."
>
> "Observability tells you what happened. Mubit makes sure the agent remembers."

### From docs.mubit.ai (verbatim)

> "MuBit enables continual learning for AI agents, powered by durable memory and cross-agent knowledge sharing."

---

## Source — Memory model

**URL:** [docs.mubit.ai/introduction](https://docs.mubit.ai/introduction) and [mubit.ai](https://mubit.ai/)
**Fetched:** 2026-05-02

### Loop and abstraction (verbatim)

> "Every interaction becomes memory. MuBit extracts lessons from what worked and what didn't."
>
> "Token-budgeted context assembly gives your LLM exactly the right facts, lessons, and rules — no overflow, no guessing."

### Four mechanisms (verbatim from marketing site)

> Recall, Shared State, Execution Context, Audit Trail.

### Memory entry typing (verbatim)

> Memory entries are typed: facts, lessons, rules, traces.
>
> Retrieval modes: semantic search, exact references, checkpoints, rule/lesson overlays.

### Transports (verbatim)

> HTTP routes `/v2/control/*`, `/v2/core/*`; gRPC `mubit.v1.ControlService`.

---

## Source — Code example (Node / TypeScript)

**URL:** [docs.mubit.ai/getting-started](https://docs.mubit.ai/getting-started)
**Fetched:** 2026-05-02

### Install (verbatim)

```bash
npm install @mubit-ai/sdk
```

(Yarn / pnpm / bun / deno variants also documented.)

### Minimal Node.js example (verbatim)

```javascript
import { Client } from "@mubit-ai/sdk";
const client = new Client();
await client.remember({ session_id: "hello-1", content: "Mubit works.", intent: "fact" });
console.log(await client.recall({ session_id: "hello-1", query: "Does Mubit work?" }));
```

### Vercel AI SDK adapter — verbatim integration index entry

> "Vercel AI SDK (JS) — middleware wrapper"

(Source: docs.mubit.ai integrations index. The dedicated page for the Vercel AI SDK adapter returned 404 at fetch time, so the exact middleware shape is not verbatim-quotable from public docs as of 2026-05-02.)

---

## Source — Auth & env vars

**URL:** [docs.mubit.ai/getting-started](https://docs.mubit.ai/getting-started)
**Fetched:** 2026-05-02

### Verbatim

> Env var: `MUBIT_API_KEY` (format `mbt_<instance>_<key_id>_<secret>`).
>
> Header: `Authorization: Bearer <api_key>`.
>
> Endpoints: `MUBIT_ENDPOINT=https://api.mubit.ai`, gRPC `grpc.api.mubit.ai:443`, transport selector `MUBIT_TRANSPORT=auto`.
>
> Server-side only.

---

## Source — Pricing / what $10k buys

**URL:** [mubit.ai](https://mubit.ai/) pricing copy
**Fetched:** 2026-05-02

### Verbatim

> "Flat, predictable. No GPU costs or per-token billing."

**Honest gap (not from source):** No public tier table or per-call/per-MB unit price exists on the public pricing page. What $10k of platform credits actually buys in concrete units is **not verifiable from public docs as of 2026-05-02** — confirm with the Mubit rep at the event.

---
---

## MY PERCEPTION (clearly separated from source above)

Below this divider is *not* from Mubit — it's my recommendation/interpretation. Treat the section above as canonical; this section is opinion.

### Minimum-viable integration plan (if time permits)

For our news-monitoring agent (CityFalcon trigger → durable analysis), the cleanest single hook point is:

- **Before** the deep-analysis `"use step"`: call `client.recall({ session_id: company_ticker, query: <news_category> })` to pull lessons/rules/facts for that company + news type. Inject the top-K results into the `DurableAgent` system prompt as compressed context.
- **After** the deep-analysis step (and ideally after a downstream signal — e.g. "did the prediction pan out N hours later?") call `client.remember({ session_id, content, intent })` with a typed entry:
  - **trace** — full run inputs + outputs + outcome.
  - **lesson** — e.g. "source X is unreliable for M&A rumors on company Y".
  - **fact** — per-company quirks ("Company Z always pre-announces by 48h").
  - **rule** — "ignore press releases tagged 'forward-looking' before 9am ET".

Keep it scoped to ONE hook point. Don't try to wire reflection + handoffs + lane isolation in 60 minutes.

### Time estimate

- **Happy path** (docs accurate, TS SDK works as advertised, Vercel AI SDK middleware ships out of the box): **30-60 min** to bolt on read+write around the deep-analysis step.
- **If unknowns hit** (404'd Vercel adapter page, schema confusion, gRPC vs HTTP transport quirks on Vercel serverless): **2-3 hours** — kills it as a hack-day add-on.
- **Recommendation:** only attempt if WDK build is shippable with **60+ min to spare** before the 19:30 hard stop. Otherwise skip and use Mubit credits as gravy in the demo narrative.

### Is the $100k Mubit-only track worth pivoting toward?

**Almost certainly no.** Reasoning:
- Pivoting means abandoning Track 1's WDK durability angle, which is *our* differentiator.
- The Mubit-only track demands Mubit be the centerpiece, not a bolt-on. To win it you have to be best-of-Mubit AND nail their specific pitch (memory-driven accuracy improvement over runs).
- Our concept (news monitoring for ~10 companies on a single hack day) won't generate enough runs to demonstrate "improves accuracy after each run" — judges would see one or two runs, not a learning curve.
- Expected value: $100k * P(win) where P(win) is hard to estimate but likely <5% in a single-sponsor hackathon track. Better EV in shipping a polished Track 1 entry that gets Mubit credits as part of the local 1st prize ($250 Claude credits via Mubit).

### Risks

- **Latency in agent loop:** every retrieve adds a round-trip before the LLM call. With multi-step DurableAgent flow, even +100ms per step can add up to a noticeably slower demo.
- **Undocumented Vercel AI SDK adapter:** integrations index lists it; dedicated page 404s. We may end up writing the middleware ourselves around `wrapLanguageModel({ model, middleware })`.
- **Vendor lock:** memory format is proprietary; if we encode core domain knowledge into Mubit's typed-entry schema we can't easily migrate. Mitigation — wrap reads/writes behind our own thin interface so the implementation is swappable.
- **Quota burn:** with $10k credits and no public per-call pricing, we can't predict whether one demo run consumes $1 or $100 of credits. Set up usage alerts in the Mubit dashboard before the live demo.
- **gRPC transport on Vercel serverless** may not work cleanly — pin `MUBIT_TRANSPORT=http`.

### What I couldn't verify

- Actual per-call or per-MB pricing — none published, so $10k credit value is unknown.
- Whether the Vercel AI SDK adapter actually exists as a working npm package or is just a planned/advertised integration (the dedicated docs page 404s).
- Whether the "3 lines of code" claim holds for the TypeScript SDK specifically vs only the Python one — the basic Node example is ~3-4 lines, technically defensible, but real-world wiring (auth, retrieve params, write schema) will be more like 5-10 lines per hook point.
- Latency profile — no published p50/p99.
- Whether typed-entry abstractions (facts vs lessons vs rules vs traces) are actual SDK constructs or marketing taxonomy.

### Bottom line

Mubit is a clean, narrowly-scoped memory SDK. Wire it in at the very end, around the deep-analysis step, only if WDK is shippable with time to spare. Do not pivot to the Mubit-only track — a single demo day can't show the learning curve their pitch is built around.
