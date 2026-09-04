# Settlement Unpacking Agent — frontend rebuild

A dark-first, 21st.dev-styled rebuild of the agent UI: a hero landing page plus a three-page app shell that reads live run data from your Antigravity backend.

## Look and feel

- Dark by default with a light/dark toggle (persisted, no flash on load).
- The 21st.dev hero language carries through the whole site: subtle grid background, radial accent glow, eyebrow pill, large tight-tracked headline, bottom fade, restrained fade-in/fade-up motion.
- Finance-grade palette: near-black canvas, deep indigo/blue primary (keeps the current brand feel from your screenshots), amber for warnings, emerald for passing checks, red for exceptions. All values as semantic tokens in `src/styles.css` — no hardcoded colors in components.
- Numbers and IDs in a mono face; headings in a modern geometric sans. Tables get quiet borders, zebra-free rows, sticky headers.

## Pages

```text
/                 Landing — hero, the problem, why underserved, five passes, run-at-a-glance stats
/input-data       Five source files, each a card with description + preview table
/how-it-works     Live pipeline flow diagram + "exact math behind each pass" accordions
/dashboard        KPI cards, pass status, exceptions-by-category chart,
                  reserve release forecast chart, filterable exception table
```

Landing is standalone (full-bleed hero). The three tool pages sit behind a shared app shell with a collapsible sidebar, header with theme toggle and run indicator.

### Landing
Hero (title "Settlement Unpacking Agent", eyebrow "Razorpay AI Buildathon 2026 — Track 4", CTA into the dashboard), then the problem / why-it's-underserved / what-this-agent-does sections as glass cards, then three live stat tiles.

### Input Data
One card per source file (settlement report, bank statement, GST invoice, sales ledger, reserve ledger) with row count, description, and a scrollable preview of the real rows.

### How It Works
Three-column flow — source files → five passes → exception types → orchestrator → report — rendered as styled nodes with connector lines, colored live from the run (grey = pass not implemented, amber = found exceptions). Below it, five collapsible panels with the formula for each pass in a code block.

### Results Dashboard
Four KPI tiles, five pass-status cards, horizontal bar chart of exceptions by category, reserve release forecast chart, and the exception table with category filter chips, search, and CSV export.

## Backend wiring (verified live)

I reached your Cloudflare tunnel and sampled every endpoint — the real shapes are confirmed, so nothing is hardcoded:

| Endpoint | Feeds |
| --- | --- |
| `GET /api/summary` | KPI cards: 5/5 passes, 17 exceptions, 25 batches, 120 orders, 25 bank credits |
| `GET /api/passes` | Five pass cards with `status`, `exception_count`, and per-pass `metrics` |
| `GET /api/forecast` | Reserve chart: total held / released / still held + `forecast_schedule` |
| `GET /api/exceptions` | Exception table: settlement_id, order_id, category, description, amount |
| `GET /api/data` + `/api/data/{name}` | Raw Data Explorer tabs with paging (offset/limit) |
| `POST /api/run` | "Re-run pipeline" button |

- Requests go through a thin server route in this app (`/api/proxy/*`) that forwards to the tunnel. This keeps the tunnel URL in one env var, survives tunnel restarts with a one-line change, and avoids any mixed-content or CORS surprises on the published site.
- TanStack Query with skeleton loading, per-card error states, and a manual refresh; the pass metrics also drive the How It Works diagram's live node colors and counts.
- Re-run pipeline triggers `POST /api/run`, shows progress, then invalidates every query so all pages refresh.
- Note: a `trycloudflare.com` tunnel URL changes each time you restart it — when it does, send me the new one (or set it as a secret) and everything reconnects.



## Technical notes

- Stack is already TanStack Start + Tailwind v4 + shadcn (`src/components/ui`) + TypeScript — no setup needed; `lucide-react`, `@radix-ui/react-slot`, `class-variance-authority` are all installed.
- New `src/components/ui/hero-1.tsx` implementing the supplied Hero component (props: eyebrow, title, subtitle, ctaLabel, ctaHref) using project tokens.
- `fade-in` / `fade-up` keyframes added to `src/styles.css`, plus grid-background and radial-accent utilities via `@utility`.
- Theme toggle via a `dark` class on `<html>` with an inline pre-hydration script in `__root.tsx`.
- Charts with Recharts (already installed), themed to the token palette.
- Per-route `head()` metadata with unique titles/descriptions.
