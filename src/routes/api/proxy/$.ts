import { createFileRoute } from "@tanstack/react-router";

// SETTLEMENT_API_URL is the single source of truth for the backend base URL.
// Set it as a project secret in production, or in a git-ignored .env.local for
// local development (see .env.example). There is deliberately no fallback URL.
function baseUrl() {
  const configured = process.env["SETTLEMENT_API_URL"]?.trim();
  if (!configured) {
    throw new Error(
      "SETTLEMENT_API_URL is not configured. Set it to the pipeline backend base URL (e.g. https://your-backend-url.example.com).",
    );
  }
  return configured.replace(/\/$/, "");
}

async function forward(request: Request, splat: string | undefined) {
  let base: string;
  try {
    base = baseUrl();
  } catch (error) {
    return Response.json(
      {
        error: "backend_not_configured",
        message: error instanceof Error ? error.message : "SETTLEMENT_API_URL is not configured",
      },
      { status: 503 },
    );
  }

  const incoming = new URL(request.url);
  const target = `${base}/api/${splat ?? ""}${incoming.search}`;
  const body = request.method === "POST" ? await request.arrayBuffer() : undefined;
  const contentType = request.headers.get("content-type");

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
