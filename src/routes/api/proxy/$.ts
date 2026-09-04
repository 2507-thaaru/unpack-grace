import { createFileRoute } from "@tanstack/react-router";

const DEFAULT_BASE = "https://contractor-tree-segment-healing.trycloudflare.com";

function baseUrl() {
  return (process.env["SETTLEMENT_API_URL"] ?? DEFAULT_BASE).replace(/\/$/, "");
}

async function forward(request: Request, splat: string | undefined) {
  const incoming = new URL(request.url);
  const target = `${baseUrl()}/api/${splat ?? ""}${incoming.search}`;

  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers: { accept: "application/json" },
      ...(request.method === "POST" ? { body: await request.text() } : {}),
    });
    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") ?? "application/json",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return Response.json(
      {
        error: "upstream_unreachable",
        message: error instanceof Error ? error.message : "Could not reach the pipeline API",
      },
      { status: 502 },
    );
  }
}

export const Route = createFileRoute("/api/proxy/$")({
  server: {
    handlers: {
      GET: async ({ request, params }) => forward(request, params._splat),
      POST: async ({ request, params }) => forward(request, params._splat),
    },
  },
});
