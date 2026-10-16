import { describe, it, expect } from "vitest";
import { validatePrompt } from "./validation";

describe("validatePrompt", () => {
  it("rejects empty string", () => {
    const r = validatePrompt("");
    expect(r.ok).toBe(false);
  });

  it("rejects whitespace-only", () => {
    expect(validatePrompt("   ").ok).toBe(false);
    expect(validatePrompt("\n\t ").ok).toBe(false);
  });

  it("rejects under 3 chars", () => {
    expect(validatePrompt("a").ok).toBe(false);
    expect(validatePrompt("ab").ok).toBe(false);
  });

  it("rejects over 8000 chars", () => {
    expect(validatePrompt("x".repeat(8001)).ok).toBe(false);
  });

  it("accepts exactly 3 chars", () => {
    const r = validatePrompt("abc");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.prompt).toBe("abc");
  });

  it("accepts exactly 8000 chars", () => {
    const r = validatePrompt("x".repeat(8000));
    expect(r.ok).toBe(true);
  });

  it("accepts normal prompt and trims", () => {
    const r = validatePrompt("  Build a todo app  ");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.prompt).toBe("Build a todo app");
  });

  it("rejects non-string values", () => {
    expect(validatePrompt(null).ok).toBe(false);
    expect(validatePrompt(undefined).ok).toBe(false);
    expect(validatePrompt(123).ok).toBe(false);
    expect(validatePrompt({}).ok).toBe(false);
  });
});
