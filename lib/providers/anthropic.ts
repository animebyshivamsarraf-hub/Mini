/**
 * Anthropic Provider Adapter — REAL API calls to api.anthropic.com
 *
 * Uses the Messages API. Without ANTHROPIC_API_KEY env var: every call
 * returns NOT_CONFIGURED honestly.
 * The key is read ONLY from server-side env — never frontend, never logs.
 */
import type {
  AIProvider,
  ProviderCallOptions,
  ProviderCallResult,
  ProviderMessage,
  ProviderStatus,
} from "./types";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const DEFAULT_TIMEOUT_MS = 30_000;

function getApiKey(): string | null {
  const key = process.env.ANTHROPIC_API_KEY;
  return key && key.trim().length > 0 ? key.trim() : null;
}

export class AnthropicProvider implements AIProvider {
  readonly id = "anthropic";
  readonly displayName = "Claude (Anthropic)";

  getStatus(): ProviderStatus {
    return getApiKey() ? "configured" : "not_configured";
  }

  getDefaultModel(): string {
    return DEFAULT_MODEL;
  }

  listModels(): string[] {
    // Only IDs confirmed on the official deprecations page
    // (docs.anthropic.com/en/docs/about-claude/model-deprecations)
    // as recommended replacements. Verified 2026-10-17.
    return [
      "claude-haiku-4-5-20251001",
      "claude-sonnet-5-5",
      "claude-opus-4-8",
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
          "Anthropic API key not configured. Set ANTHROPIC_API_KEY as a server-side environment variable.",
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
      // Anthropic: system prompt goes in a separate field, not in messages
      const systemParts: string[] = [];
      if (opts.systemPrompt) systemParts.push(opts.systemPrompt);
      const apiMessages: Array<{ role: "user" | "assistant"; content: string }> = [];
      for (const m of messages) {
        if (m.role === "system") {
          systemParts.push(m.content);
        } else {
          apiMessages.push({ role: m.role, content: m.content });
        }
      }

      if (apiMessages.length === 0) {
        return {
          ok: false,
          errorCode: "API_ERROR",
          error: "No user/assistant messages to send.",
          latencyMs: Date.now() - started,
        };
      }

      const body: Record<string, unknown> = {
        model,
        max_tokens: opts.maxTokens ?? 1024,
        messages: apiMessages,
      };
      if (systemParts.length > 0) {
        body.system = systemParts.join("\n\n");
      }

      const res = await fetch(ANTHROPIC_API_URL, {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (res.status === 429) {
        return {
          ok: false,
          errorCode: "RATE_LIMITED",
          error: "Anthropic rate limit reached. Wait and retry.",
          latencyMs: Date.now() - started,
        };
      }

      if (res.status === 401) {
        return {
          ok: false,
          errorCode: "API_ERROR",
          error: "Anthropic API key invalid or revoked (HTTP 401).",
          latencyMs: Date.now() - started,
        };
      }

      if (!res.ok) {
        // Try to extract a safe error message without leaking anything
        let detail = "";
        try {
          const errData = (await res.json()) as {
            error?: { message?: string; type?: string };
          };
          if (errData?.error?.message) {
            detail = `: ${String(errData.error.message).slice(0, 200)}`;
          }
        } catch {
          // ignore parse errors on error body
        }
        return {
          ok: false,
          errorCode: "API_ERROR",
          error: `Anthropic API error (HTTP ${res.status})${detail}. Check key and model.`,
          latencyMs: Date.now() - started,
        };
      }

      const data = (await res.json()) as {
        content?: Array<{ type?: string; text?: string }>;
        model?: string;
        stop_reason?: string;
        usage?: { input_tokens?: number; output_tokens?: number };
      };

      // Malformed response guard: content must be a non-empty array with text
      const textParts = (data.content ?? [])
        .filter((b) => b?.type === "text" && typeof b.text === "string")
        .map((b) => b.text as string);
      const text = textParts.join("").trim();

      if (!text) {
        return {
          ok: false,
          errorCode: "API_ERROR",
          error: "Anthropic returned an empty or malformed response.",
          latencyMs: Date.now() - started,
        };
      }

      return {
        ok: true,
        text,
        model: data.model ?? model,
        usage: data.usage
          ? {
              promptTokens: data.usage.input_tokens,
              completionTokens: data.usage.output_tokens,
              totalTokens:
                (data.usage.input_tokens ?? 0) + (data.usage.output_tokens ?? 0),
            }
          : undefined,
        latencyMs: Date.now() - started,
      };
    } catch (err) {
      const isTimeout = err instanceof Error && err.name === "AbortError";
      return {
        ok: false,
        errorCode: isTimeout ? "TIMEOUT" : "API_ERROR",
        error: isTimeout
          ? `Anthropic call timed out after ${timeoutMs}ms.`
          : `Anthropic call failed: ${err instanceof Error ? err.message : "unknown"}`,
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
export const anthropicProvider = new AnthropicProvider();
