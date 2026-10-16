# Open-source component selection for Mini AI

This is a selection guide, not a claim that these dependencies are already installed.

| Concern | Candidate | Decision for this project |
|---|---|---|
| MCP protocol | Official Model Context Protocol SDK | Prefer the official SDK for the next hardening pass; the current route is a small JSON-RPC foundation and must pass real client compatibility tests. |
| Durable background jobs | Trigger.dev or Temporal | Evaluate one after choosing the hosting model. Do not run long-lived loops inside a short-lived serverless request. |
| Agent workflow/state | LangGraph or a small explicit state machine | Start with explicit persisted states; adopt a framework only when branching/recovery complexity justifies it. |
| Model provider abstraction | Vercel AI SDK plus provider adapters, or LiteLLM as a separate gateway | Choose one routing layer, not both by default. API credentials and billing are separate from consumer app subscriptions. |
| Persistence | PostgreSQL | Already supported by the repository's postgres dependency. Production configuration and migrations still need to be added. |
| Hosting | Vercel for the web/API surface; a durable worker platform if needed | Vercel project access is currently not verified in the connected account. |
| Monitoring | Structured logs and OpenTelemetry-compatible tracing | Add after the first end-to-end task path exists; redact secrets and sensitive prompt content. |

## Integration principles

1. Reuse maintained packages instead of copying entire unrelated applications into this repository.
2. Verify each project's current license, maintenance activity, runtime requirements, and hosting costs before adoption.
3. Avoid duplicate queue, model-routing, or workflow frameworks with overlapping responsibilities.
4. Keep external tool calls behind a typed adapter and explicit allowlist.
5. Treat all model output and tool output as untrusted data.
6. Require user approval for destructive or externally visible actions.
7. Never mark work completed without verifying its acceptance criteria.

## Adoption order

1. Finish and test the MCP contract with an actual MCP client.
2. Provision PostgreSQL only after selecting a region and reviewing the provider's pricing/limits.
3. Add one durable worker and bounded retry policy.
4. Add one model provider adapter and a non-destructive test task.
5. Add GitHub and deployment tools behind approvals.
6. Add user authentication, tenant isolation, secret management, audit events, and monitoring before multi-user production use.
