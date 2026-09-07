import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  StatsCost,
  StatsCostAggregate,
  StatsCostEntity,
  StatsCostPeriod,
  StatsEffortCostEntity,
  StatsHarnessCost,
  StatsModelEffortPair,
  StatsOverview,
  StatsProvenance,
  StatsDistribution,
  StatsPerformance,
  StatsPerformanceAggregate,
  StatsPerformanceEntity,
  StatsProjectCostEntity,
  StatsSessionEntity,
  StatsSessionHarness,
  StatsSessionPeriod,
} from "../types";
import { formatCostAmount } from "../lib/costLabel";
import { harnessColor } from "../lib/harness";
import { Tooltip, TooltipProvider } from "./ui/tooltip";

export type StatsTab = "runs" | "sessions" | "triggers" | "cost" | "performance";

const CHART = {
  runs: "#58a6ff",
  errors: "#f85149",
  fires: "#3fb950",
  grid: "#30363d",
  axis: "#8b949e",
} as const;

const AXIS_PROPS = {
  stroke: CHART.axis,
  tick: { fill: CHART.axis, fontSize: 10 },
} as const;

function ChartFrame({ children }: { children: React.ReactElement }) {
  return (
    <div style={{ width: "100%", height: 220 }}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-1 py-8 text-center text-fg-4" style={{ fontSize: "11.5px" }}>
      {children}
    </div>
  );
}

function HarnessLegend({ harnesses }: { harnesses: string[] }) {
  return (
    <div className="flex flex-wrap gap-3 text-fg-3" style={{ fontSize: "10.5px" }}>
      {harnesses.map((harness) => (
        <span key={harness} className="flex items-center gap-1.5">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: harnessColor(harness) }}
            data-testid={`stats-harness-legend-${harness}`}
          />
          {harness}
        </span>
      ))}
    </div>
  );
}

function flattenPeriods(
  periods: (StatsSessionPeriod | StatsCostPeriod)[],
  value: "executions" | "usd",
) {
  return periods.map((period) => ({
    bucket: period.bucket,
    ...Object.fromEntries(
      period.harnesses.map((harness) => [
        harness.harness,
        value === "usd" ? ("usd" in harness ? harness.usd : null) : harness.executions,
      ]),
    ),
  }));
}

function isHarnessCost(
  metric: StatsSessionHarness | StatsHarnessCost | undefined,
): metric is StatsHarnessCost {
  return metric !== undefined && "average_usd" in metric;
}

function HarnessBars({
  periods,
  harnesses,
  value,
}: {
  periods: (StatsSessionPeriod | StatsCostPeriod)[];
  harnesses: string[];
  value: "executions" | "usd";
}) {
  if (periods.length === 0) return <EmptyNote>No activity in this period.</EmptyNote>;
  return (
    <ChartFrame>
      <BarChart data={flattenPeriods(periods, value)} margin={{ top: 8, right: 8, left: -12 }}>
        <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="bucket" {...AXIS_PROPS} />
        <YAxis allowDecimals={value === "usd"} {...AXIS_PROPS} />
        <RTooltip
          contentStyle={{ background: "#161b22", border: `1px solid ${CHART.grid}`, fontSize: 11 }}
          formatter={(raw, name) => {
            if (raw == null) return ["—", String(name)];
            const amount = typeof raw === "number" ? raw : Number(raw);
            const metric = periods
              .flatMap((period) => period.harnesses)
              .find((harness) => harness.harness === String(name));
            const costMetric = isHarnessCost(metric) ? metric : undefined;
            const label =
              value === "usd"
                ? formatCostAmount(
                    amount,
                    costMetric?.partial ?? false,
                    costMetric?.estimated ?? true,
                  )
                : amount;
            return [label, String(name)];
          }}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {harnesses.map((harness) => (
          <Bar
            key={harness}
            dataKey={harness}
            name={harness}
            stackId="harness"
            fill={harnessColor(harness)}
          />
        ))}
      </BarChart>
    </ChartFrame>
  );
}

function RunsTab({ overview }: { overview: StatsOverview }) {
  if (overview.buckets.length === 0) return <EmptyNote>No runs in this period.</EmptyNote>;
  const runs = new Map(overview.runs.map((row) => [row.bucket, row.count]));
  const errors = new Map(overview.errors.map((row) => [row.bucket, row.count]));
  const data = overview.buckets.map((bucket) => ({
    bucket,
    runs: runs.get(bucket) ?? 0,
    errors: errors.get(bucket) ?? 0,
  }));
  return (
    <div data-testid="stats-chart-runs">
      <ChartFrame>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -18 }}>
          <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="bucket" {...AXIS_PROPS} />
          <YAxis allowDecimals={false} {...AXIS_PROPS} />
          <RTooltip
            contentStyle={{ background: "#161b22", border: `1px solid ${CHART.grid}`, fontSize: 11 }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="runs" name="Runs" fill={CHART.runs} />
          <Bar dataKey="errors" name="Errors (failed)" fill={CHART.errors} />
        </BarChart>
      </ChartFrame>
    </div>
  );
}

function MasterList<T extends { id: string; name: string }>({
  rows,
  selected,
  valueLabel,
  onSelect,
  ariaLabel = "Spenders",
  monoName = false,
}: {
  rows: T[];
  selected: string | null;
  valueLabel: (row: T) => string;
  onSelect: (id: string | null) => void;
  ariaLabel?: string;
  /** Model ids are ids — render them mono (ADR-0065 §2). */
  monoName?: boolean;
}) {
  const options = [{ id: "__total__", name: "Total" } as T, ...rows];
  const selectedIndex = Math.max(
    0,
    options.findIndex((row) => (selected === null ? row.id === "__total__" : row.id === selected)),
  );
  const [focusIndex, setFocusIndex] = useState(selectedIndex);
  const activeFocusIndex = Math.min(focusIndex, options.length - 1);

  return (
    <div
      role="listbox"
      aria-label={ariaLabel}
      className="flex flex-col gap-1"
      onKeyDown={(event) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          const delta = event.key === "ArrowDown" ? 1 : -1;
          setFocusIndex((activeFocusIndex + delta + options.length) % options.length);
        } else if (event.key === "Enter") {
          event.preventDefault();
          const row = options[activeFocusIndex];
          onSelect(row.id === "__total__" ? null : row.id);
        } else if (event.key === "Backspace" || event.key === "ArrowLeft") {
          event.preventDefault();
          onSelect(null);
        }
      }}
    >
      {options.map((row, index) => {
        const isSelected = row.id === (selected ?? "__total__");
        return (
          <button
            key={row.id}
            type="button"
            role="option"
            aria-selected={isSelected}
            tabIndex={index === activeFocusIndex ? 0 : -1}
            onFocus={() => setFocusIndex(index)}
            onClick={() => onSelect(row.id === "__total__" ? null : row.id)}
            className={`flex items-center justify-between gap-3 rounded px-2 py-2 text-left ${
              isSelected ? "bg-bg-5 text-fg" : "text-fg-3 hover:bg-bg-3"
            }`}
            style={{ fontSize: "11.5px" }}
          >
            <span className={`truncate ${monoName ? "font-mono" : ""}`}>{row.name}</span>
            <span className="shrink-0 font-mono text-fg-2">
              {row.id === "__total__" ? "" : valueLabel(row)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function SessionsTab({ overview }: { overview: StatsOverview }) {
  const rows = useMemo(
    () => [...overview.sessions_by_pipeline].sort((a, b) => b.executions - a.executions),
    [overview.sessions_by_pipeline],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = rows.find((row) => row.id === selectedId) ?? null;
  const periods = selected ? selected.by_period : overview.sessions_by_period;
  const detailRows = selected?.nodes ?? rows;

  return (
    <div className="flex flex-col gap-4" data-testid="stats-chart-sessions">
      <HarnessLegend harnesses={overview.session_harnesses} />
      <HarnessBars periods={periods} harnesses={overview.session_harnesses} value="executions" />
      <div className="flex min-h-[220px] gap-4">
        <div className="min-w-[250px] border-r border-line pr-3">
          <MasterList
            rows={rows}
            selected={selectedId}
            valueLabel={(row) => String(row.executions)}
            onSelect={setSelectedId}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-3 text-fg-4" style={{ fontSize: "10.5px" }}>
            Total{selected ? ` / ${selected.name}` : ""}
          </div>
          <SessionTable rows={detailRows} harnesses={overview.session_harnesses} />
        </div>
      </div>
    </div>
  );
}

function SessionTable({ rows, harnesses }: { rows: StatsSessionEntity[]; harnesses: string[] }) {
  return (
    <table className="w-full table-fixed text-left" style={{ fontSize: "11px" }}>
      <thead className="text-fg-4">
        <tr>
          <th className="pb-2 font-medium">Name</th>
          <th className="w-20 pb-2 text-right font-medium">Total</th>
          {harnesses.map((harness) => (
            <th key={harness} className="w-24 pb-2 text-right font-medium">
              <span className="inline-flex items-center gap-1">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: harnessColor(harness) }}
                />
                {harness}
              </span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id} className="border-t border-line text-fg-2" tabIndex={0}>
            <td className="py-2 pr-2">{row.name}</td>
            <td className="py-2 text-right font-mono">{row.executions}</td>
            {harnesses.map((harness) => (
              <td
                key={harness}
                className="py-2 text-right font-mono"
                data-harness={harness}
              >
                {row.harnesses.find((item) => item.harness === harness)?.executions ?? "—"}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TriggersTab({ overview }: { overview: StatsOverview }) {
  const kpi = overview.triggers_created_runs;
  return (
    <div data-testid="stats-chart-triggers" className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2" style={{ fontSize: "11px" }}>
        <span className="rounded bg-bg-3 px-2 py-1 text-fg-2" data-testid="stats-kpi-created-runs">
          Fires that created a run: <span className="font-mono text-fg">{kpi.fired}</span>
        </span>
        <span className="rounded bg-bg-3 px-2 py-1 text-fg-2" data-testid="stats-kpi-distinct">
          <span className="font-mono text-fg">{kpi.distinct_triggers}</span> of{" "}
          <span className="font-mono text-fg">{kpi.enabled_triggers}</span> enabled triggers fired
        </span>
      </div>
      {overview.fires_by_pipeline.length === 0 ? (
        <EmptyNote>No trigger fires in this period.</EmptyNote>
      ) : (
        <ChartFrame>
          <BarChart data={overview.fires_by_pipeline}>
            <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="pipeline_id" {...AXIS_PROPS} />
            <YAxis allowDecimals={false} {...AXIS_PROPS} />
            <RTooltip
              contentStyle={{
                background: "#161b22",
                border: `1px solid ${CHART.grid}`,
                fontSize: 11,
              }}
            />
            <Bar dataKey="count" name="Fires" fill={CHART.fires} />
          </BarChart>
        </ChartFrame>
      )}
    </div>
  );
}

function coverage(metric: StatsHarnessCost, unit: "Run" | "execution"): string {
  const parts = [
    `${metric.readable} readable ${metric.readable === 1 ? "cost" : "costs"} of ${metric.executions} ${
      metric.executions === 1 ? unit : `${unit}s`
    }`,
  ];
  if (metric.unpriced_models.length) {
    parts.push(`Lower bound; unpriced: ${metric.unpriced_models.join(", ")}`);
  }
  if (metric.missing_reasons.length) parts.push(metric.missing_reasons.join("; "));
  return parts.join(". ");
}

function HarnessCards({ aggregate }: { aggregate: StatsCostAggregate }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {aggregate.harnesses.map((metric) => (
        <div
          key={metric.harness}
          className="rounded-md border border-line bg-bg-3 p-3"
          data-testid={`stats-harness-card-${metric.harness}`}
        >
          <div className="mb-2 flex items-center gap-1.5 text-fg-3" style={{ fontSize: "10.5px" }}>
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: harnessColor(metric.harness) }}
            />
            {metric.harness}
          </div>
          <div className="font-mono text-fg" style={{ fontSize: "15px" }}>
            {formatCostAmount(metric.usd, metric.partial, metric.estimated)}
          </div>
          <div className="mt-1 text-fg-4" style={{ fontSize: "10px" }}>
            {metric.average_usd === null
              ? "— avg"
              : `${formatCostAmount(metric.average_usd, metric.partial, metric.estimated)} avg`}
          </div>
        </div>
      ))}
    </div>
  );
}

function CostCell({
  metric,
  unit,
}: {
  metric: StatsHarnessCost | undefined;
  unit: "Run" | "execution";
}) {
  if (!metric) return <span className="font-mono text-fg-4">—</span>;
  const detail = coverage(metric, unit);
  return (
    <div className="flex flex-col items-end font-mono">
      <span>{formatCostAmount(metric.usd, metric.partial, metric.estimated)}</span>
      <Tooltip content={detail} side="top">
        <button
          type="button"
          aria-label={detail}
          className="text-fg-4 underline decoration-dotted underline-offset-2"
          style={{ fontSize: "9.5px" }}
        >
          {metric.average_usd === null
            ? "— avg"
            : `${formatCostAmount(metric.average_usd, metric.partial, metric.estimated)} avg`}
        </button>
      </Tooltip>
    </div>
  );
}

/** Where a requested value was read from — the « ? » tooltip copy (ADR-0065 §1).
 *  Observed values are the norm and carry nothing; the vocabulary never says
 *  "real". */
const PROVENANCE_COPY: Record<Exclude<StatsProvenance, "observed">, string> = {
  requested: "requested at node startup, not observed in transcripts",
  mixed: "partly requested at node startup, not observed in every transcript",
};

/** Hovering the italic "not set" effort says why the bucket exists. */
const NOT_SET_COPY = "no effort requested at node startup nor observed in transcripts";

function ProvenanceMark({
  provenance,
  target,
}: {
  provenance: Exclude<StatsProvenance, "observed">;
  target: "model" | "effort";
}) {
  const copy = PROVENANCE_COPY[provenance];
  return (
    <Tooltip content={copy} side="top">
      <button
        type="button"
        aria-label={copy}
        data-testid={`stats-provenance-${target}`}
        className="ml-0.5 align-super text-fg-4 hover:text-fg-2"
        style={{ fontSize: "8.5px" }}
      >
        ?
      </button>
    </Tooltip>
  );
}

function Breadcrumb({
  crumbs,
}: {
  crumbs: { label: string; onClick?: () => void }[];
}) {
  return (
    <div
      className="mb-3 text-fg-4"
      style={{ fontSize: "10.5px" }}
      data-testid="stats-cost-breadcrumb"
    >
      {crumbs.map((crumb, index) => (
        <span key={`${crumb.label}-${index}`}>
          {index > 0 ? " / " : ""}
          {crumb.onClick ? (
            <button
              type="button"
              aria-label={`Back to ${crumb.label}`}
              onClick={crumb.onClick}
              className="hover:text-fg-2 underline decoration-dotted underline-offset-2"
            >
              {crumb.label}
            </button>
          ) : (
            <span className="text-fg-3">{crumb.label}</span>
          )}
        </span>
      ))}
    </div>
  );
}

function pairMetric(pair: StatsModelEffortPair): StatsHarnessCost {
  return {
    harness: "total",
    usd: pair.usd,
    estimated: pair.estimated,
    partial: pair.partial,
    executions: pair.executions,
    readable: pair.readable,
    unknown: pair.unknown,
    average_usd: pair.average_usd,
    unpriced_models: pair.unpriced_models,
    missing_reasons: pair.missing_reasons,
  };
}

function effortNameCell(row: StatsEffortCostEntity): React.ReactNode {
  if (row.effort === null) {
    // The "not set" bucket: hovering the italic word explains it (ADR-0065 §1).
    // A plain span — the row-name button around it stays the single interactive
    // element, and the tooltip is a description, not a second control.
    return (
      <Tooltip content={NOT_SET_COPY} side="top">
        <span className="italic text-fg-4">not set</span>
      </Tooltip>
    );
  }
  return (
    <span className="inline-flex items-baseline gap-0.5">
      {row.name}
      {row.provenance && row.provenance !== "observed" && (
        <ProvenanceMark provenance={row.provenance} target="effort" />
      )}
    </span>
  );
}

function CostTable({
  rows,
  harnesses,
  unit,
  onOpen,
  renderName,
  expandablePairs = false,
}: {
  rows: StatsCostEntity[];
  harnesses: string[];
  unit: "Run" | "execution";
  onOpen?: (row: StatsCostEntity) => void;
  /** Replaces the default (button-or-plain) name cell — the model axis marks
   *  provenance and renders "not set" in its own voice. */
  renderName?: (row: StatsCostEntity) => React.ReactNode;
  /** Node rows gain a chevron unfolding their model × effort pairs (ADR-0065).
   *  Off on the model axis, where the model × effort path is already the drill. */
  expandablePairs?: boolean;
}) {
  const sorted = [...rows].sort((a, b) => (b.usd ?? -1) - (a.usd ?? -1));
  // Expansion state lives HERE and dies with the table: the parent keys the
  // table on the drill path, so a stale expanded set never leaks across Nodes.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  return (
    <TooltipProvider>
      <table className="w-full table-fixed text-left" style={{ fontSize: "11px" }}>
        <thead className="text-fg-4">
          <tr>
            <th className="pb-2 font-medium">Name</th>
            <th className="w-28 pb-2 text-right font-medium">Total</th>
            {harnesses.map((harness) => (
              <th key={harness} className="w-28 pb-2 text-right font-medium">
                <span className="inline-flex items-center gap-1">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: harnessColor(harness) }}
                  />
                  {harness}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const pairs = expandablePairs ? (row.models ?? []) : [];
            return (
              <Fragment key={row.id}>
                <tr
                  className="border-t border-line text-fg-2"
                  tabIndex={0}
                  data-testid="stats-detail-row"
                >
                  <td className="py-2 pr-2">
                    <span className="inline-flex items-center gap-1">
                      {pairs.length > 0 ? (
                        <button
                          type="button"
                          aria-label={`${expanded.has(row.id) ? "Collapse" : "Expand"} ${row.name} models`}
                          data-testid="stats-node-toggle"
                          onClick={() =>
                            setExpanded((current) => {
                              const next = new Set(current);
                              if (next.has(row.id)) next.delete(row.id);
                              else next.add(row.id);
                              return next;
                            })
                          }
                          className="shrink-0 hover:text-fg"
                        >
                          {expanded.has(row.id) ? (
                            <ChevronDown size={12} />
                          ) : (
                            <ChevronRight size={12} />
                          )}
                        </button>
                      ) : null}
                      {(() => {
                        const content = renderName ? renderName(row) : row.name;
                        return onOpen ? (
                          <button
                            type="button"
                            aria-label={`Open ${row.name}`}
                            onClick={() => onOpen(row)}
                            className="text-left hover:text-fg"
                          >
                            {content}
                          </button>
                        ) : (
                          <span>{content}</span>
                        );
                      })()}
                    </span>
                  </td>
                  <td className="py-2 text-right">
                    <CostCell
                      unit={unit}
                      metric={{
                        harness: "total",
                        usd: row.usd,
                        estimated: row.estimated,
                        partial: row.partial,
                        executions: row.executions,
                        readable: row.readable,
                        unknown: row.unknown,
                        average_usd: row.average_usd,
                        unpriced_models: row.unpriced_models,
                        missing_reasons: row.missing_reasons,
                      }}
                    />
                  </td>
                  {harnesses.map((harness) => (
                    <td key={harness} className="py-2 text-right">
                      <CostCell
                        unit={unit}
                        metric={row.harnesses.find((item) => item.harness === harness)}
                      />
                    </td>
                  ))}
                </tr>
                {expanded.has(row.id)
                  ? pairs.map((pair) => (
                      <tr
                        key={`${row.id}-${pair.model}-${pair.effort ?? ""}`}
                        className="border-t border-line bg-bg-3/40 text-fg-3"
                        data-testid="stats-model-effort-row"
                      >
                        <td className="py-2 pl-7 pr-2">
                          <span className="inline-flex items-baseline gap-0.5">
                            <span className="font-mono">{pair.model}</span>
                            {pair.model_provenance !== "observed" && (
                              <ProvenanceMark
                                provenance={pair.model_provenance}
                                target="model"
                              />
                            )}
                            <span className="text-fg-4">·</span>
                            {pair.effort === null ? (
                              <Tooltip content={NOT_SET_COPY} side="top">
                                <span className="italic text-fg-4">not set</span>
                              </Tooltip>
                            ) : (
                              <span className="inline-flex items-baseline gap-0.5">
                                {pair.effort}
                                {pair.effort_provenance &&
                                  pair.effort_provenance !== "observed" && (
                                    <ProvenanceMark
                                      provenance={pair.effort_provenance}
                                      target="effort"
                                    />
                                  )}
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="py-2 text-right">
                          <CostCell unit={unit} metric={pairMetric(pair)} />
                        </td>
                        {harnesses.map((harness) => (
                          <td key={harness} className="py-2 text-right">
                            <CostCell
                              unit={unit}
                              metric={pair.harnesses.find(
                                (item) => item.harness === harness,
                              )}
                            />
                          </td>
                        ))}
                      </tr>
                    ))
                  : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </TooltipProvider>
  );
}

type CostAxis = "pipeline" | "project" | "model";

function CostTab({
  cost,
  error,
}: {
  cost: StatsCost | null;
  error: string | null;
}) {
  const [axis, setAxis] = useState<CostAxis>("pipeline");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drilledPipelineId, setDrilledPipelineId] = useState<string | null>(null);
  // The model axis drills Model → Effort → Pipeline → Node (ADR-0065). The
  // effort id is "" for the "not set" bucket, so selection is `null` vs value,
  // never falsy-compared.
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [selectedEffortId, setSelectedEffortId] = useState<string | null>(null);
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null);

  if (error) {
    return (
      <div className="rounded-md border border-st-failed/30 bg-st-failed-bg px-3 py-2 text-st-failed">
        {error}
      </div>
    );
  }
  if (!cost) return <EmptyNote>Loading cost…</EmptyNote>;

  const toTotal = () => {
    setSelectedId(null);
    setDrilledPipelineId(null);
    setSelectedModelId(null);
    setSelectedEffortId(null);
    setSelectedPipelineId(null);
  };

  // Model axis: resolve the drill path.
  const model =
    axis === "model"
      ? (cost.by_model.find((row) => row.id === selectedModelId) ?? null)
      : null;
  const effort =
    model && selectedEffortId !== null
      ? (model.efforts.find((row) => row.id === selectedEffortId) ?? null)
      : null;
  const modelPipeline =
    effort && selectedPipelineId !== null
      ? (effort.pipelines.find((row) => row.id === selectedPipelineId) ?? null)
      : null;

  const rows: StatsCostEntity[] =
    axis === "pipeline"
      ? cost.by_pipeline
      : axis === "project"
        ? cost.by_project
        : cost.by_model;
  const selected =
    axis === "model" ? null : (rows.find((row) => row.id === selectedId) ?? null);
  const drilledPipeline =
    axis === "project" && selected
      ? ((selected as StatsProjectCostEntity).pipelines.find(
          (pipeline) => pipeline.id === drilledPipelineId,
        ) ?? null)
      : null;

  const aggregate =
    axis === "model"
      ? (modelPipeline ?? effort ?? model ?? cost.total)
      : (drilledPipeline ?? selected ?? cost.total);
  const periods =
    axis === "model"
      ? (modelPipeline ?? effort ?? model)?.by_period ?? cost.by_period
      : drilledPipeline
        ? drilledPipeline.by_period
        : selected
          ? selected.by_period
          : cost.by_period;

  // The denominator the headline names (ADR-0065 §3): a model bucket counts
  // executions — the whole model axis reads "per execution" — and so does the
  // Node level of the other axes.
  const atNodeLevel =
    axis === "model" ? true : axis === "pipeline" ? selected !== null : drilledPipeline !== null;
  const detailUnit: "Run" | "execution" = atNodeLevel ? "execution" : "Run";

  let detailRows: StatsCostEntity[];
  let detailRenderName: ((row: StatsCostEntity) => React.ReactNode) | undefined;
  let onOpen: ((row: StatsCostEntity) => void) | undefined;
  if (axis === "model") {
    if (modelPipeline) {
      detailRows = modelPipeline.nodes;
    } else if (effort) {
      detailRows = effort.pipelines;
      onOpen = (row) => setSelectedPipelineId(row.id);
    } else if (model) {
      detailRows = model.efforts;
      detailRenderName = (row) => effortNameCell(row as StatsEffortCostEntity);
      onOpen = (row) => setSelectedEffortId(row.id);
    } else {
      detailRows = cost.by_model;
      detailRenderName = (row) => (
        <span className="inline-flex items-baseline gap-0.5">
          <span className="font-mono" title={row.name}>
            {row.name}
          </span>
          {(() => {
            const provenance = cost.by_model.find((m) => m.id === row.id)?.provenance;
            return provenance && provenance !== "observed" ? (
              <ProvenanceMark provenance={provenance} target="model" />
            ) : null;
          })()}
        </span>
      );
      onOpen = (row) => setSelectedModelId(row.id);
    }
  } else if (drilledPipeline) {
    detailRows = drilledPipeline.nodes;
  } else if (!selected) {
    detailRows = rows;
  } else if (axis === "project") {
    detailRows = (selected as StatsProjectCostEntity).pipelines;
    onOpen = (pipeline) => setDrilledPipelineId(pipeline.id);
  } else {
    detailRows = selected.nodes;
  }

  const crumbs: { label: string; onClick?: () => void }[] = [
    { label: "Total", onClick: toTotal },
  ];
  if (axis === "model") {
    if (model)
      crumbs.push({
        label: model.name,
        onClick: () => {
          setSelectedEffortId(null);
          setSelectedPipelineId(null);
        },
      });
    if (effort)
      crumbs.push({ label: effort.name, onClick: () => setSelectedPipelineId(null) });
    if (modelPipeline) crumbs.push({ label: modelPipeline.name });
  } else {
    if (selected) crumbs.push({ label: selected.name, onClick: () => setDrilledPipelineId(null) });
    if (drilledPipeline) crumbs.push({ label: drilledPipeline.name });
  }
  // Every crumb but the last pops the levels it shadows (design: clickable
  // breadcrumb for all three axes once there are four levels).
  const clickableCrumbs = crumbs.map((crumb, index) =>
    index === crumbs.length - 1 ? { label: crumb.label } : crumb,
  );

  return (
    <div className="relative flex min-h-full" data-testid="stats-chart-cost">
      <aside
        className="w-[290px] shrink-0 border-r border-line pr-4"
        data-testid="stats-drilldown-navigation"
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-fg-4" style={{ fontSize: "10.5px" }}>
            Ranked by cost
          </span>
          <select
            aria-label="Cost grouping"
            value={axis}
            onChange={(event) => {
              setAxis(event.target.value as CostAxis);
              toTotal();
            }}
            className="rounded border border-line bg-bg-3 px-2 py-1 text-fg-2"
          >
            <option value="pipeline">By pipeline</option>
            <option value="project">By project</option>
            <option value="model">By model</option>
          </select>
        </div>
        <MasterList
          rows={rows}
          selected={axis === "model" ? selectedModelId : selectedId}
          monoName={axis === "model"}
          valueLabel={(row) => formatCostAmount(row.usd, row.partial, row.estimated)}
          onSelect={(id) => {
            if (axis === "model") {
              setSelectedModelId(id);
              setSelectedEffortId(null);
              setSelectedPipelineId(null);
            } else {
              setSelectedId(id);
              setDrilledPipelineId(null);
            }
          }}
        />
        {axis === "model" && (
          <div className="mt-3 text-fg-4" style={{ fontSize: "10.5px" }}>
            Model ids verbatim, one row per id. Hover ? for where a value comes
            from. Harnesses without a cost source do not appear.
          </div>
        )}
      </aside>

      <div
        className="min-w-0 flex-1 pl-5"
        data-testid="stats-drilldown-detail"
      >
        <Breadcrumb crumbs={clickableCrumbs} />
        <HarnessLegend harnesses={cost.harnesses} />
        <div className="mt-4 text-fg" data-testid="stats-selection-headline">
          {formatCostAmount(aggregate.usd, aggregate.partial, aggregate.estimated)} total
          {" · "}
          {formatCostAmount(aggregate.average_usd, aggregate.partial, aggregate.estimated)} per{" "}
          {detailUnit}
        </div>
        <div className="mt-4">
          <HarnessCards aggregate={aggregate} />
        </div>
        {aggregate.unknown > 0 && (
          <div className="mt-4 text-st-await" style={{ fontSize: "10.5px" }}>
            {aggregate.unknown} {detailUnit}
            {aggregate.unknown === 1 ? "" : "s"} without computable cost
          </div>
        )}
        <div className="mt-4">
          <HarnessBars periods={periods} harnesses={cost.harnesses} value="usd" />
        </div>
        <div className="mt-4 min-h-[240px]">
          <CostTable
            key={`${axis}-${selectedId ?? ""}-${drilledPipelineId ?? ""}-${selectedModelId ?? ""}-${selectedEffortId ?? "total"}-${selectedPipelineId ?? ""}`}
            rows={detailRows}
            harnesses={cost.harnesses}
            unit={detailUnit}
            onOpen={onOpen}
            renderName={detailRenderName}
            expandablePairs={axis !== "model"}
          />
        </div>
      </div>
    </div>
  );
}

type PerformanceMetric = "context" | "duration";

function performanceScore(
  aggregate: StatsPerformanceAggregate,
  metric: PerformanceMetric,
): [number, number] {
  const distributions = aggregate.harnesses
    .map((item) => item[metric])
    .filter((item) => item.stats !== null);
  return [
    Math.max(-1, ...distributions.map((item) => item.stats!.mean)),
    Math.max(-1, ...distributions.map((item) => item.stats!.median)),
  ];
}

function sortPerformance<T extends StatsPerformanceAggregate & { name: string }>(
  rows: T[],
  metric: PerformanceMetric,
): T[] {
  return [...rows].sort((a, b) => {
    const [aMean, aMedian] = performanceScore(a, metric);
    const [bMean, bMedian] = performanceScore(b, metric);
    return bMean - aMean || bMedian - aMedian || a.name.localeCompare(b.name);
  });
}

function formatPerformanceValue(value: number, metric: PerformanceMetric): string {
  if (metric === "context") {
    return value >= 1_000 ? `${Math.round(value / 1_000)}k` : Math.round(value).toString();
  }
  const seconds = Math.round(value / 1_000);
  const minutes = Math.floor(seconds / 60);
  return minutes ? `${minutes}m${String(seconds % 60).padStart(2, "0")}s` : `${seconds}s`;
}

function distributionDetail(
  name: string,
  harness: string,
  metric: PerformanceMetric,
  value: StatsDistribution,
): string {
  const label = metric === "context" ? "Context" : "Duration";
  const fmt = (raw: number) => formatPerformanceValue(raw, metric);
  const stats = value.stats;
  if (!stats) {
    return `${name} · ${harness} · ${label}. 0 measured of ${value.expected} successful executions. Missing: ${value.missing_reasons.join("; ")}.`;
  }
  const reasons = value.missing_reasons.length
    ? ` Missing: ${value.missing_reasons.join("; ")}.`
    : "";
  return `${name} · ${harness} · ${label}. Max ${fmt(stats.max)} · Q3 ${fmt(stats.q3)} · Mean ${fmt(stats.mean)} · Median ${fmt(stats.median)} · Q1 ${fmt(stats.q1)} · Min ${fmt(stats.min)}. ${value.measured} measured of ${value.expected} successful executions.${reasons}`;
}

function DistributionPlot({
  name,
  harness,
  metric,
  value,
  scaleMax,
}: {
  name: string;
  harness: string;
  metric: PerformanceMetric;
  value: StatsDistribution;
  scaleMax: number;
}) {
  if (!value.stats) {
    const detail = `${name} · ${harness} · ${metric === "context" ? "Context" : "Duration"}. 0 measured of ${value.expected} successful executions. Missing: ${value.missing_reasons.join("; ")}.`;
    return (
      <Tooltip content={detail} side="top">
        <button
          type="button"
          aria-label={detail}
          className="text-left text-fg-4 underline decoration-dotted underline-offset-2"
        >
          — {value.missing_reasons[0] ?? "not measurable"}
        </button>
      </Tooltip>
    );
  }
  const stats = value.stats;
  const pct = (raw: number) => `${Math.max(0, Math.min(100, (raw / scaleMax) * 100))}%`;
  const detail = distributionDetail(name, harness, metric, value);
  const partial = value.measured < value.expected;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div
        className="relative h-4 min-w-28"
        data-testid={`performance-${metric}-boxplot`}
        data-scale-max={scaleMax}
        aria-hidden="true"
      >
        <span
          className="absolute top-[7px] h-px bg-fg-4"
          style={{ left: pct(stats.min), width: pct(stats.max - stats.min) }}
        />
        <span
          className="absolute top-[4px] h-[7px] border border-current opacity-70"
          style={{
            color: harnessColor(harness),
            left: pct(stats.q1),
            width: pct(Math.max(stats.q3 - stats.q1, scaleMax * 0.005)),
          }}
        />
        <span
          className="absolute top-[3px] h-[9px] w-px bg-fg"
          style={{ left: pct(stats.median) }}
        />
        <span
          className="absolute top-[5px] h-[5px] w-[5px] -translate-x-1/2 rounded-full bg-current"
          style={{ color: harnessColor(harness), left: pct(stats.mean) }}
        />
      </div>
      <Tooltip content={detail} side="top">
        <button
          type="button"
          aria-label={detail}
          className="w-fit text-left font-mono text-fg-4 underline decoration-dotted underline-offset-2"
          style={{ fontSize: "9.5px" }}
        >
          {formatPerformanceValue(stats.mean, metric)} avg · n={value.measured}
          {partial ? " ⚠" : ""}
        </button>
      </Tooltip>
    </div>
  );
}

function PerformanceCards({ aggregate }: { aggregate: StatsPerformanceAggregate }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {aggregate.harnesses.map((item) => (
        <div key={item.harness} className="rounded-md border border-line bg-bg-3 p-3">
          <div className="mb-2 flex items-center gap-1.5 text-fg-3">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: harnessColor(item.harness) }}
            />
            {item.harness}
          </div>
          <div className="font-mono text-fg">
            {item.context.stats
              ? formatPerformanceValue(item.context.stats.median, "context")
              : "—"}{" "}
            median context
          </div>
          <div className="font-mono text-fg-3">
            {item.duration.stats
              ? formatPerformanceValue(item.duration.stats.median, "duration")
              : "—"}{" "}
            median duration
          </div>
        </div>
      ))}
    </div>
  );
}

function PerformanceTable({
  rows,
  harnesses,
  sort,
}: {
  rows: StatsPerformanceEntity[];
  harnesses: string[];
  sort: PerformanceMetric;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const ordered = sortPerformance(rows, sort);
  const visible = ordered.flatMap((row) => [
    { row, child: false },
    ...(expanded.has(row.id)
      ? sortPerformance(row.subagents, sort).map((child) => ({ row: child, child: true }))
      : []),
  ]);
  const scaleRows = rows.flatMap((row) => [row, ...row.subagents]);
  const scaleMax = (metric: PerformanceMetric) =>
    Math.max(
      1,
      ...scaleRows.flatMap((row) =>
        row.harnesses.map((item) => item[metric].stats?.max ?? 0),
      ),
    );
  const contextMax = scaleMax("context");
  const durationMax = scaleMax("duration");

  return (
    <TooltipProvider>
      <table className="w-full table-fixed text-left" style={{ fontSize: "11px" }}>
        <thead className="text-fg-4">
          <tr>
            <th className="w-48 pb-2 font-medium">Name</th>
            <th className="pb-2 font-medium">Context (peak tokens)</th>
            <th className="pb-2 font-medium">Duration (wall-clock)</th>
          </tr>
        </thead>
        <tbody>
          {visible.map(({ row, child }) => (
            <tr key={`${child ? "subagent" : "entity"}-${row.id}`} className="border-t border-line">
              <td className={`py-2 pr-2 text-fg-2 ${child ? "pl-7" : ""}`}>
                {!child && row.subagents.length > 0 ? (
                  <button
                    type="button"
                    aria-label={`${expanded.has(row.id) ? "Collapse" : "Expand"} ${row.name} subagents`}
                    onClick={() =>
                      setExpanded((current) => {
                        const next = new Set(current);
                        if (next.has(row.id)) next.delete(row.id);
                        else next.add(row.id);
                        return next;
                      })
                    }
                    className="inline-flex items-center gap-1 hover:text-fg"
                  >
                    {expanded.has(row.id) ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    {row.name}
                  </button>
                ) : (
                  row.name
                )}
              </td>
              {(["context", "duration"] as const).map((metric) => (
                <td key={metric} className="py-2 pr-3 align-top">
                  <div className="grid gap-1.5">
                    {harnesses.map((harness) => (
                      <div key={harness} className="flex items-start gap-2">
                        <span
                          className="mt-1 h-[7px] w-[7px] shrink-0 rounded-full"
                          style={{ backgroundColor: harnessColor(harness) }}
                        />
                        <DistributionPlot
                          name={row.name}
                          harness={harness}
                          metric={metric}
                          value={
                            row.harnesses.find((item) => item.harness === harness)?.[metric] ?? {
                              stats: null,
                              measured: 0,
                              expected: 0,
                              missing_reasons: [`never ran on ${harness}`],
                            }
                          }
                          scaleMax={metric === "context" ? contextMax : durationMax}
                        />
                      </div>
                    ))}
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </TooltipProvider>
  );
}

function PerformanceTab({
  performance,
  error,
}: {
  performance: StatsPerformance | null;
  error: string | null;
}) {
  const [sort, setSort] = useState<PerformanceMetric>("context");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  if (error) {
    return (
      <div className="rounded-md border border-st-failed/30 bg-st-failed-bg px-3 py-2 text-st-failed">
        {error}
      </div>
    );
  }
  if (!performance) return <EmptyNote>Loading performance…</EmptyNote>;
  if (performance.by_pipeline.length === 0 && performance.infrastructure.length === 0) {
    return <EmptyNote>No successful executions in this period.</EmptyNote>;
  }

  const infrastructureRow: StatsPerformanceEntity = {
    id: "__infrastructure__",
    name: "Infrastructure",
    ...performance.infrastructure_total,
    nodes: performance.infrastructure,
    subagents: [],
  };
  const masterRows = sortPerformance(
    [...performance.by_pipeline, infrastructureRow],
    sort,
  );
  const selected = masterRows.find((row) => row.id === selectedId) ?? null;
  const aggregate = selected ?? performance.total;
  const detailRows = selected
    ? selected.id === "__infrastructure__"
      ? performance.infrastructure
      : selected.nodes
    : masterRows;
  const contexts = aggregate.harnesses.map((item) =>
    item.context.stats ? formatPerformanceValue(item.context.stats.median, "context") : "—",
  );
  const durations = aggregate.harnesses.map((item) =>
    item.duration.stats ? formatPerformanceValue(item.duration.stats.median, "duration") : "—",
  );

  return (
    <div className="relative flex min-h-full" data-testid="stats-chart-performance">
      <aside className="w-[290px] shrink-0 border-r border-line pr-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-fg-4" style={{ fontSize: "10.5px" }}>
            Ranked by {sort}
          </span>
          <select
            aria-label="Performance sort"
            value={sort}
            onChange={(event) => setSort(event.target.value as PerformanceMetric)}
            className="rounded border border-line bg-bg-3 px-2 py-1 text-fg-2"
          >
            <option value="context">By context</option>
            <option value="duration">By duration</option>
          </select>
        </div>
        <MasterList
          rows={masterRows}
          selected={selectedId}
          ariaLabel="Performance groups"
          valueLabel={(row) => {
            const [mean] = performanceScore(row, sort);
            return mean < 0 ? "—" : formatPerformanceValue(mean, sort);
          }}
          onSelect={setSelectedId}
        />
      </aside>
      <div className="min-w-0 flex-1 pl-5">
        <div className="mb-3 text-fg-4" style={{ fontSize: "10.5px" }}>
          Total{selected ? ` / ${selected.name}` : ""}
        </div>
        <HarnessLegend harnesses={performance.harnesses} />
        <div className="mt-4 text-fg" data-testid="stats-performance-headline">
          {contexts.join(" / ") || "—"} median peak context · {durations.join(" / ") || "—"} median
          duration
        </div>
        <div className="mt-4">
          <PerformanceCards aggregate={aggregate} />
        </div>
        <div className="mt-4 min-h-[240px]">
          <PerformanceTable
            rows={detailRows}
            harnesses={performance.harnesses}
            sort={sort}
          />
        </div>
      </div>
    </div>
  );
}

export interface StatsChartsProps {
  tab: StatsTab;
  overview: StatsOverview | null;
  cost: StatsCost | null;
  costError: string | null;
  performance?: StatsPerformance | null;
  performanceError?: string | null;
}

export default function StatsCharts({
  tab,
  overview,
  cost,
  costError,
  performance = null,
  performanceError = null,
}: StatsChartsProps) {
  if (tab === "performance") {
    return <PerformanceTab performance={performance} error={performanceError} />;
  }
  if (tab === "cost") {
    return <CostTab cost={cost} error={costError} />;
  }
  if (!overview) return <EmptyNote>Loading…</EmptyNote>;
  if (tab === "runs") return <RunsTab overview={overview} />;
  if (tab === "sessions") return <SessionsTab overview={overview} />;
  return <TriggersTab overview={overview} />;
}
