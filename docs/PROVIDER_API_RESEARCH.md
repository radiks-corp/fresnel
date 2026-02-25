# AI Provider API Research: Claude Code & OpenAI Codex

## Current Architecture

Fresnel currently uses a single Anthropic API key (the project owner's personal token) to power all AI features:

- **Package**: `@ai-sdk/anthropic` v3.0.34 via Vercel AI SDK (`ai` v6.0.66)
- **Models**: `claude-sonnet-4-6` (chat & review), `claude-sonnet-4-20250514` (summarization)
- **Auth**: `ANTHROPIC_API_KEY` env var, stored in AWS Secrets Manager for production
- **Quota**: 25 completions per user (~$5 of Claude Sonnet usage), tracked in MongoDB
- **Cost**: All usage bills to the project owner's Anthropic account

### Pain Points

1. All AI costs are borne by the project owner's personal Anthropic token
2. Users are capped at 25 completions (hard limit, must email for more)
3. No model/provider choice — everyone uses the same Claude Sonnet model
4. No way for power users to bring their own API keys for unlimited usage

---

## Option 1: Anthropic API (Direct — Current Provider)

### How It Works
Users can get their own API key at [console.anthropic.com](https://console.anthropic.com) and provide it to Fresnel. The backend creates a per-request `createAnthropic({ apiKey })` instance instead of using the default.

### Pricing (per million tokens)
| Model | Input | Output |
|-------|-------|--------|
| Claude Opus 4.6 | $5.00 | $25.00 |
| Claude Sonnet 4.6 | $3.00 | $15.00 |
| Claude Haiku 4.5 | $1.00 | $5.00 |

Cache reads: 0.1x base input price. Cache writes: 1.25x (5-min TTL) or 2x (1-hour TTL).

### Estimated Cost Per User
At current usage patterns (chat + review with thinking enabled on Sonnet 4.6):
- ~$0.20 per completion on average
- 25 completions ≈ $5/user
- Heavy users might spend $20-50/month

### Integration Effort: **Low**
Already using `@ai-sdk/anthropic`. Just need `createAnthropic({ apiKey: userKey })` per request.

### Pros
- Zero new dependencies
- Same model quality users already experience
- Thinking mode, streaming, tool use all work identically
- Anthropic tokenizer already in the codebase for token counting

### Cons
- Single provider — no model diversity
- Users must create an Anthropic account and manage billing

---

## Option 2: OpenAI API (GPT-4.1 / Codex Models)

### How It Works
Users provide their own OpenAI API key. The backend uses `@ai-sdk/openai` (`createOpenAI({ apiKey })`) to route requests through OpenAI's models.

### Available Models & Pricing (per million tokens)
| Model | Input | Output | Best For |
|-------|-------|--------|----------|
| GPT-4.1 | $2.00 | $8.00 | General coding tasks |
| GPT-4.1 Mini | $0.40 | $1.60 | Fast, cheap tasks |
| GPT-4.1 Nano | $0.10 | $0.40 | Summaries, lightweight |
| GPT-5.3-Codex | $1.75 | $14.00 | Specialized code review |
| GPT-5.1-Codex-Mini | $0.25 | $2.00 | Fast code tasks |
| o3 | $2.00 | $8.00 | Deep reasoning |

### Integration Effort: **Medium**
- Add `@ai-sdk/openai` dependency
- System prompts and tool schemas work across providers via Vercel AI SDK
- Need to handle provider-specific options (e.g., Anthropic `thinking` mode has no OpenAI equivalent — would use `o3` reasoning instead)
- Token counting would need a separate tokenizer for OpenAI models (or use approximate counting)

### Pros
- More model variety (fast/cheap options like GPT-4.1 Nano for summaries)
- Some users may already have OpenAI accounts
- Competitive pricing, especially on lower-tier models
- Vercel AI SDK makes provider-swapping straightforward

### Cons
- New dependency (`@ai-sdk/openai`)
- Provider-specific behavior differences (tool calling, streaming format)
- Anthropic's `thinking` mode doesn't have a direct OpenAI equivalent
- Token counting differences (Anthropic tokenizer won't work for OpenAI models)

---

## Option 3: Claude Code SDK (Agent SDK)

### What It Is
The Claude Code Agent SDK provides programmatic access to Claude Code — Anthropic's agentic coding assistant. Available as both Python (`claude-agent-sdk`) and TypeScript SDKs.

### How It Differs from Direct API
- Claude Code is an **agentic tool** — it can execute code, browse files, make edits
- It's designed for autonomous coding tasks, not conversational code review
- Requires Claude Code to be installed and running (CLI-based)
- Pricing is the same as the direct Anthropic API (it uses Claude models under the hood)

### Why It's NOT a Good Fit for Fresnel
1. **Wrong abstraction level**: Fresnel needs conversational AI for PR review, not an autonomous coding agent
2. **Deployment complexity**: Would require Claude Code CLI installed on the server
3. **No cost advantage**: Same token pricing as direct API
4. **Overkill**: Claude Code's file editing, terminal access, etc. are unnecessary for review

### Verdict: **Not recommended** for this use case

---

## Option 4: OpenAI Codex (ChatGPT Plan-Based)

### What It Is
OpenAI Codex is a cloud-based coding agent included in ChatGPT subscriptions (Plus, Pro, Business, Enterprise). It uses GPT-5.x-Codex models.

### How It Differs from OpenAI API
- Accessed through ChatGPT subscriptions, not direct API
- Cloud-based agent that can run in sandboxed environments
- Includes features like code reviews, SDK access, Slack integration
- Usage limits tied to subscription tier, not token-based billing

### Subscription Pricing
| Plan | Price | Local Messages | Cloud Tasks | Code Reviews |
|------|-------|---------------|-------------|--------------|
| Plus | $20/mo | 45-225/5hr | 10-60/5hr | 10-25/week |
| Pro | varies | 300-1500/5hr | 50-400/5hr | 100-250/week |
| Business | ~$25/mo | Similar to Plus | Similar to Plus | Similar to Plus |
| Enterprise | Custom | No fixed limits | No fixed limits | No fixed limits |

### Why It's NOT Directly Usable
1. **No direct API access for integration**: Codex is accessed through ChatGPT UI or the Codex SDK, not a general-purpose API endpoint that Fresnel's backend could call
2. **The Codex SDK** is designed for Codex-specific workflows (file operations, terminal commands), not general streaming text generation
3. **However**, the underlying models (GPT-5.x-Codex) ARE accessible via the standard OpenAI API with pay-per-token pricing

### Verdict: **Use OpenAI API directly** with Codex models, not the Codex platform itself

---

## Recommended Implementation: BYOK (Bring Your Own Key)

### Architecture

```
┌─────────────────────────────────────────────────┐
│                   Frontend                       │
│                                                  │
│  Settings UI:                                    │
│  ┌─────────────────────────────────────────┐    │
│  │ AI Provider: [Fresnel Default ▼]        │    │
│  │              [Anthropic (own key)]      │    │
│  │              [OpenAI (own key)]         │    │
│  │                                         │    │
│  │ API Key: [••••••••••••••••]             │    │
│  │                                         │    │
│  │ Model:   [claude-sonnet-4-6 ▼]         │    │
│  └─────────────────────────────────────────┘    │
│                                                  │
│  Key stored in localStorage (never sent to DB)   │
│  Sent per-request via header                     │
└──────────────────────┬──────────────────────────┘
                       │ X-AI-Provider: anthropic
                       │ X-AI-API-Key: sk-ant-...
                       │ X-AI-Model: claude-sonnet-4-6
                       ▼
┌─────────────────────────────────────────────────┐
│                   Backend                        │
│                                                  │
│  resolveModel(req):                              │
│  ├─ Has X-AI-Provider header?                    │
│  │  ├─ anthropic → createAnthropic({ apiKey })  │
│  │  └─ openai    → createOpenAI({ apiKey })     │
│  └─ No header → use default anthropic()          │
│                                                  │
│  Quota: Only checked for "default" provider      │
│  BYOK users: unlimited (they pay their own bill) │
└─────────────────────────────────────────────────┘
```

### Implementation Plan

#### Phase 1: Backend Provider Abstraction (This PR)
1. Add `@ai-sdk/openai` dependency
2. Create `resolveModel()` helper that reads provider/key/model from request headers
3. Update all 3 AI endpoints to use `resolveModel()` instead of hardcoded `anthropic()`
4. Skip quota check when user provides their own key
5. Handle provider-specific options (thinking mode for Anthropic, reasoning for OpenAI o-series)

#### Phase 2: Frontend Settings UI (This PR)
1. Add provider settings to the profile dropdown or a new settings modal
2. Store API key in localStorage only (never persisted server-side)
3. Send provider/key/model via custom headers on AI requests
4. Update quota display to show "Using own key" when BYOK is active
5. Update quota-exceeded modal to suggest BYOK as an alternative

#### Security Considerations
- API keys are stored in localStorage only — never sent to the database
- Keys are transmitted per-request via HTTPS headers
- The backend uses the key for that single request and discards it
- Keys are never logged (Sentry/console scrubbing)
- The `X-AI-API-Key` header should be stripped from any error reports

### Model Mapping

| Use Case | Anthropic (Default) | Anthropic (BYOK) | OpenAI (BYOK) |
|----------|-------------------|------------------|----------------|
| Chat | claude-sonnet-4-6 | User's choice | gpt-4.1 / o3 |
| Review | claude-sonnet-4-6 | User's choice | gpt-4.1 / gpt-5.3-codex |
| Summary | claude-sonnet-4-20250514 | Same model or haiku | gpt-4.1-nano / gpt-4.1-mini |
