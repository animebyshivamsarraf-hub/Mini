import { listProviders } from "@/lib/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/providers — list AI providers and their configuration status.
 * Never exposes API keys. Unconfigured providers honestly report so.
 */
export async function GET(request: Request) {
  const expected = process.env.MINI_MCP_API_KEY;
  const auth = request.headers.get("authorization") ?? "";
  // Allow public read of provider *status* (no keys exposed),
  // but require auth for consistency with other endpoints.
  if (!expected || auth !== `Bearer ${expected}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const providers = listProviders().map((p) => ({
    id: p.id,
    name: p.name,
    models: p.models,
    defaultModel: p.defaultModel,
    configured: p.configured,
    reason: p.configured ? undefined : (p as { reason: string }).reason,
  }));

  return Response.json({ providers });
}
