/**
 * Groq Provider Adapter — REAL API calls to api.groq.com
 *
 * Why Groq first: free tier, no credit card, OpenAI-compatible API.
 * Without GROQ_API_KEY env var: every call returns NOT_CONFIGURED honestly.
 * The key is read ONLY from server-side env — never frontend, never logs.
 */
import type {
  AIProvider,
  ProviderCallOptions,
  ProviderCallResult,
  ProviderMessage,
  ProviderStatus,
} from "./types";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
// User-selected model (verified real on Groq API, Preview status, 131K context)
const DEFAULT_MODEL = "qwen/qwen3.8-27b";
const DEFAULT_TIMEOUT_MS = 30_000;

function getApiKey(): string | null {
  const key = process.env.GROQ_API_KEY;
  return key && key.trim().length > 0 ? key.trim() : null;
}

export class GroqProvider implements AIProvider {
  readonly id = "groq";
  readonly displayName = "Groq";

  getStatus(): ProviderStatus {
    return getApiKey() ? "configured" : "not_configured";
  }

  getDefaultModel(): string {
    return DEFAULT_MODEL;
  }

  listModels(): string[] {
    return [
      "qwen/qwen3.8-27b",
      "qwen/qwen3-32b",
      "llama-3.3-70b-versatile",
      "llama-3.1-8b-instant",
      "openai/gpt-oss-120b",
      "openai/gpt-oss-20b",
    ];
  }

  async complete(
    messages: ProviderMessage[],
    opts: ProviderCallOptions = {}
  ): Promise<ProviderCallResult> {
    const started = Date.now();
    const apiKey = getApiKey();

    if (!apiKey) {
      return {
        ok: false,
        errorCode: "NOT_CONFIGURED",
        error:
          "Groq API key not configured. Set GROQ_API_KEY as a server-side environment variable (free at console.groq.com).",
        latencyMs: Date.now() - started,
      };
    }

    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const model = opts.model ?? DEFAULT_MODEL;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const body = {
        model,
        messages: [
          ...(opts.systemPrompt
            ? [{ role: "system", content: opts.systemPrompt }]
            : []),
          ...messages.map((m) => ({ role: m.role, content: m.content })),
        ],
        max_tokens: opts.maxTokens ?? 1024,
      };

      const res = await fetch(GROQ_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (res.status === 429) {
        return {
          ok: false,
          errorCode: "RATE_LIMITED",
          error: "Groq rate limit reached. Wait and retry.",
          latencyMs: Date.now() - started,
        };
      }

      if (!res.ok) {
        // Never log the key; surface only status + safe message
        return {
          ok: false,
          errorCode: "API_ERROR",
          error: `Groq API error (HTTP ${res.status}). Check key and model.`,
          latencyMs: Date.now() - started,
        };
      }

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        model?: string;
        usage?: {
          prompt_tokens?: number;
          completion_tokens?: number;
          total_tokens?: number;
        };
      };

      const text = data.choices?.[0]?.message?.content?.trim() ?? "";
      if (!text) {
        return {
          ok: false,
          errorCode: "API_ERROR",
          error: "Groq returned an empty response.",
          latencyMs: Date.now() - started,
        };
      }

      return {
        ok: true,
        text,
        model: data.model ?? model,
        usage: data.usage
          ? {
              promptTokens: data.usage.prompt_tokens,
              completionTokens: data.usage.completion_tokens,
              totalTokens: data.usage.total_tokens,
            }
          : undefined,
        latencyMs: Date.now() - started,
      };
    } catch (err) {
      const isTimeout =
        err instanceof Error && err.name === "AbortError";
      return {
        ok: false,
        errorCode: isTimeout ? "TIMEOUT" : "API_ERROR",
        error: isTimeout
          ? `Groq call timed out after ${timeoutMs}ms.`
          : `Groq call failed: ${err instanceof Error ? err.message : "unknown"}`,
        latencyMs: Date.now() - started,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async testConnection(): Promise<{
    ok: boolean;
    error?: string;
    latencyMs: number;
  }> {
    const result = await this.complete(
      [{ role: "user", content: "Reply with exactly: ok" }],
      { maxTokens: 10, timeoutMs: 15_000 }
    );
    return {
      ok: result.ok,
      error: result.error,
      latencyMs: result.latencyMs,
    };
  }
}

/** Singleton — adapters are stateless apart from env */
export const groqProvider = new GroqProvider();
