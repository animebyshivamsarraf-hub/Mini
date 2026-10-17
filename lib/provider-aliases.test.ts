/**
 * Acceptance test (user-defined 2026-10-18):
 * "Claude", "Claude AI", "क्लाउड AI", "Cloud AI" must ALL resolve
 * to the Anthropic provider. Never switch providers on name alone.
 */
import { describe, it, expect } from "vitest";
import { getProvider, resolveProviderId } from "./providers/registry";

describe("Cloud AI = Anthropic Claude alias resolution", () => {
  const claudeNames = ["Claude", "Claude AI", "क्लाउड AI", "Cloud AI"];

  it.each(claudeNames)("'%s' resolves to provider id 'anthropic'", (name) => {
    expect(resolveProviderId(name)).toBe("anthropic");
  });

  it.each(claudeNames)("getProvider('%s') returns the Anthropic adapter", (name) => {
    const p = getProvider(name);
    expect(p).toBeDefined();
    expect(p!.id).toBe("anthropic");
    expect(p!.displayName).toContain("Anthropic");
  });

  it("case-insensitive: 'CLAUDE' and '  claude ai  ' resolve too", () => {
    expect(resolveProviderId("CLAUDE")).toBe("anthropic");
    expect(resolveProviderId("  claude ai  ")).toBe("anthropic");
  });

  it("does not switch other providers on name alone", () => {
    expect(resolveProviderId("groq")).toBe("groq");
    expect(resolveProviderId("ChatGPT")).toBe("openai");
    expect(getProvider("groq")!.id).toBe("groq");
    expect(getProvider("openai")!.id).toBe("openai");
  });

  it("unknown names pass through unchanged (no silent fallback)", () => {
    expect(resolveProviderId("some-unknown-xyz")).toBe("some-unknown-xyz");
    expect(getProvider("some-unknown-xyz")).toBeUndefined();
  });
});
