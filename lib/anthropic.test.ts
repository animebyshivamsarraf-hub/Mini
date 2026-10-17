/**
 * Anthropic provider tests — NO real API key, NO real network calls.
 * All HTTP is mocked. Without ANTHROPIC_API_KEY the provider must
 * report not_configured honestly and never claim success.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { anthropicProvider } from "./providers/anthropic";
import { getProvider, listProviders } from "./providers/registry";

const FAKE_KEY = "sk-ant-test-key-do-not-use";

function mockFetchOnce(handler: (url: string, init: RequestInit) => unknown) {
  const spy = vi.spyOn(globalThis, "fetch").mockImplementationOnce(
    (async (url: string | URL | Request, init?: RequestInit) => {
      const result = handler(String(url), (init ?? {}) as RequestInit);
      return result as Response;
    }) as typeof fetch
  );
  return spy;
}

function okResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  };
}

function errResponse(status: number, body: unknown = {}) {
  return {
    ok: false,
    status,
    json: async () => body,
  };
}

describe("Anthropic provider (no key)", () => {
  let saved: string | undefined;
  beforeEach(() => {
    saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  });
  afterEach(() => {
    if (saved) process.env.ANTHROPIC_API_KEY = saved;
    else delete process.env.ANTHROPIC_API_KEY;
    vi.restoreAllMocks();
  });

  it("reports not_configured honestly without ANTHROPIC_API_KEY", () => {
    expect(anthropicProvider.getStatus()).toBe("not_configured");
  });

  it("complete() returns NOT_CONFIGURED, never throws, never fakes", async () => {
    const r = await anthropicProvider.complete([{ role: "user", content: "hi" }]);
    expect(r.ok).toBe(false);
    expect(r.errorCode).toBe("NOT_CONFIGURED");
    expect(r.text).toBeUndefined();
    expect(r.model).toBeUndefined();
  });

  it("has id 'anthropic', default model and model list", () => {
    expect(anthropicProvider.id).toBe("anthropic");
    expect(anthropicProvider.getDefaultModel()).toBe("claude-haiku-4-5-20251001");
    expect(anthropicProvider.listModels()).toContain("claude-haiku-4-5-20251001");
    expect(anthropicProvider.listModels()).toContain("claude-sonnet-5-5");
  });

  it("is registered in the provider registry", () => {
    const p = getProvider("anthropic");
    expect(p).toBeDefined();
    expect(p!.id).toBe("anthropic");
    expect(listProviders().map((x) => x.id)).toContain("anthropic");
  });
});

describe("Anthropic provider (mocked HTTP, fake key)", () => {
  let saved: string | undefined;
  beforeEach(() => {
    saved = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = FAKE_KEY;
  });
  afterEach(() => {
    if (saved) process.env.ANTHROPIC_API_KEY = saved;
    else delete process.env.ANTHROPIC_API_KEY;
    vi.restoreAllMocks();
  });

  it("reports configured with key present", () => {
    expect(anthropicProvider.getStatus()).toBe("configured");
  });

  it("rejects models not in the allow-list", async () => {
    const r = await anthropicProvider.complete(
      [{ role: "user", content: "hi" }],
      { model: "gpt-999-fake" }
    );
    expect(r.ok).toBe(false);
    expect(r.errorCode).toBe("API_ERROR");
  });

  it("parses a successful Messages API response", async () => {
    let capturedBody: Record<string, unknown> = {};
    let capturedHeaders: Record<string, string> = {};
    mockFetchOnce((url, init) => {
      expect(url).toBe("https://api.anthropic.com/v1/messages");
      capturedHeaders = (init.headers ?? {}) as Record<string, string>;
      capturedBody = JSON.parse(String(init.body));
      return okResponse({
        id: "msg_test",
        type: "message",
        role: "assistant",
        model: "claude-haiku-4-5-20251001",
        content: [{ type: "text", text: "Hello from Claude!" }],
        stop_reason: "end_turn",
        usage: { input_tokens: 10, output_tokens: 5 },
      });
    });

    const r = await anthropicProvider.complete([
      { role: "user", content: "Say hello" },
    ]);
    expect(r.ok).toBe(true);
    expect(r.text).toBe("Hello from Claude!");
    expect(r.model).toBe("claude-haiku-4-5-20251001");
    expect(r.usage?.promptTokens).toBe(10);
    expect(r.usage?.completionTokens).toBe(5);
    // Auth uses x-api-key header, never Bearer
    expect(capturedHeaders["x-api-key"]).toBe(FAKE_KEY);
    expect(capturedHeaders["anthropic-version"]).toBe("2023-06-01");
    expect(capturedBody.model).toBe("claude-haiku-4-5-20251001");
  });

  it("sends system prompt in the separate system field (not in messages)", async () => {
    let capturedBody: Record<string, unknown> = {};
    mockFetchOnce((_url, init) => {
      capturedBody = JSON.parse(String(init.body));
      return okResponse({
        content: [{ type: "text", text: "ok" }],
        model: "claude-haiku-4-5-20251001",
      });
    });

    await anthropicProvider.complete(
      [
        { role: "system", content: "Be brief." },
        { role: "user", content: "hi" },
      ],
      { systemPrompt: "Extra instruction." }
    );

    expect(capturedBody.system).toContain("Be brief.");
    expect(capturedBody.system).toContain("Extra instruction.");
    const msgs = capturedBody.messages as Array<{ role: string }>;
    expect(msgs.every((m) => m.role !== "system")).toBe(true);
  });

  it("handles 401 as invalid key (not as success)", async () => {
    mockFetchOnce(() => errResponse(401, { error: { message: "invalid key" } }));
    const r = await anthropicProvider.complete([{ role: "user", content: "hi" }]);
    expect(r.ok).toBe(false);
    expect(r.errorCode).toBe("API_ERROR");
    expect(r.error).toContain("401");
  });

  it("handles 429 as RATE_LIMITED", async () => {
    mockFetchOnce(() => errResponse(429, {}));
    const r = await anthropicProvider.complete([{ role: "user", content: "hi" }]);
    expect(r.ok).toBe(false);
    expect(r.errorCode).toBe("RATE_LIMITED");
  });

  it("handles malformed/empty response as API_ERROR (never fake success)", async () => {
    mockFetchOnce(() => okResponse({ content: [] }));
    const r = await anthropicProvider.complete([{ role: "user", content: "hi" }]);
    expect(r.ok).toBe(false);
    expect(r.errorCode).toBe("API_ERROR");
    expect(r.text).toBeUndefined();
  });

  it("handles non-text content blocks as malformed", async () => {
    mockFetchOnce(() =>
      okResponse({ content: [{ type: "tool_use", id: "x" }] })
    );
    const r = await anthropicProvider.complete([{ role: "user", content: "hi" }]);
    expect(r.ok).toBe(false);
    expect(r.errorCode).toBe("API_ERROR");
  });

  it("never leaks the API key in errors", async () => {
    mockFetchOnce(() => errResponse(500, { error: { message: "boom" } }));
    const r = await anthropicProvider.complete([{ role: "user", content: "hi" }]);
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).not.toContain(FAKE_KEY);
  });
});
