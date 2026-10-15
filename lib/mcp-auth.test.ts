import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { validateBearerToken } from "./lib/mcp-auth";

describe("bearer token auth", () => {
  const OLD = process.env.MINI_MCP_API_KEY;

  beforeEach(() => {
    process.env.MINI_MCP_API_KEY = "test-secret-123";
  });
  afterEach(() => {
    if (OLD === undefined) delete process.env.MINI_MCP_API_KEY;
    else process.env.MINI_MCP_API_KEY = OLD;
  });

  it("accepts correct token", () => {
    expect(validateBearerToken("Bearer test-secret-123")).toBe(true);
  });
  it("rejects wrong token", () => {
    expect(validateBearerToken("Bearer wrong-key")).toBe(false);
  });
  it("rejects missing header", () => {
    expect(validateBearerToken(null)).toBe(false);
  });
  it("rejects empty token", () => {
    expect(validateBearerToken("Bearer ")).toBe(false);
  });
  it("rejects non-Bearer scheme", () => {
    expect(validateBearerToken("Basic test-secret-123")).toBe(false);
  });
  it("rejects when env var not set", () => {
    delete process.env.MINI_MCP_API_KEY;
    expect(validateBearerToken("Bearer test-secret-123")).toBe(false);
  });
  it("rejects when env var empty", () => {
    process.env.MINI_MCP_API_KEY = "";
    expect(validateBearerToken("Bearer test-secret-123")).toBe(false);
  });
});
