import { providerStatusSummary } from "@/lib/providers/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/providers — list AI providers and their honest configuration status.
 * Never exposes API keys. Unconfigured providers report "not_configured".
 */
export async function GET(request: Request) {
  const expected = process.env.MINI_MCP_API_KEY;
  const auth = request.headers.get("authorization") ?? "";
  if (!expected || auth !== `Bearer ${expected}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return Response.json({
    providers: providerStatusSummary(),
    note: "not_configured = set the provider's API key as a server-side env var.",
  });
}
