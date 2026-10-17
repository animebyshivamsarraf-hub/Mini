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

/**
 * User-defined alias map (2026-10-18): "Cloud AI", "Claude", "Claude AI",
 * "क्लाउड AI" ALL mean Anthropic's Claude. Never interpret "Cloud AI" as
 * general cloud computing or switch providers on name alone.
 */
const PROVIDER_ALIASES: Record<string, string> = {
  // Anthropic Claude aliases — normalized lowercase, trimmed
  "claude": "anthropic",
  "claude ai": "anthropic",
  "cloud ai": "anthropic",
  "क्लाउड ai": "anthropic",
  "क्लाउड एआई": "anthropic",
  "anthropic claude": "anthropic",
  "anthropic": "anthropic",
  // Other providers — exact IDs plus common display variants
  "groq": "groq",
  "openai": "openai",
  "chatgpt": "openai",
  "gpt": "openai",
};

/** Resolve a user-supplied provider name to a canonical provider ID. */
export function resolveProviderId(input: string): string {
  const key = input.trim().toLowerCase();
  return PROVIDER_ALIASES[key] ?? input.trim();
}

export function getProvider(id: string): AIProvider | undefined {
  const resolved = resolveProviderId(id);
  return providers.find((p) => p.id === resolved);
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
