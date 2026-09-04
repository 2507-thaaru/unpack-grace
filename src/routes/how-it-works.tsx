import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";

import { AppShell, SectionHeading } from "@/components/app-shell";
import { datasetsQuery, PASS_LABELS, passesQuery } from "@/lib/api";

export const Route = createFileRoute("/how-it-works")({
  head: () => ({
    meta: [
      { title: "How It Works — Settlement Unpacking Agent" },
      {
        name: "description",
        content:
          "The five reconciliation passes explained: batch match, order validation, reserve forecast, GST ITC check and cross-period flagging, with the maths behind each.",
      },
      { property: "og:title", content: "How It Works — Settlement Unpacking Agent" },
      {
        property: "og:description",
        content: "Source files, five passes, exceptions and orchestration — end to end.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HowItWorks,
});

const MATH: { title: string; body: string }[] = [
  {
    title: "Pass 1 — Batch match",
    body: "settlement_amount = gross_sales − refunds − chargebacks − MDR − GST_on_MDR − reserve_held + reserve_released. The computed net must equal the bank credit for that UTR. Any credit without a matching UTR, or a delta beyond rounding tolerance, is an exception.",
  },
  {
    title: "Pass 2 — Order validation",
    body: "For each order: expected_MDR = order_amount × contracted_rate, and expected_GST = expected_MDR × 18%. Where the charged MDR deviates from the contracted rate, the difference is an MDR_RATE_MISMATCH; unexplained residue after all known deductions is an UNEXPLAINED_DEDUCTION.",
  },
  {
    title: "Pass 3 — Reserve forecast",
    body: "still_held = reserve_held − reserve_released per batch, with release_due_date = settlement_date + reserve_period. Batches past their due date with a non-zero balance are flagged RESERVE_NOT_RELEASED and the rest form the forward release schedule.",
  },
  {
    title: "Pass 4 — GST ITC check",
    body: "GST on MDR is claimable input tax credit only when a matching tax invoice exists with the same taxable value. Invoice GST vs settlement GST_on_MDR is compared line by line; any gap is a GST_ITC_MISMATCH — real, unclaimed money.",
  },
  {
    title: "Pass 5 — Cross-period flag",
    body: "When the transaction date and the settlement date fall in different GST filing months, revenue and ITC land in different returns. Those batches are flagged CROSS_PERIOD_SETTLEMENT so the ledger entry can be split correctly.",
  },
];

function HowItWorks() {
  const passes = useQuery(passesQuery());
  const datasets = useQuery(datasetsQuery());

  return (
    <AppShell
      title="How It Works"
      description="Source files flow through five passes into a single exception register"
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_auto_1fr_auto_1fr] lg:items-stretch">
        <div className="panel p-6">
          <SectionHeading>Source files</SectionHeading>
          <ul className="space-y-2">
            {(datasets.data?.datasets ?? []).map((d) => (
              <li
                key={d.name}
                className="flex items-center justify-between rounded-lg border border-border bg-background/40 px-3 py-2 text-xs"
              >
                <span className="text-foreground">{d.name.replace(/_/g, " ")}</span>
                <span className="font-mono text-muted-foreground">{d.rows}</span>
              </li>
            ))}
          </ul>
        </div>

        <Arrow />

        <div className="panel p-6">
          <SectionHeading>Five passes</SectionHeading>
          <ul className="space-y-2">
            {(passes.data ?? []).map((p, i) => (
              <li
                key={p.pass_name}
                className="rounded-lg border border-border bg-background/40 px-3 py-2"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="text-foreground">
                    <span className="mr-2 font-mono text-primary">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {PASS_LABELS[p.pass_name] ?? p.pass_name.replace(/_/g, " ")}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] ${
                      p.exception_count === 0
                        ? "bg-emerald-500/15 text-emerald-500"
                        : "bg-amber-500/15 text-amber-500"
                    }`}
                  >
                    {p.exception_count}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <Arrow />

        <div className="panel p-6">
          <SectionHeading>Outputs</SectionHeading>
          <div className="space-y-2 text-xs text-muted-foreground">
            <p className="rounded-lg border border-border bg-background/40 px-3 py-2 text-foreground">
              Exception register
            </p>
            <p className="rounded-lg border border-border bg-background/40 px-3 py-2 text-foreground">
              Reserve release forecast
            </p>
            <p className="rounded-lg border border-border bg-background/40 px-3 py-2 text-foreground">
              Ledger-ready batch explosion
            </p>
            <p className="pt-2 leading-relaxed">
              The orchestrator runs all five passes over the same exploded batch data on every
              invocation of <span className="font-mono">POST /api/run</span>.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-10">
        <SectionHeading>The maths behind each pass</SectionHeading>
        <div className="space-y-3">
          {MATH.map((m) => (
            <details key={m.title} className="panel group p-5">
              <summary className="cursor-pointer list-none text-sm font-medium text-foreground">
                {m.title}
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{m.body}</p>
            </details>
          ))}
        </div>
      </div>
    </AppShell>
  );
}

function Arrow() {
  return (
    <div className="hidden items-center justify-center lg:flex">
      <ArrowRight className="size-5 text-muted-foreground" />
    </div>
  );
}
