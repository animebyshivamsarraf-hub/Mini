import { describe, it, expect } from "vitest";
import { mimiBrainAnswer, mimiAsk } from "./mimi-brain";

describe("mimi-brain (Mini 1 port)", () => {
  it("greets in Hinglish for Roman input", () => {
    const r = mimiBrainAnswer("hello");
    expect(r.answer).toContain("Mimi");
    expect(r.emotion).toBe("happy");
    expect(r.is_fallback).toBe(false);
  });

  it("greets in Hindi for Devanagari input", () => {
    const r = mimiBrainAnswer("नमस्ते");
    expect(r.answer).toContain("Mimi");
    expect(r.answer).toMatch(/[\u0900-\u097F]/);
  });

  it("tells time", () => {
    const r = mimiBrainAnswer("time kya hai");
    expect(r.answer).toMatch(/baj rahe hain/);
  });

  it("tells a joke", () => {
    const r = mimiBrainAnswer("joke sunao");
    expect(r.emotion).toBe("laugh");
  });

  it("answers about Mini 2", () => {
    const r = mimiBrainAnswer("mini 2 kaun hai");
    expect(r.answer).toContain("Mini 2");
  });

  it("falls back honestly for unknown input", () => {
    const r = mimiBrainAnswer("xyz quantum physics");
    expect(r.is_fallback).toBe(true);
  });
});

describe("mimiAsk", () => {
  it("rejects empty question", () => {
    const out = JSON.parse(mimiAsk(""));
    expect(out.error).toBeDefined();
  });

  it("returns structured JSON", () => {
    const out = JSON.parse(mimiAsk("hello", "test-session"));
    expect(out.answer).toContain("Mimi");
    expect(out.session_id).toBe("test-session");
    expect(out.brain).toBe("mimi-rule-based");
  });

  it("sanitizes session_id", () => {
    const out = JSON.parse(mimiAsk("hi", "bad!@#id"));
    expect(out.session_id).toBe("badid");
  });
});
