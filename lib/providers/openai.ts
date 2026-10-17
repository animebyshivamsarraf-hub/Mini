/**
 * OpenAI Provider Adapter — REAL API calls to api.openai.com
 *
 * Without OPENAI_API_KEY env var: every call returns NOT_CONFIGURED honestly.
 * The key is read ONLY from server-side env — never frontend, never logs.
 */
import type {
  AIProvider,
  ProviderCallOptions,
  ProviderCallResult,
  ProviderMessage,
  ProviderStatus,
} from "./types";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_TIMEOUT_MS = 30_000;

function getApiKey(): string | null {
  const key = process.env.OPENAI_API_KEY;
  return key && key.trim().length > 0 ? key.trim() : null;
}

export class OpenAIProvider implements AIProvider {
  readonly id = "openai";
  readonly displayName = "OpenAI";

  getStatus(): ProviderStatus {
    return getApiKey() ? "configured" : "not_configured";
  }

  getDefaultModel(): string {
    return DEFAULT_MODEL;
  }

  listModels(): string[] {
    return [
      "gpt-4o-mini",
      "gpt-4o",
      "gpt-4.1-mini",
      "gpt-4.1",
      "o4-mini",
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
          "OpenAI API key not configured. Set OPENAI_API_KEY as a server-side environment variable.",
        latencyMs: Date.now() - started,
      };
    }

    if (opts.model && !this.listModels().includes(opts.model)) {
      return {
        ok: false,
        errorCode: "API_ERROR",
        error: `Model "${opts.model}" is not in the allowed list for this provider.`,
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

      const res = await fetch(OPENAI_API_URL, {
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
          error: "OpenAI rate limit reached. Wait and retry.",
          latencyMs: Date.now() - started,
        };
      }

      if (res.status === 401) {
        return {
          ok: false,
          errorCode: "API_ERROR",
          error: "OpenAI API key invalid or revoked (HTTP 401).",
          latencyMs: Date.now() - started,
        };
      }

      if (!res.ok) {
        return {
          ok: false,
          errorCode: "API_ERROR",
          error: `OpenAI API error (HTTP ${res.status}). Check key and model.`,
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
          error: "OpenAI returned an empty response.",
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
          ? `OpenAI call timed out after ${timeoutMs}ms.`
          : `OpenAI call failed: ${err instanceof Error ? err.message : "unknown"}`,
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
export const openaiProvider = new OpenAIProvider();
