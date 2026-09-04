import { useMemo } from "react";

import GatewayFlow from "@/components/ui/gateway-flow";
import type { DatasetMeta, ExceptionRow, PassInfo } from "@/lib/api";
import { PASS_LABELS } from "@/lib/api";

/** Which source datasets feed which pass. Unknown names fall back to all passes. */
const DATASET_TO_PASSES: Record<string, string[]> = {
  settlement_report: [
    "pass1_batch_match",
    "pass2_order_validation",
    "pass3_reserve_forecast",
    "pass4_gst_itc",
    "pass5_cross_period",
  ],
  bank_statement: ["pass1_batch_match"],
  sales_ledger: ["pass2_order_validation", "pass5_cross_period"],
  reserve_ledger: ["pass3_reserve_forecast"],
  gst_invoice: ["pass4_gst_itc"],
};

/** Which pass raises which exception category. */
const CATEGORY_TO_PASS: Record<string, string> = {
  MISSING_UTR: "pass1_batch_match",
  UNEXPLAINED_DEDUCTION: "pass1_batch_match",
  MDR_RATE_MISMATCH: "pass2_order_validation",
  RESERVE_NOT_RELEASED: "pass3_reserve_forecast",
  GST_ITC_MISMATCH: "pass4_gst_itc",
  CROSS_PERIOD_SETTLEMENT: "pass5_cross_period",
};

type Node = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  subtitle?: string;
  tone: "source" | "pass" | "exception" | "hub" | "report" | "idle";
};

const COLS = {
  source: { cx: 150, w: 236 },
  pass: { cx: 540, w: 224 },
  exception: { cx: 930, w: 286 },
  hub: { cx: 1180, w: 148 },
  report: { cx: 1372, w: 176 },
};

const NODE_H = 62;
const ROW_GAP = 96;
const VIEW_W = 1480;
const PAD_Y = 56;

function column(
  ids: { id: string; title: string; subtitle?: string; tone: Node["tone"] }[],
  cx: number,
  w: number,
  totalH: number,
): Node[] {
  const height = ids.length * NODE_H + Math.max(0, ids.length - 1) * (ROW_GAP - NODE_H);
  const start = (totalH - height) / 2;
  return ids.map((n, i) => ({
    ...n,
    x: cx - w / 2,
    y: start + i * ROW_GAP,
    w,
    h: NODE_H,
  }));
}

function edge(from: Node, to: Node) {
  const x1 = from.x + from.w;
  const y1 = from.y + from.h / 2;
  const x2 = to.x;
  const y2 = to.y + to.h / 2;
  const dx = Math.max(40, (x2 - x1) * 0.5);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

export function KnowledgeGraph({
  datasets,
  passes,
  exceptions,
}: {
  datasets: DatasetMeta[];
  passes: PassInfo[];
  exceptions: ExceptionRow[];
}) {
  const { nodes, edges, height, totalExceptions } = useMemo(() => {
    const categoryCounts = new Map<string, number>();
    for (const e of exceptions) {
      categoryCounts.set(e.category, (categoryCounts.get(e.category) ?? 0) + 1);
    }
    const categories = [...categoryCounts.entries()].sort((a, b) => b[1] - a[1]);

    const rows = Math.max(datasets.length, passes.length, categories.length, 1);
    const totalH = rows * ROW_GAP - (ROW_GAP - NODE_H) + PAD_Y * 2;
    const inner = totalH - PAD_Y * 2;

    const sourceNodes = column(
      datasets.map((d) => ({
        id: `src:${d.name}`,
        title: `${d.name}.csv`,
        subtitle: `${d.rows} rows`,
        tone: "source" as const,
      })),
      COLS.source.cx,
      COLS.source.w,
      inner,
    );

    const passNodes = column(
      passes.map((p, i) => ({
        id: `pass:${p.pass_name}`,
        title: `Pass ${i + 1} · ${PASS_LABELS[p.pass_name] ?? p.pass_name.replace(/_/g, " ")}`,
        subtitle:
          p.status && p.status.toLowerCase() !== "implemented" && p.exception_count === 0
            ? p.status.replace(/_/g, " ")
            : `${p.exception_count} found`,
        tone:
          p.status && p.status.toLowerCase().includes("not")
            ? ("idle" as const)
            : ("pass" as const),
      })),
      COLS.pass.cx,
      COLS.pass.w,
      inner,
    );

    const exceptionNodes = column(
      categories.map(([cat, n]) => ({
        id: `exc:${cat}`,
        title: cat,
        subtitle: `${n} raised`,
        tone: "exception" as const,
      })),
      COLS.exception.cx,
      COLS.exception.w,
      inner,
    );

    const total = exceptions.length;
    const hub: Node = {
      id: "hub",
      x: COLS.hub.cx - COLS.hub.w / 2,
      y: inner / 2 - NODE_H / 2,
      w: COLS.hub.w,
      h: NODE_H,
      title: "Orchestrator",
      tone: "hub",
    };
    const report: Node = {
      id: "report",
      x: COLS.report.cx - COLS.report.w / 2,
      y: inner / 2 - NODE_H / 2,
      w: COLS.report.w,
      h: NODE_H,
      title: "Report",
      subtitle: `${total} total exceptions`,
      tone: "report",
    };

    const byId = new Map<string, Node>();
    for (const n of [...sourceNodes, ...passNodes, ...exceptionNodes, hub, report]) {
      byId.set(n.id, n);
    }

    const links: { d: string; kind: "flow" | "raise" | "hub" }[] = [];
    const passIds = passes.map((p) => p.pass_name);

    for (const d of datasets) {
      const targets = DATASET_TO_PASSES[d.name] ?? passIds;
      for (const t of targets) {
        const from = byId.get(`src:${d.name}`);
        const to = byId.get(`pass:${t}`);
        if (from && to) links.push({ d: edge(from, to), kind: "flow" });
      }
    }

    for (const [cat] of categories) {
      const passId = CATEGORY_TO_PASS[cat];
      const from = passId ? byId.get(`pass:${passId}`) : undefined;
      const to = byId.get(`exc:${cat}`);
      if (from && to) links.push({ d: edge(from, to), kind: "raise" });
      if (to) links.push({ d: edge(to, hub), kind: "hub" });
    }

    for (const p of passes) {
      const from = byId.get(`pass:${p.pass_name}`);
      const hasCategory = categories.some(([c]) => CATEGORY_TO_PASS[c] === p.pass_name);
      if (from && !hasCategory) links.push({ d: edge(from, hub), kind: "hub" });
    }

    links.push({ d: edge(hub, report), kind: "hub" });

    return {
      nodes: [...sourceNodes, ...passNodes, ...exceptionNodes, hub, report],
      edges: links,
      height: totalH,
      totalExceptions: total,
    };
  }, [datasets, passes, exceptions]);

  const groups: { label: string; cx: number; w: number }[] = [
    { label: "Source data (this run)", cx: COLS.source.cx, w: COLS.source.w + 56 },
    { label: "Matching passes (live status)", cx: COLS.pass.cx, w: COLS.pass.w + 56 },
    { label: "Exceptions raised (live counts)", cx: COLS.exception.cx, w: COLS.exception.w + 56 },
  ];

  return (
    <div className="panel relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 opacity-60">
        <GatewayFlow density={0.7} speed={0.7} opacity={0.55} strokeWidth={0.9} />
      </div>

      <div className="relative overflow-x-auto p-4 sm:p-6">
        <svg
          viewBox={`0 0 ${VIEW_W} ${height}`}
          className="h-auto w-full min-w-[980px]"
          role="img"
          aria-label={`Live knowledge graph: ${datasets.length} source files feeding ${nodes.length} nodes and ${totalExceptions} exceptions`}
        >
          <defs>
            <marker
              id="kg-arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" className="fill-muted-foreground/60" />
            </marker>
          </defs>

          <g transform={`translate(0, ${PAD_Y})`}>
            {groups.map((g) => (
              <g key={g.label}>
                <rect
                  x={g.cx - g.w / 2}
                  y={-36}
                  width={g.w}
                  height={height - PAD_Y * 2 + 68}
                  rx={20}
                  className="fill-foreground/[0.02] stroke-border"
                  strokeDasharray="6 7"
                />
                <text
                  x={g.cx}
                  y={-46}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[15px] tracking-[0.14em] uppercase"
                >
                  {g.label}
                </text>
              </g>
            ))}

            {edges.map((e, i) => (
              <path
                key={i}
                d={e.d}
                fill="none"
                strokeWidth={1.4}
                markerEnd="url(#kg-arrow)"
                className={
                  e.kind === "flow"
                    ? "stroke-primary/35"
                    : e.kind === "raise"
                      ? "stroke-warning/50"
                      : "stroke-muted-foreground/35"
                }
                strokeDasharray="7 9"
              >
                <animate
                  attributeName="stroke-dashoffset"
                  from="32"
                  to="0"
                  dur="2.4s"
                  repeatCount="indefinite"
                />
              </path>
            ))}

            {nodes.map((n) => (
              <GraphNode key={n.id} node={n} />
            ))}
          </g>
        </svg>
      </div>

      <p className="relative border-t border-border px-6 py-4 text-xs leading-relaxed text-muted-foreground">
        Generated live from the current run — node labels, row counts and exception totals all come
        from the pipeline API, not a static diagram. Amber nodes mean that pass flagged something;
        muted nodes mean the pass reported nothing to raise.
      </p>
    </div>
  );
}

function GraphNode({ node }: { node: Node }) {
  const tone = {
    source: {
      box: "fill-primary/10 stroke-primary/45",
      title: "fill-foreground",
      sub: "fill-muted-foreground",
      rx: 30,
    },
    pass: {
      box: "fill-primary/20 stroke-primary/60",
      title: "fill-foreground",
      sub: "fill-muted-foreground",
      rx: 14,
    },
    idle: {
      box: "fill-muted/40 stroke-border",
      title: "fill-muted-foreground",
      sub: "fill-muted-foreground",
      rx: 14,
    },
    exception: {
      box: "fill-warning/20 stroke-warning/60",
      title: "fill-foreground",
      sub: "fill-muted-foreground",
      rx: 10,
    },
    hub: {
      box: "fill-foreground/90 stroke-foreground",
      title: "fill-background",
      sub: "fill-background",
      rx: 16,
    },
    report: {
      box: "fill-success/25 stroke-success/70",
      title: "fill-foreground",
      sub: "fill-muted-foreground",
      rx: 16,
    },
  }[node.tone];

  return (
    <g>
      <rect
        x={node.x}
        y={node.y}
        width={node.w}
        height={node.h}
        rx={tone.rx}
        strokeWidth={1.2}
        className={tone.box}
      />
      <text
        x={node.x + node.w / 2}
        y={node.y + (node.subtitle ? 26 : 36)}
        textAnchor="middle"
        className={`${tone.title} text-[15px] font-medium`}
      >
        {node.title}
      </text>
      {node.subtitle ? (
        <text
          x={node.x + node.w / 2}
          y={node.y + 45}
          textAnchor="middle"
          className={`${tone.sub} font-mono text-[13px]`}
        >
          {node.subtitle}
        </text>
      ) : null}
    </g>
  );
}
