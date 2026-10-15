import { timingSafeEqual } from "crypto";

/**
 * Validates the Bearer token from the Authorization header.
 * The expected token comes ONLY from the MINI_MCP_API_KEY env var.
 * Uses timing-safe comparison to prevent timing attacks.
 */
export function validateBearerToken(authHeader: string | null): boolean {
  const expected = process.env.MINI_MCP_API_KEY;
  if (!expected || expected.length === 0) return false;
  if (!authHeader || !authHeader.startsWith("Bearer ")) return false;
  const provided = authHeader.slice(7);
  if (provided.length === 0) return false;
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function unauthorizedResponse() {
  return new Response(
    JSON.stringify({ error: "Unauthorized", message: "Valid Bearer token required" }),
    { status: 401, headers: { "Content-Type": "application/json" } }
  );
}
