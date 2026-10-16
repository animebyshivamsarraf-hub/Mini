/**
 * Mini 2 — Modular AI Provider Architecture
 *
 * Each provider implements this interface. API keys come ONLY from
 * server-side environment variables — never from client input.
 * A provider without its key configured reports "not configured",
 * never a fake successful response.
 */

export type ProviderId = "openai" | "gemini" | "anthropic" | "meta";

export interface ProviderConfig {
  id: ProviderId;
  name: string;
  /** Env var name holding the API key, e.g. "OPENAI_API_KEY" */
  keyEnvVar: string;
  models: string[];
  defaultModel: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  model?: string;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface ChatResult {
  text: string;
  model: string;
  usage?: { inputTokens: number; outputTokens: number };
}

export type ProviderStatus =
  | { configured: true; models: string[] }
  | { configured: false; reason: string };

export const PROVIDERS: Record<ProviderId, ProviderConfig> = {
  openai: {
    id: "openai",
    name: "OpenAI",
    keyEnvVar: "OPENAI_API_KEY",
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
    defaultModel: "gpt-4o-mini",
  },
  gemini: {
    id: "gemini",
    name: "Google Gemini",
    keyEnvVar: "GEMINI_API_KEY",
    models: ["gemini-1.5-pro", "gemini-1.5-flash"],
    defaultModel: "gemini-1.5-flash",
  },
  anthropic: {
    id: "anthropic",
    name: "Anthropic Claude",
    keyEnvVar: "ANTHROPIC_API_KEY",
    models: ["claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022"],
    defaultModel: "claude-3-5-haiku-20241022",
  },
  meta: {
    id: "meta",
    name: "Meta Llama",
    keyEnvVar: "META_API_KEY",
    models: ["llama-3.1-70b", "llama-3.2-90b"],
    defaultModel: "llama-3.1-70b",
  },
};

/** Check if a provider has its API key configured (server-side only). */
export function getProviderStatus(id: ProviderId): ProviderStatus {
  const config = PROVIDERS[id];
  const key = process.env[config.keyEnvVar];
  if (!key || key.length === 0) {
    return {
      configured: false,
      reason: `${config.name} API key not configured. Set ${config.keyEnvVar} as a server-side environment variable.`,
    };
  }
  return { configured: true, models: config.models };
}

/** List all providers with their configuration status. */
export function listProviders(): Array<ProviderConfig & ProviderStatus> {
  return (Object.keys(PROVIDERS) as ProviderId[]).map((id) => ({
    ...PROVIDERS[id],
    ...getProviderStatus(id),
  }));
}
