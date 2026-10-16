/**
 * Provider Adapter Interface — Mini 2 AI-to-AI Orchestration
 *
 * CRITICAL: An MCP server cannot message ChatGPT/Claude on its own.
 * Provider adapters make REAL HTTP calls to official model APIs.
 * No credentials = honest "not_configured" status. Never fake.
 */

export type ProviderStatus = "configured" | "not_configured" | "error";

export interface ProviderMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ProviderCallOptions {
  /** Max tokens for the response */
  maxTokens?: number;
  /** Timeout in ms (default 30000) */
  timeoutMs?: number;
  /** System prompt override */
  systemPrompt?: string;
  /** Model override (must be in listModels()) */
  model?: string;
}

export interface ProviderCallResult {
  ok: boolean;
  /** The AI's actual response text (only when ok=true) */
  text?: string;
  /** Model actually used */
  model?: string;
  /** Token usage if reported */
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
  /** Error code when ok=false: NOT_CONFIGURED | TIMEOUT | API_ERROR | RATE_LIMITED */
  errorCode?: string;
  /** Human-readable error (no secrets) */
  error?: string;
  /** Wall-clock ms the call took */
  latencyMs: number;
}

export interface AIProvider {
  /** Stable id, e.g. "groq", "openai", "anthropic" */
  readonly id: string;
  /** Display name */
  readonly displayName: string;
  /** Honest status — never claim configured without a real credential */
  getStatus(): ProviderStatus;
  /** Default model id */
  getDefaultModel(): string;
  /** List available models (may be static list when not configured) */
  listModels(): string[];
  /**
   * Make a REAL API call. Returns NOT_CONFIGURED without credentials.
   * Never throws for expected failures — returns { ok: false } instead.
   */
  complete(messages: ProviderMessage[], opts?: ProviderCallOptions): Promise<ProviderCallResult>;
  /** Lightweight connectivity check (may cost 0 tokens with a tiny prompt) */
  testConnection(): Promise<{ ok: boolean; error?: string; latencyMs: number }>;
}
