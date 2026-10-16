/**
 * Mini 2 — Provider Architecture (compatibility shim)
 *
 * The REAL provider system lives in lib/providers/ (types.ts, registry.ts, groq.ts).
 * This file re-exports it so existing imports keep working.
 *
 * Honest rule: a provider reports "configured" ONLY with a real server-side
 * API key. No key = not_configured. Never fake.
 */
export type { AIProvider, ProviderMessage, ProviderCallOptions, ProviderCallResult, ProviderStatus } from "./providers/types";
export { groqProvider } from "./providers/groq";
export { listProviders, getProvider, providerStatusSummary } from "./providers/registry";
