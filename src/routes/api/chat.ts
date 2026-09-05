import { createFileRoute } from "@tanstack/react-router";
import { getBackendBaseUrl } from "@/lib/backend-url";

type ChatMessage = { role: "user" | "assistant"; content: string };

function baseUrl() {
  return getBackendBaseUrl();
}


async function grab(base: string, path: string) {
  try {
    const res = await fetch(`${base}/api/${path}`, { headers: { accept: "application/json" } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function clip(value: unknown, max = 6000) {
  const text = JSON.stringify(value ?? null);
  return text.length > max ? `${text.slice(0, max)}… (truncated)` : text;
}

async function buildContext() {
  const base = baseUrl();
  if (!base) return "No pipeline data is available right now (backend not configured).";

  const [summary, passes, exceptions, forecast] = await Promise.all([
    grab(base, "summary"),
    grab(base, "passes"),
    grab(base, "exceptions"),
    grab(base, "forecast"),
  ]);

  return [
    `SUMMARY: ${clip(summary, 2000)}`,
    `PASSES: ${clip(passes, 3000)}`,
    `EXCEPTIONS: ${clip(exceptions, 8000)}`,
    `RESERVE FORECAST: ${clip(forecast, 3000)}`,
  ].join("\n\n");
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const lovableKey = process.env["LOVABLE_API_KEY"];
        const geminiKey =
          process.env["GEMINI_API_KEY"] ?? process.env["GOOGLE_API_KEY"] ?? undefined;
        const openaiKey = process.env["OPENAI_API_KEY"];

        if (!lovableKey && !geminiKey && !openaiKey) {
          return Response.json(
            {
              error:
                "AI is not configured on this deployment. Add a GEMINI_API_KEY (or OPENAI_API_KEY) environment variable and redeploy.",
            },
            { status: 500 },
          );
        }

        let messages: ChatMessage[] = [];
        try {
          const body = (await request.json()) as { messages?: ChatMessage[] };
          messages = Array.isArray(body.messages) ? body.messages.slice(-20) : [];
        } catch {
          return Response.json({ error: "Invalid request." }, { status: 400 });
        }
        if (messages.length === 0) {
          return Response.json({ error: "No message provided." }, { status: 400 });
        }

        const context = await buildContext();

        const systemPrompt = [
          "You are the Settlement Unpacking Agent assistant. You answer questions about the current reconciliation run: settlement batches, orders, MDR, GST on MDR, refunds, chargebacks, rolling reserve, exceptions and the five pipeline passes.",
          "Answer only from the run data below plus general Indian payments/GST knowledge. If the data does not contain the answer, say so plainly.",
          "Be concise (usually under 120 words), quote exact figures with ₹ where relevant, and use short plain-text lists rather than markdown tables.",
          "",
          "CURRENT RUN DATA:",
          context,
        ].join("\n");

        // Provider selection: Lovable gateway (Lovable hosting) -> Gemini -> OpenAI.
        let endpoint: string;
        let headers: Record<string, string>;
        let model: string;

        if (lovableKey) {
          endpoint = "https://ai.gateway.lovable.dev/v1/chat/completions";
          headers = { "content-type": "application/json", "Lovable-API-Key": lovableKey };
          model = "google/gemini-3.7-flash";
        } else if (geminiKey) {
          endpoint = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
          headers = { "content-type": "application/json", authorization: `Bearer ${geminiKey}` };
          model = "gemini-2.0-flash";
        } else {
          endpoint = "https://api.openai.com/v1/chat/completions";
          headers = { "content-type": "application/json", authorization: `Bearer ${openaiKey}` };
          model = "gpt-4o-mini";
        }

        const upstream = await fetch(endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify({
            model,
            messages: [{ role: "system", content: systemPrompt }, ...messages],
          }),
        });

        if (!upstream.ok) {
          const detail = await upstream.text().catch(() => "");
          const message =
            upstream.status === 429
              ? "Too many requests right now — try again in a moment."
              : upstream.status === 402
                ? "AI credits are exhausted for this workspace."
                : `The assistant could not answer (${upstream.status}). ${detail.slice(0, 200)}`;
          return Response.json({ error: message }, { status: upstream.status });
        }

        const data = (await upstream.json()) as {
          choices?: { message?: { content?: string } }[];
        };
        const reply = data.choices?.[0]?.message?.content?.trim() ?? "";
        return Response.json({ reply: reply || "I couldn't produce an answer for that." });
      },
    },
  },
});

