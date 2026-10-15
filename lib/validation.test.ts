import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { validatePrompt } from "./lib/validation";

describe("prompt validation", () => {
  it("rejects empty string", () => {
    expect(validatePrompt("").ok).toBe(false);
  });
  it("rejects whitespace-only", () => {
    expect(validatePrompt("   ").ok).toBe(false);
    expect(validatePrompt("\n\t ").ok).toBe(false);
  });
  it("rejects <3 chars", () => {
    expect(validatePrompt("ab").ok).toBe(false);
    expect(validatePrompt("a").ok).toBe(false);
  });
  it("rejects >8000 chars", () => {
    expect(validatePrompt("x".repeat(8001)).ok).toBe(false);
  });
  it("accepts exactly 3 chars", () => {
    expect(validatePrompt("abc").ok).toBe(true);
  });
  it("accepts exactly 8000 chars", () => {
    expect(validatePrompt("x".repeat(8000)).ok).toBe(true);
  });
  it("accepts normal prompt", () => {
    expect(validatePrompt("Build a todo app").ok).toBe(true);
  });
  it("rejects non-string", () => {
    expect(validatePrompt(null).ok).toBe(false);
    expect(validatePrompt(123).ok).toBe(false);
    expect(validatePrompt(undefined).ok).toBe(false);
  });
});
