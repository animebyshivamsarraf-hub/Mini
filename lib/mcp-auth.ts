/**
 * Bearer token authentication for Mini's MCP endpoint.
 * Token comes only from server-side env var MINI_MCP_API_KEY.
 * Uses timing-safe comparison to prevent timing attacks.
 */
import { timingSafeEqual } from "node:crypto";

export function extractBearerToken(authorization: string | null): string | null {
  if (!authorization) return null;
  if (!authorization.startsWith("Bearer ")) return null;
  const token = authorization.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

export function isValidBearerToken(
  authorization: string | null,
  expected: string | undefined,
): boolean {
  if (!expected || expected.length === 0) return false;
  const supplied = extractBearerToken(authorization);
  if (!supplied) return false;

  const suppliedBytes = Buffer.from(supplied);
  const expectedBytes = Buffer.from(expected);

  return (
    suppliedBytes.length === expectedBytes.length &&
    timingSafeEqual(suppliedBytes, expectedBytes)
  );
}

export function hasValidBearerToken(request: Request): boolean {
  return isValidBearerToken(
    request.headers.get("authorization"),
    process.env.MINI_MCP_API_KEY,
  );
}
