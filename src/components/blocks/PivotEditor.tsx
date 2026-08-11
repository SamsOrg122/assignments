"use client";

/**
 * Setting up a summary.
 *
 * Four questions and a preview sentence, which is the whole of a pivot table
 * once the ceremony is stripped off: what to group by, what to add up, how to
 * add it up, and — optionally — what to spread across the top. Dates get a
 * bucket, because "by day" is almost never what anyone means by "per month".
 */

import { useState } from "react";
import type { PivotSpec, Aggregate, Bucket } from "@/lib/sheet/pivot";
import { AGGREGATE_LABELS, BUCKET_LABELS, describePivot } from "@/lib/sheet/pivot";
import type { TableBlock as TableBlockModel } from "@/lib/types";
import { useProjects } from "@/lib/store";
import { useUI } from "@/lib/ui-store";
import { createBlock } from "@/lib/factories";
import { cn } from "@/lib/cn";

const COUNTING = (a: Aggregate) => a === "count";

export function PivotEditor({
  projectId,
  source,
  onClose,
}: {
  projectId: string;
  source: TableBlockModel;
  onClose: () => void;
}) {
  const insertBlock = useProjects((s) => s.insertBlock);
  const notify = useUI((s) => s.notify);

  const groupable = source.columns.filter((c) => c.type !== "formula" || true);
  const numeric = source.columns.filter((c) =>
    ["number", "currency", "percent", "formula"].includes(c.type),
  );

  const [spec, setSpec] = useState<PivotSpec>({
    sourceId: source.id,
    rows: [groupable[0]?.id].filter(Boolean) as string[],
    value: numeric[0]?.id,
    aggregate: numeric.length ? "sum" : "count",
    bucket: "month",
    totals: true,
  });

  const patch = (next: Partial<PivotSpec>) => setSpec((s) => ({ ...s, ...next }));
  const hasDate = spec.rows.some(
    (id) => source.columns.find((c) => c.id === id)?.type === "date",
  );
  const ready =
    spec.rows.length > 0 && (COUNTING(spec.aggregate) || Boolean(spec.value));

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-black/50 p-5"
      role="dialog"
      aria-modal="true"
      aria-label="Summarise this table"
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
      />
      <div className="relative w-full max-w-[440px] rounded-lg border border-line bg-surface p-4">
        <p className="text-[14px] font-medium text-fg">Summarise this table</p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-fg-muted">
          The result is a table of its own that recalculates whenever this one
          changes — so it can be charted, exported and shared like any other.
        </p>

        <div className="mt-3.5 flex flex-col gap-2.5">
          <Field label="Group by">
            <select
              value={spec.rows[0] ?? ""}
              onChange={(e) => patch({ rows: [e.target.value, ...spec.rows.slice(1)].filter(Boolean) })}
              className={SELECT}
            >
              {groupable.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="…then by">
            <select
              value={spec.rows[1] ?? ""}
              onChange={(e) =>
                patch({
                  rows: e.target.value
                    ? [spec.rows[0], e.target.value]
                    : [spec.rows[0]],
                })
              }
              className={SELECT}
            >
              <option value="">Nothing</option>
              {groupable
                .filter((c) => c.id !== spec.rows[0])
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </Field>

          <Field label="Work out">
            <span className="flex gap-1.5">
              <select
                value={spec.aggregate}
                onChange={(e) => patch({ aggregate: e.target.value as Aggregate })}
                className={SELECT}
              >
                {(Object.keys(AGGREGATE_LABELS) as Aggregate[]).map((a) => (
                  <option key={a} value={a}>
                    {AGGREGATE_LABELS[a]}
                  </option>
                ))}
              </select>
              {!COUNTING(spec.aggregate) && (
                <select
                  value={spec.value ?? ""}
                  onChange={(e) => patch({ value: e.target.value })}
                  className={SELECT}
                >
                  <option value="">Pick a column</option>
                  {source.columns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </span>
          </Field>

          <Field label="Across the top">
            <select
              value={spec.spread ?? ""}
              onChange={(e) => patch({ spread: e.target.value || undefined })}
              className={SELECT}
            >
              <option value="">Nothing</option>
              {source.columns
                .filter((c) => !spec.rows.includes(c.id))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </Field>

          {hasDate && (
            <Field label="Dates">
              <select
                value={spec.bucket ?? "month"}
                onChange={(e) => patch({ bucket: e.target.value as Bucket })}
                className={SELECT}
              >
                {(Object.keys(BUCKET_LABELS) as Bucket[]).map((b) => (
                  <option key={b} value={b}>
                    {BUCKET_LABELS[b]}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>

        <p className="mt-3 rounded-sm border border-line bg-surface-2 p-2.5 text-[12px] leading-relaxed text-fg-muted">
          {ready ? describePivot(spec, source) : "Pick something to group by and something to work out."}
        </p>

        <div className="mt-3.5 flex items-center gap-2">
          <button
            type="button"
            disabled={!ready}
            onClick={() => {
              const made = createBlock("table") as TableBlockModel;
              made.pivot = spec;
              made.columns = [];
              made.rows = [];
              made.title = describePivot(spec, source);
              insertBlock(projectId, made, source.id);
              notify("Summary added");
              onClose();
            }}
            className="rounded-sm bg-accent px-2.5 py-1.5 text-[12.5px] font-medium text-on-accent transition-[filter] duration-150 hover:brightness-110 disabled:opacity-50"
          >
            Add the summary
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm border border-line px-2.5 py-1.5 text-[12.5px] text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

const SELECT =
  "min-w-0 flex-1 rounded-sm border border-line bg-surface-2 px-2 py-1 text-[12.5px] text-fg outline-none focus:border-accent";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-2">
      <span className={cn("w-[92px] shrink-0 text-[11.5px] text-fg-subtle")}>
        {label}
      </span>
      {children}
    </label>
  );
}
