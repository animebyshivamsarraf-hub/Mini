import { describe, it, expect } from "vitest";
import { validatePrompt } from "./validation";
import { hasValidBearerToken } from "./mcp-auth";
import { isRateLimited, getClientIp } from "./rate-limit";

/**
 * Phase 2 regression tests for Mini 2 MCP endpoint.
 * Tests the individual components that the route handler uses.
 * Full HTTP integration tests require a running server.
 */

describe("MCP authentication regression", () => {
  const KEY = "test-key-123";
  process.env.MINI_MCP_API_KEY = KEY;

  it("rejects missing Authorization header", () => {
    const req = new Request("http://localhost/api/mcp", { method: "POST" });
    expect(hasValidBearerToken(req)).toBe(false);
  });

  it("rejects wrong token", () => {
    const req = new Request("http://localhost/api/mcp", {
      method: "POST",
      headers: { Authorization: "Bearer wrong-key" },
    });
    expect(hasValidBearerToken(req)).toBe(false);
  });

  it("rejects non-Bearer scheme", () => {
    const req = new Request("http://localhost/api/mcp", {
      method: "POST",
      headers: { Authorization: `Basic ${KEY}` },
    });
    expect(hasValidBearerToken(req)).toBe(false);
  });

  it("accepts valid Bearer token", () => {
    const req = new Request("http://localhost/api/mcp", {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}` },
    });
    expect(hasValidBearerToken(req)).toBe(true);
  });

  it("rejects when server key not configured", () => {
    delete process.env.MINI_MCP_API_KEY;
    const req = new Request("http://localhost/api/mcp", {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}` },
    });
    expect(hasValidBearerToken(req)).toBe(false);
    process.env.MINI_MCP_API_KEY = KEY; // restore
  });
});

describe("MCP input validation regression", () => {
  it("rejects empty prompt", () => {
    expect(validatePrompt("").ok).toBe(false);
  });

  it("rejects whitespace-only prompt", () => {
    expect(validatePrompt("   \n\t  ").ok).toBe(false);
  });

  it("rejects too-short prompt", () => {
    expect(validatePrompt("ab").ok).toBe(false);
  });

  it("rejects too-long prompt", () => {
    expect(validatePrompt("x".repeat(8001)).ok).toBe(false);
  });

  it("rejects non-string input", () => {
    expect(validatePrompt(123 as unknown as string).ok).toBe(false);
    expect(validatePrompt(null as unknown as string).ok).toBe(false);
  });

  it("accepts valid prompt and trims", () => {
    const result = validatePrompt("  Build a todo app  ");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.prompt).toBe("Build a todo app");
  });
});

describe("MCP rate limiting regression", () => {
  it("allows under limit, blocks over", () => {
    const ip = "regression-test-ip";
    for (let i = 0; i < 60; i++) {
      expect(isRateLimited(ip)).toBe(false);
    }
    expect(isRateLimited(ip)).toBe(true);
  });

  it("extracts IP from x-forwarded-for", () => {
    const req = new Request("http://localhost/api/mcp", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });
    expect(getClientIp(req)).toBe("1.2.3.4");
  });
});

describe("MCP database failure honesty", () => {
  it("task-store throws honest error without DATABASE_URL", async () => {
    const origUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    // Force fresh module state
    const { createTask } = await import("./task-store");
    await expect(createTask("test prompt")).rejects.toThrow(/DATABASE_URL/);
    if (origUrl) process.env.DATABASE_URL = origUrl;
  });
});
