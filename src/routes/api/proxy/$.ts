import { createFileRoute } from "@tanstack/react-router";

const DEFAULT_BASE = "https://integrate-activated-graph-void.trycloudflare.com";

function baseUrl() {
  return (process.env["SETTLEMENT_API_URL"] ?? DEFAULT_BASE).replace(/\/$/, "");
}

async function forward(request: Request, splat: string | undefined) {
  const incoming = new URL(request.url);
  const target = `${baseUrl()}/api/${splat ?? ""}${incoming.search}`;
  const body = request.method === "POST" ? await request.text() : undefined;

  let lastError: unknown;
  // Cloudflare quick tunnels drop briefly when restarted — retry before failing.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const upstream = await fetch(target, {
        method: request.method,
        headers: { accept: "application/json" },
        ...(body === undefined ? {} : { body }),
      });
      if (upstream.status >= 500 && attempt < 2) {
        lastError = new Error(`Upstream returned ${upstream.status}`);
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        continue;
      }
      const text = await upstream.text();
      return new Response(text, {
        status: upstream.status,
        headers: {
          "content-type": upstream.headers.get("content-type") ?? "application/json",
          "cache-control": "no-store",
        },
      });
    } catch (error) {
      lastError = error;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }

  return Response.json(
    {
      error: "upstream_unreachable",
      message:
        lastError instanceof Error
          ? `Could not reach the pipeline API (${lastError.message}). Is the Cloudflare tunnel running?`
          : "Could not reach the pipeline API",
    },
    { status: 502 },
  );
}


export const Route = createFileRoute("/api/proxy/$")({
  server: {
    handlers: {
      GET: async ({ request, params }) => forward(request, params._splat),
      POST: async ({ request, params }) => forward(request, params._splat),
    },
  },
});
