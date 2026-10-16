import { describe, it, expect, beforeEach } from "vitest";
import { isRateLimited } from "./rate-limit";

describe("rate-limit", () => {
  it("allows first request", () => {
    expect(isRateLimited("test-ip-1")).toBe(false);
  });

  it("blocks after 60 requests", () => {
    const ip = "test-ip-2";
    for (let i = 0; i < 60; i++) {
      isRateLimited(ip);
    }
    expect(isRateLimited(ip)).toBe(true);
  });

  it("tracks IPs separately", () => {
    const ipA = "test-ip-3a";
    const ipB = "test-ip-3b";
    for (let i = 0; i < 60; i++) {
      isRateLimited(ipA);
    }
    expect(isRateLimited(ipA)).toBe(true);
    expect(isRateLimited(ipB)).toBe(false);
  });
});
