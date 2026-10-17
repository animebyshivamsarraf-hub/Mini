/**
 * Provider Registry — one place to list every AI provider adapter.
 *
 * Adding a new provider = implement AIProvider, add it here. Nothing else changes.
 * Status is always honest: "configured" only with a real server-side credential.
 */
import type { AIProvider } from "./types";
import { groqProvider } from "./groq";
import { openaiProvider } from "./openai";
import { anthropicProvider } from "./anthropic";

const providers: AIProvider[] = [
  groqProvider,
  openaiProvider,
  anthropicProvider,
];

export function listProviders(): AIProvider[] {
  return [...providers];
}

export function getProvider(id: string): AIProvider | undefined {
  return providers.find((p) => p.id === id);
}

/** Summary for UI/API — no secrets, just honest status */
export function providerStatusSummary(): Array<{
  id: string;
  displayName: string;
  status: "configured" | "not_configured" | "error";
  defaultModel: string;
}> {
  return providers.map((p) => ({
    id: p.id,
    displayName: p.displayName,
    status: p.getStatus(),
    defaultModel: p.getDefaultModel(),
  }));
}
