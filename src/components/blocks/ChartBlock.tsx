"use client";

/**
 * A chart is a *view*, not a copy.
 *
 * It stores a table id and reads that table out of the store on every render,
 * so editing a cell upstream repaints the chart on the same commit. There is no
 * sync code here because there is nothing to sync.
 */

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  ChartBlock as ChartBlockModel,
  ChartKind,
  TableBlock,
} from "@/lib/types";
import { useProjects } from "@/lib/store";
import { computeFormulas, toNumber } from "@/lib/formula";
import { NUMERIC_COLUMN_TYPES } from "@/lib/types";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";
import { FigureCaption } from "./FigureCaption";

/** Accent first, then neutrals — a chart shouldn't be the loudest thing here. */
const SERIES_COLORS = [
  "#3d7dff",
  "#ededed",
  "#7aa2ff",
  "#8a8a8a",
  "#26a17b",
  "#c46be0",
];

const KINDS: Array<{ kind: ChartKind; label: string }> = [
  { kind: "bar", label: "Bar" },
  { kind: "line", label: "Line" },
  { kind: "area", label: "Area" },
  { kind: "pie", label: "Pie" },
];

const AXIS = {
  stroke: "rgba(255,255,255,0.14)",
  tick: { fill: "#5c5c5c", fontSize: 10, fontFamily: "var(--font-mono)" },
};

export function ChartBlock({
  projectId,
  block,
}: {
  projectId: string;
  block: ChartBlockModel;
}) {
  const updateBlock = useProjects((s) => s.updateBlock);
  // The selector must return a stable reference: zustand compares snapshots by
  // identity, so filtering inside it would hand React a new array every render
  // and spin. Select the blocks array, derive the tables here.
  const blocks = useProjects(
    (s) => s.projects.find((p) => p.id === projectId)?.blocks,
  );
  const tables = useMemo(
    () => (blocks ?? []).filter((b): b is TableBlock => b.type === "table"),
    [blocks],
  );

  const source = tables.find((t) => t.id === block.sourceId) ?? null;

  const { data, series } = useMemo(
    () => chartData(source, block),
    [source, block],
  );

  const plottable = source?.columns.filter(
    (c) => NUMERIC_COLUMN_TYPES.has(c.type),
  );

  if (tables.length === 0) {
    return (
      <Empty>
        No table to bind to yet. Add a table block, then point this chart at it.
      </Empty>
    );
  }

  if (!source) {
    return (
      <Empty>
        <span className="mb-3 block">This chart isn&apos;t bound to a table.</span>
        <div className="flex flex-wrap justify-center gap-1.5">
          {tables.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                const numeric = t.columns.filter(
                  (c) => NUMERIC_COLUMN_TYPES.has(c.type),
                );
                updateBlock<ChartBlockModel>(projectId, block.id, {
                  sourceId: t.id,
                  xColumnId: t.columns[0]?.id ?? null,
                  yColumnIds: numeric.length ? [numeric[0].id] : [],
                });
              }}
              className="rounded-sm border border-line bg-surface-2 px-2.5 py-1 text-[12px] text-fg-muted transition-colors duration-150 hover:border-accent hover:text-fg"
            >
              {t.title ?? "Table"}
            </button>
          ))}
        </div>
      </Empty>
    );
  }

  return (
    <div>
      <FigureCaption
        projectId={projectId}
        block={block}
        placeholder="What this chart shows"
      />
      <div className="overflow-hidden rounded-md border border-line bg-surface">
      {/* Binding controls — quiet until you look for them. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-3 py-2">
        <Field label="Source">
          <Select
            value={source.id}
            onChange={(id) => {
              const t = tables.find((x) => x.id === id);
              const numeric =
                t?.columns.filter((c) => NUMERIC_COLUMN_TYPES.has(c.type)) ??
                [];
              updateBlock<ChartBlockModel>(projectId, block.id, {
                sourceId: id,
                xColumnId: t?.columns[0]?.id ?? null,
                yColumnIds: numeric.length ? [numeric[0].id] : [],
              });
            }}
            options={tables.map((t) => ({ value: t.id, label: t.title ?? "Table" }))}
          />
        </Field>

        <Field label="X">
          <Select
            value={block.xColumnId ?? ""}
            onChange={(xColumnId) =>
              updateBlock<ChartBlockModel>(projectId, block.id, { xColumnId })
            }
            options={source.columns.map((c) => ({ value: c.id, label: c.name }))}
          />
        </Field>

        <Field label="Y">
          <div className="flex flex-wrap gap-1">
            {plottable?.length ? (
              plottable.map((c) => {
                const on = block.yColumnIds.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      updateBlock<ChartBlockModel>(projectId, block.id, (b) => ({
                        yColumnIds: on
                          ? b.yColumnIds.filter((id) => id !== c.id)
                          : [...b.yColumnIds, c.id],
                      }))
                    }
                    className={cn(
                      "rounded-xs border px-1.5 py-0.5 text-[11px] transition-colors duration-150",
                      on
                        ? "border-line-strong bg-surface-3 text-fg"
                        : "border-line text-fg-subtle hover:text-fg-muted",
                    )}
                  >
                    {c.name}
                  </button>
                );
              })
            ) : (
              <span className="text-[11px] text-fg-subtle">
                No numeric columns
              </span>
            )}
          </div>
        </Field>

        <div className="ml-auto flex gap-0.5 rounded-sm border border-line p-0.5">
          {KINDS.map(({ kind, label }) => (
            <button
              key={kind}
              type="button"
              aria-pressed={block.kind === kind}
              onClick={() =>
                updateBlock<ChartBlockModel>(projectId, block.id, { kind })
              }
              className={cn(
                "rounded-xs px-1.5 py-0.5 text-[11px] transition-colors duration-150",
                block.kind === kind
                  ? "bg-surface-3 text-fg"
                  : "text-fg-subtle hover:text-fg-muted",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-1 py-3">
        {series.length === 0 || data.length === 0 ? (
          <div className="grid h-[220px] place-items-center text-[12.5px] text-fg-subtle">
            Pick at least one Y column to plot.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            {renderChart(block.kind, data, series)}
          </ResponsiveContainer>
        )}
      </div>

    </div>
    </div>
  );
}

type Series = { id: string; name: string; color: string };

/**
 * A chart's points and series, from a table.
 *
 * Pure and exported: the shared read-only viewer draws the same chart from a
 * project it decoded out of a link, with no store to select from. Two copies
 * of this maths would be two charts that disagree.
 */
export function chartData(
  source: TableBlock | null,
  block: Pick<ChartBlockModel, "xColumnId" | "yColumnIds">,
): { data: Array<Record<string, string | number>>; series: Series[] } {
  if (!source || !block.xColumnId) return { data: [], series: [] };

  const derived = computeFormulas(source.columns, source.rows);
  const xColumn = source.columns.find((c) => c.id === block.xColumnId);
  const yColumns = block.yColumnIds
    .map((id) => source.columns.find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => Boolean(c));

  const data = source.rows.map((row, i) => {
    const point: Record<string, string | number> = {
      __label:
        xColumn?.type === "formula"
          ? String(derived[row.id]?.[xColumn.id] ?? "")
          : String(row.cells[block.xColumnId!] ?? `Row ${i + 1}`),
    };
    for (const c of yColumns) {
      const raw =
        c.type === "formula" ? derived[row.id]?.[c.id] : row.cells[c.id];
      point[c.id] = toNumber(typeof raw === "string" ? raw : (raw ?? null));
    }
    return point;
  });

  return {
    data,
    series: yColumns.map((c, i) => ({
      id: c.id,
      name: c.name,
      color: SERIES_COLORS[i % SERIES_COLORS.length],
    })),
  };
}

export function renderChart(
  kind: ChartKind,
  data: Array<Record<string, string | number>>,
  series: Series[],
) {
  const grid = (
    <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
  );
  const axes = (
    <>
      <XAxis
        dataKey="__label"
        stroke={AXIS.stroke}
        tick={AXIS.tick}
        tickLine={false}
        axisLine={{ stroke: AXIS.stroke }}
      />
      <YAxis
        stroke={AXIS.stroke}
        tick={AXIS.tick}
        tickLine={false}
        axisLine={false}
        width={44}
      />
    </>
  );
  const shared = (
    <>
      <Tooltip
        cursor={{ fill: "rgba(255,255,255,0.04)", stroke: "transparent" }}
        content={<ChartTooltip />}
      />
      <Legend
        verticalAlign="bottom"
        height={24}
        formatter={(v) => (
          <span style={{ color: "#8a8a8a", fontSize: 11 }}>{v}</span>
        )}
      />
    </>
  );

  switch (kind) {
    case "line":
      return (
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          {grid}
          {axes}
          {shared}
          {series.map((s) => (
            <Line
              key={s.id}
              type="monotone"
              dataKey={s.id}
              name={s.name}
              stroke={s.color}
              strokeWidth={1.75}
              dot={{ r: 2, fill: s.color, strokeWidth: 0 }}
              activeDot={{ r: 3.5 }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      );

    case "area":
      return (
        <AreaChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <defs>
            {series.map((s) => (
              <linearGradient key={s.id} id={`fill-${s.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.28} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>
          {grid}
          {axes}
          {shared}
          {series.map((s) => (
            <Area
              key={s.id}
              type="monotone"
              dataKey={s.id}
              name={s.name}
              stroke={s.color}
              strokeWidth={1.75}
              fill={`url(#fill-${s.id})`}
              isAnimationActive={false}
            />
          ))}
        </AreaChart>
      );

    case "pie":
      return (
        <PieChart margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <Tooltip content={<ChartTooltip />} />
          <Legend
            verticalAlign="bottom"
            height={24}
            formatter={(v) => (
              <span style={{ color: "#8a8a8a", fontSize: 11 }}>{v}</span>
            )}
          />
          <Pie
            data={data}
            dataKey={series[0].id}
            nameKey="__label"
            innerRadius={44}
            outerRadius={80}
            paddingAngle={2}
            stroke="#0a0a0a"
            strokeWidth={2}
            isAnimationActive={false}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={SERIES_COLORS[i % SERIES_COLORS.length]} />
            ))}
          </Pie>
        </PieChart>
      );

    default:
      return (
        <BarChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          {grid}
          {axes}
          {shared}
          {series.map((s) => (
            <Bar
              key={s.id}
              dataKey={s.id}
              name={s.name}
              fill={s.color}
              radius={[3, 3, 0, 0]}
              maxBarSize={38}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      );
  }
}

interface TooltipPayloadItem {
  name?: string;
  value?: number | string;
  color?: string;
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-line-strong bg-surface-2 px-2.5 py-2 shadow-[0_12px_40px_-8px_rgba(0,0,0,0.8)]">
      {label !== undefined && (
        <p className="mb-1 font-mono text-[10px] tracking-wide text-fg-subtle uppercase">
          {String(label)}
        </p>
      )}
      {payload.map((p, i) => (
        <p key={i} className="flex items-center gap-2 text-[11.5px] text-fg">
          <span
            aria-hidden="true"
            className="size-1.5 rounded-full"
            style={{ background: p.color }}
          />
          <span className="text-fg-muted">{p.name}</span>
          <span className="ml-auto font-mono">{p.value}</span>
        </p>
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="label-mono">{label}</span>
      {children}
    </div>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="max-w-[140px] truncate rounded-sm border border-line bg-surface-2 px-1.5 py-1 text-[11.5px] text-fg-muted outline-none transition-colors duration-150 hover:text-fg focus:border-accent"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} className="bg-surface-2">
          {o.label}
        </option>
      ))}
    </select>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid place-items-center rounded-md border border-dashed border-line bg-surface px-6 py-12 text-center">
      <div className="max-w-[34ch] text-[12.5px] text-fg-subtle">
        <Icon name="chart" size={18} className="mx-auto mb-3 text-fg-subtle" />
        {children}
      </div>
    </div>
  );
}
