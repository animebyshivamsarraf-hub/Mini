import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isValidBearerToken, extractBearerToken } from "./mcp-auth";

const TEST_KEY = "test-secret-key-123";

describe("extractBearerToken", () => {
  it("extracts token from valid header", () => {
    expect(extractBearerToken("Bearer abc123")).toBe("abc123");
  });
  it("returns null for missing header", () => {
    expect(extractBearerToken(null)).toBe(null);
  });
  it("returns null for non-Bearer scheme", () => {
    expect(extractBearerToken("Basic abc123")).toBe(null);
  });
  it("returns null for empty token", () => {
    expect(extractBearerToken("Bearer ")).toBe(null);
    expect(extractBearerToken("Bearer    ")).toBe(null);
  });
});

describe("isValidBearerToken", () => {
  it("accepts correct token", () => {
    expect(isValidBearerToken("Bearer test-secret-key-123", TEST_KEY)).toBe(true);
  });
  it("rejects wrong token", () => {
    expect(isValidBearerToken("Bearer wrong-token", TEST_KEY)).toBe(false);
  });
  it("rejects missing header", () => {
    expect(isValidBearerToken(null, TEST_KEY)).toBe(false);
  });
  it("rejects empty token", () => {
    expect(isValidBearerToken("Bearer ", TEST_KEY)).toBe(false);
  });
  it("rejects non-Bearer scheme", () => {
    expect(isValidBearerToken("Basic test-secret-key-123", TEST_KEY)).toBe(false);
  });
  it("rejects when env var missing", () => {
    expect(isValidBearerToken("Bearer test-secret-key-123", undefined)).toBe(false);
  });
  it("rejects when env var empty", () => {
    expect(isValidBearerToken("Bearer test-secret-key-123", "")).toBe(false);
  });
});
