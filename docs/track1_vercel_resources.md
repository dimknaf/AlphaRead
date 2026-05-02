# Track 1 — Vercel Resources & WDK Reference

> **Decision: We are going Track 1 — Vercel Workflow Development Kit (WDK).**

This file holds the verbatim source material for the Vercel + WDK side of the hackathon, followed by my own perception/recommendations clearly separated below a horizontal rule.

---

## Source 1 — Vercel Hackathon Resources page

**URL:** [vercel.notion.site/02agentresources](https://vercel.notion.site/02agentresources)
**Fetched:** 2026-05-02 via Playwright (the page is a Notion JS-rendered SPA so plain HTTP fetches return an empty shell).

### Page intro (verbatim)

> **Hackathon Resources — Vercel Agent Tracks**
> Everything you need to ship an AI or Agent powered project across our three hackathon tracks. Docs, templates, quickstarts, and pro tips.

### General Resources (verbatim table)

| Resource | Link |
|---|---|
| Vercel Docs | [vercel.com/docs](https://vercel.com/docs) |
| Vercel AI Platform | [vercel.com/ai](https://vercel.com/ai) |
| AI Templates Gallery | [vercel.com/templates/ai](https://vercel.com/templates/ai) |
| AI SDK Docs | [ai-sdk.dev/docs](https://ai-sdk.dev/docs) |
| v0 (ask v0 about anything Vercel) | [v0.app](https://v0.app/) |
| AI SDK | [ai-sdk.dev](https://ai-sdk.dev/) |
| Agents Docs | [ai-sdk.dev/docs/agents](https://ai-sdk.dev/docs/ai-sdk-core/agents) |
| MCP Docs | [vercel.com/docs/mcp](https://vercel.com/docs/mcp) and [v0.app/docs/MCP](https://v0.app/docs/MCP) |
| Integrations | [vercel.com/integrations](https://vercel.com/integrations) |
| Agent Skills & Resources | [vercel.com/docs/agent-resources](https://vercel.com/docs/agent-resources) |
| Vercel Plugin (for coding agents) | "Use this to maximize building on Vercel with best practices" |
| Sandbox | [vercel.com/docs/sandbox](https://vercel.com/docs/functions/sandbox) |
| Workflow SDK | [useworkflow.dev](https://useworkflow.dev/) (redirects to [workflow-sdk.dev](https://workflow-sdk.dev/)) |
| AI Gateway & Models | [vercel.com/ai-gateway/models](https://vercel.com/ai-gateway/models) |
| AI SDK 6 Announcement | [vercel.com/blog/ai-sdk-6](https://vercel.com/blog/ai-sdk-6) |
| llms.txt (feed to your LLM) | [ai-sdk.dev/llms.txt](https://ai-sdk.dev/llms.txt) |
| vercel/ai GitHub | [github.com/vercel/ai](https://github.com/vercel/ai) |

### Learning (verbatim table)

| Resource | Link |
|---|---|
| Vercel Academy | [vercel.com/academy](https://vercel.com/academy) |
| AI SDK Course | [vercel.com/academy/ai-sdk](https://vercel.com/academy/ai-sdk) |
| AI Summary App Course | [vercel.com/academy/ai-summary-app-with-nextjs](https://vercel.com/academy/ai-summary-app-with-nextjs) |
| Building AI Agents Guide | [vercel.com/kb/guide/how-to-build-ai-agents](https://vercel.com/kb/guide/how-to-build-ai-agents-with-vercel-and-the-ai-sdk) |

### Track 1: Vercel Workflow (WDK) — verbatim

> Build long-running, durable async agents with the Workflow Development Kit.
>
> Your agents survive crashes, resume after deploys, and can pause for minutes or months. Use `"use workflow"` and `"use step"` directives to make async functions durable. Pair with `DurableAgent` from `@workflow/ai/agent` for AI-powered workflows with built-in streaming, retries, and observability.

#### Track 1 Quick Start (verbatim, 7 steps)

1. Scaffold a Next.js app: `npx create-next-app@latest --no-src-dir`
2. Add WDK: `npx workflow@latest`
3. Wrap your Next.js config: `export default withWorkflow(nextConfig)`
4. Create workflow functions with `"use workflow"` and steps with `"use step"`
5. Use `DurableAgent` from `@workflow/ai/agent` for AI agent workflows
6. Get a Gateway API key from the Vercel AI Gateway
7. Deploy to Vercel — it auto-provisions queues, persistence, and routing

#### Track 1 Key Resources (verbatim table)

| Resource | Type | Link |
|---|---|---|
| Workflow SDK Docs | Docs | [useworkflow.dev](https://useworkflow.dev/) |
| Workflow on Vercel | Docs | [vercel.com/docs/workflow](https://vercel.com/docs/workflow) |
| Building Durable AI Agents | Guide | [useworkflow.dev/docs/ai](https://useworkflow.dev/docs/ai) |
| vercel/workflow | Repo | [github.com/vercel/workflow](https://github.com/vercel/workflow) |
| Introducing WDK | Blog | [vercel.com/blog/introducing-workflow](https://vercel.com/blog/introducing-workflow) |
| Agent Patterns | Patterns | [aisdkagents.com/explore/ai-agent-frameworks](https://www.aisdkagents.com/explore/ai-agent-frameworks) |

### Track 2: v0 + MCPs — verbatim (for reference, not chosen)

> Use v0 to rapidly build an AI app or agent that connects to at least one MCP server.
>
> v0 generates React/Next.js code from natural language — describe what you want and iterate in real time. Connect to MCP servers (Vercel MCP, custom-built, or third-party) to give your app access to external data and tools. Examples: a dashboard that reads from GitHub via MCP, an assistant that queries your Vercel deployments, or a support agent wired to a knowledge base.

### Track 3: ChatSDK Agents — verbatim (for reference, not chosen)

> Build agents using Vercel AI SDK + AI Gateway + ChatSDK that interface across Slack, Discord, Teams, GitHub, and more.
>
> Write your bot logic once with the Chat SDK (`npm i chat`), then deploy to every platform via swappable adapters. The SDK handles event routing, streaming, JSX cards, and distributed state. Pair with the AI SDK for LLM reasoning and the AI Gateway for multi-provider access.

### Hackathon Pro Tips (verbatim, all six)

> **Use the AI Gateway** — Skip managing individual API keys. One endpoint for OpenAI, Anthropic, Google, and more with built-in fallbacks. Just pass model strings like `'anthropic/claude-sonnet-4-6'`.
>
> **Add the Vercel Plugin + Skills** — If you're using a coding agent (Claude Code, Cursor, etc.), add the Vercel plugin skill to your project for best-practice guidance. Run `npx skills add vercel/chat` for ChatSDK or equivalent for WDK skills.
>
> **Feed llms.txt to your LLM** — The full AI SDK docs are available as one Markdown file at [ai-sdk.dev/llms.txt](https://ai-sdk.dev/llms.txt). Feed it to your LLM for accurate, up-to-date code generation.
>
> **Start from a template if you are stuck** — Clone the Chatbot template, Knowledge Agent template, or a WDK example and customize.
>
> **Use AI SDK DevTools** — AI SDK 6 has built-in DevTools for debugging multi-step agent flows. Full visibility into LLM calls, tool use, and trajectories.
>
> **Deploy early, iterate fast** — Push to Vercel after your first working feature. Every git push creates a preview deployment you can share with teammates and judges.
>
> Happy hacking! Questions? Hit up the Vercel Community.

---

## Source 2 — Vercel Agent Resources docs

**URL:** [vercel.com/docs/agent-resources](https://vercel.com/docs/agent-resources)
**Last updated (per page frontmatter):** 2026-02-27

### Summary (verbatim)

> Vercel provides resources to help you build AI-powered applications and work more effectively with AI coding assistants. Access documentation in machine-readable formats, connect AI tools directly to Vercel, and install agent skills for specialized capabilities.

### llms-full.txt

> The `llms-full.txt` file provides a comprehensive, machine-readable version of Vercel's documentation optimized for large language models.
>
> **URL:** [https://vercel.com/docs/llms-full.txt](https://vercel.com/docs/llms-full.txt)
>
> Use this file to give AI assistants full context about Vercel's platform, features, and best practices.

### Markdown Access (verbatim)

> Every documentation page is available as markdown. This makes it simple to feed specific documentation into AI tools.
>
> See [Markdown Access](https://vercel.com/docs/agent-resources/markdown-access) for details on:
> - Accessing any page with the `.md` extension
> - Using the "Copy as Markdown" button
> - Feeding documentation to AI assistants

### Vercel MCP server (verbatim)

> The [Vercel MCP server](https://vercel.com/docs/agent-resources/vercel-mcp) connects AI assistants directly to your Vercel account using the Model Context Protocol. This lets AI tools:
> - Search Vercel documentation
> - List and manage your projects
> - View deployment details and logs
> - Check domain availability

### Coding agents (verbatim)

> Connect terminal and editor-based coding agents such as Claude Code, OpenAI Codex, Cline, and Roo Code to AI Gateway.
>
> See [Coding Agents](https://vercel.com/docs/ai-gateway/coding-agents) for setup guides and configuration examples.

### Skills.sh (verbatim)

> Skills.sh is the open ecosystem for reusable AI agent capabilities. Skills are procedural knowledge packages that enhance AI coding assistants with specialized expertise.
>
> Install skills with a single command:
> ```bash
> npx skills add <owner/repo>
> ```
>
> Skills.sh supports 18+ AI agents including Claude Code, GitHub Copilot, Cursor, Cline, and many others. The directory contains skills covering:
> - Framework-specific guidance (React, Vue, Next.js, and more)
> - Development tools (testing, deployment, documentation)
> - Specialized domains (security, infrastructure, marketing)

### Vercel Plugin install command (from page frontmatter)

> `npx plugins add vercel/vercel-plugin`

### CLI workflows (verbatim list)

> End-to-end workflows that show AI agents how to compose Vercel CLI commands into complete work sessions. Each workflow covers a full task from start to finish, including the reasoning between steps.
>
> See [CLI Workflows](https://vercel.com/docs/agent-resources/workflows) for the full list, including:
> - [Debugging production 500 errors](https://vercel.com/docs/observability/debug-production-errors)
> - [Rolling back a production deployment](https://vercel.com/docs/deployments/rollback-production-deployment)
> - [Debugging slow Vercel Functions](https://vercel.com/docs/functions/debug-slow-functions)
> - [Deploying a project from the CLI](https://vercel.com/docs/projects/deploy-from-cli)

---

## Source 3 — Workflow SDK docs

**URL:** [workflow-sdk.dev/docs/ai](https://workflow-sdk.dev/docs/ai) (redirected from [useworkflow.dev/docs/ai](https://useworkflow.dev/docs/ai))

### Install (verbatim)

```bash
npm i workflow @workflow/ai
```

Alternatives:
- `pnpm add workflow @workflow/ai`
- `yarn add workflow @workflow/ai`
- `bun add workflow @workflow/ai`

### `next.config.ts` wrapping (verbatim)

```typescript
import { withWorkflow } from "workflow/next";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ... rest of your Next.js config
};

export default withWorkflow(nextConfig);
```

### Minimal `DurableAgent` example (verbatim)

```typescript
import { DurableAgent } from "@workflow/ai/agent";
import { getWritable } from "workflow";

export async function chatWorkflow(messages: ModelMessage[]) {
  "use workflow";
  const writable = getWritable<UIMessageChunk>();
  const agent = new DurableAgent({
    model: "bedrock/claude-4-5-haiku-20251001-v1",
    instructions: FLIGHT_ASSISTANT_PROMPT,
    tools: flightBookingTools,
  });
  await agent.stream({ messages, writable });
}
```

### Environment variables (verbatim)

- **Gateway approach:** `GATEWAY_API_KEY=...`
- **Custom provider (OpenAI example):** `OPENAI_API_KEY=...`

### Model string format (verbatim from example)

`"bedrock/claude-4-5-haiku-20251001-v1"` — pass the model as a string directly to `DurableAgent`; the Gateway handles provider routing automatically.

---

## All key links (consolidated, verbatim)

**Vercel core:**
- [vercel.com](https://vercel.com/)
- [vercel.com/docs](https://vercel.com/docs)
- [vercel.com/ai](https://vercel.com/ai)
- [vercel.com/ai-gateway](https://vercel.com/ai-gateway)
- [vercel.com/ai-gateway/models](https://vercel.com/ai-gateway/models)
- [vercel.com/templates/ai](https://vercel.com/templates/ai)
- [vercel.com/docs/agent-resources](https://vercel.com/docs/agent-resources)
- [vercel.com/docs/agent-resources/skills](https://vercel.com/docs/agent-resources/skills)
- [vercel.com/docs/agent-resources/vercel-mcp](https://vercel.com/docs/agent-resources/vercel-mcp)
- [vercel.com/docs/agent-resources/markdown-access](https://vercel.com/docs/agent-resources/markdown-access)
- [vercel.com/docs/agent-resources/workflows](https://vercel.com/docs/agent-resources/workflows)
- [vercel.com/docs/ai-gateway/coding-agents](https://vercel.com/docs/ai-gateway/coding-agents)
- [vercel.com/docs/llms-full.txt](https://vercel.com/docs/llms-full.txt)
- [vercel.com/docs/mcp](https://vercel.com/docs/mcp)
- [vercel.com/docs/workflow](https://vercel.com/docs/workflow)
- [vercel.com/docs/sandbox](https://vercel.com/docs/functions/sandbox)
- [vercel.com/integrations](https://vercel.com/integrations)
- [vercel.com/blog/ai-sdk-6](https://vercel.com/blog/ai-sdk-6)
- [vercel.com/blog/introducing-workflow](https://vercel.com/blog/introducing-workflow)
- [vercel.com/blog/chat-sdk-brings-agents-to-your-users](https://vercel.com/blog/chat-sdk-brings-agents-to-your-users)
- [vercel.com/academy](https://vercel.com/academy)
- [vercel.com/academy/ai-sdk](https://vercel.com/academy/ai-sdk)
- [vercel.com/academy/ai-summary-app-with-nextjs](https://vercel.com/academy/ai-summary-app-with-nextjs)
- [vercel.com/kb/guide/how-to-build-ai-agents-with-vercel-and-the-ai-sdk](https://vercel.com/kb/guide/how-to-build-ai-agents-with-vercel-and-the-ai-sdk)

**WDK / Workflow:**
- [useworkflow.dev](https://useworkflow.dev/) (redirects to workflow-sdk.dev)
- [workflow-sdk.dev/docs/ai](https://workflow-sdk.dev/docs/ai)
- [github.com/vercel/workflow](https://github.com/vercel/workflow)

**AI SDK:**
- [ai-sdk.dev](https://ai-sdk.dev/)
- [ai-sdk.dev/docs](https://ai-sdk.dev/docs)
- [ai-sdk.dev/docs/ai-sdk-core/agents](https://ai-sdk.dev/docs/ai-sdk-core/agents)
- [ai-sdk.dev/docs/ai-sdk-core/mcp](https://ai-sdk.dev/docs/ai-sdk-core/mcp)
- [ai-sdk.dev/llms.txt](https://ai-sdk.dev/llms.txt)
- [github.com/vercel/ai](https://github.com/vercel/ai)

**v0:**
- [v0.app](https://v0.app/)
- [v0.app/docs/MCP](https://v0.app/docs/MCP)

**ChatSDK (Track 3 reference):**
- [chat-sdk.dev](https://chat-sdk.dev/)
- [github.com/vercel/chat](https://github.com/vercel/chat)
- [vercel.com/templates/nuxt/chat-sdk-knowledge-agent](https://vercel.com/templates/nuxt/chat-sdk-knowledge-agent)
- [github.com/vercel-labs/community-agent-template](https://github.com/vercel-labs/community-agent-template)

**Patterns / community:**
- [aisdkagents.com/explore/ai-agent-frameworks](https://www.aisdkagents.com/explore/ai-agent-frameworks)
- [community.vercel.com](https://community.vercel.com/)

---
---

## MY PERCEPTION (clearly separated from source above)

Below this divider is *not* from Vercel — it's my recommendation/interpretation. Treat the section above as canonical; this section is opinion.

### Why Track 1 fits a financial-data background
Track 1 (durable async agents) is the closest fit for the kind of multi-step, long-running, retry-prone work that's common in financial intelligence: scheduled SEC filing pulls, multi-source company research, earnings monitoring across hours/days. The "pause for minutes or months" feature is exactly what would normally require a separate scheduler + queue + state store; WDK collapses all of that into a single TypeScript file.

### Recommended models (via AI Gateway)
- **Reasoning / `DurableAgent` brain:** `anthropic/claude-sonnet-4-6` — strongest current price/perf for analytical work.
- **Per-step extraction (cheap, parallel):** `anthropic/claude-haiku-4-5-20251001` — fast, cheap, good at structured-output tasks.
- The official WDK example uses `bedrock/claude-4-5-haiku-20251001-v1` (same model, Bedrock route). The `anthropic/...` prefix in the Gateway is the more direct Anthropic route — should work identically since both point at Claude.

### Caveat: WDK skill slug
The Vercel docs list a "Workflow" skill *category* but don't publish an exact slug for `npx skills add`. The pro tip explicitly mentions `npx skills add vercel/chat` (for ChatSDK / Track 3) but doesn't give the WDK equivalent. Plan: run `npx skills find workflow` at setup time to discover the actual slug rather than guessing.

### Vercel Plugin vs Skill — what's the difference?
- `npx plugins add vercel/vercel-plugin` — general Vercel best-practices for any coding agent.
- `npx skills add <owner/repo>` — narrower, packaged "procedural knowledge" for a specific capability.
For Track 1, install both (the plugin for general guidance, the workflow skill once located).

### Init path recommendation
Stay in Claude Code for scaffolding + WDK wiring. v0 is a UI generator — use it surgically (prompt → copy JSX → paste) rather than as the project root. v0 doesn't know about WDK directives and would fight us if it owned the repo.

### Feed llms-full.txt early
The Vercel pro tip about feeding `llms.txt` is real and worth doing on day one — it gives the LLM accurate, up-to-date context for code generation. Same for `vercel.com/docs/llms-full.txt`. Stash both URLs in CLAUDE.md so future sessions know to reference them.
