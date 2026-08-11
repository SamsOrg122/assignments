"use client";

/**
 * Writing a form, and watching the answers arrive.
 *
 * The questions are edited in place — no separate builder screen — because a
 * form in a thesis project is one part of that project, not a detour into a
 * different app. The link is produced here, the answers are counted here, and
 * "put them in a table" is one button, because that is the only thing anybody
 * wants to do with survey answers.
 *
 * Where a database is not configured the form is still fully editable and the
 * link still opens, and this says plainly that nothing can be collected yet.
 * The alternative — a form that looks like it works and silently drops what
 * somebody spent ten minutes writing — is the worst thing in this file.
 */

import { useCallback, useEffect, useState } from "react";
import type { FormBlock as FormBlockModel, FormField, FormFieldKind, TableBlock } from "@/lib/types";
import { useProjects } from "@/lib/store";
import { useUI } from "@/lib/ui-store";
import { useRemoteConfigured } from "@/lib/db/use-config";
import {
  FIELD_LABELS,
  FIELD_ORDER,
  answerToCell,
  fetchResponses,
  formLink,
  type Response,
} from "@/lib/forms";
import { createBlock, uid } from "@/lib/factories";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";

interface Props {
  projectId: string;
  block: FormBlockModel;
}

const NEEDS_OPTIONS = (kind: FormFieldKind) =>
  kind === "choice" || kind === "checkboxes";

export function FormBlock({ projectId, block }: Props) {
  const updateBlock = useProjects((s) => s.updateBlock);
  const insertBlock = useProjects((s) => s.insertBlock);
  const notify = useUI((s) => s.notify);
  const configured = useRemoteConfigured();

  const [link, setLink] = useState<string | null>(null);
  const [responses, setResponses] = useState<Response[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const patch = (next: Partial<FormBlockModel>) =>
    updateBlock<FormBlockModel>(projectId, block.id, next);

  const setField = (id: string, next: Partial<FormField>) =>
    patch({
      fields: block.fields.map((f) => (f.id === id ? { ...f, ...next } : f)),
    });

  const load = useCallback(async () => {
    if (!configured) return;
    setBusy(true);
    try {
      setResponses(await fetchResponses(block.id));
      setProblem(null);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "Couldn't read the answers.");
    } finally {
      setBusy(false);
    }
  }, [block.id, configured]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  /** The answers as a table in this project — one column per question. */
  const intoTable = () => {
    if (!responses?.length) return;
    const columns = [
      { id: "when", name: "Submitted", type: "date" as const },
      ...block.fields.map((f) => ({
        id: f.id,
        name: f.label,
        type:
          f.kind === "number" || f.kind === "scale"
            ? ("number" as const)
            : f.kind === "date"
              ? ("date" as const)
              : ("text" as const),
      })),
    ];
    const rows = responses.map((r) => ({
      id: r.id,
      cells: {
        when: new Date(r.submittedAt).toISOString().slice(0, 10),
        ...Object.fromEntries(
          block.fields.map((f) => [f.id, answerToCell(r.answers[f.id] ?? null)]),
        ),
      },
    }));

    const table = createBlock("table") as TableBlock;
    table.title = `${block.title ?? "Form"} — answers`;
    table.columns = columns;
    table.rows = rows;
    insertBlock(projectId, table, block.id);
    notify(`${rows.length} answer${rows.length === 1 ? "" : "s"} in a table`);
  };

  return (
    <div className="overflow-hidden rounded-md border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-2.5 py-1.5">
        <Icon name="list" size={11} className="shrink-0 text-fg-subtle" />
        <input
          value={block.title ?? ""}
          onChange={(e) => patch({ title: e.target.value })}
          aria-label="Form title"
          placeholder="Untitled form"
          className="min-w-0 flex-1 bg-transparent text-[12.5px] font-medium text-fg outline-none placeholder:text-fg-subtle"
        />
        <span className="shrink-0 font-mono text-[9.5px] text-fg-subtle">
          {responses === null
            ? configured
              ? "…"
              : "not collecting"
            : `${responses.length} answer${responses.length === 1 ? "" : "s"}`}
        </span>
        <button
          type="button"
          onClick={() => patch({ closed: !block.closed })}
          aria-pressed={Boolean(block.closed)}
          className={cn(
            "shrink-0 rounded-xs px-1.5 py-0.5 text-[10.5px] transition-colors duration-150",
            block.closed ? "text-warn" : "text-fg-subtle hover:text-fg",
          )}
        >
          {block.closed ? "Closed" : "Open"}
        </button>
      </div>

      <div className="flex flex-col gap-2.5 p-3">
        <textarea
          value={block.intro ?? ""}
          onChange={(e) => patch({ intro: e.target.value })}
          aria-label="Introduction"
          placeholder="A sentence explaining what this is for, and what happens to the answers."
          rows={2}
          className="w-full resize-y rounded-sm border border-line bg-surface-2 px-2.5 py-1.5 text-[12.5px] leading-relaxed text-fg outline-none focus:border-accent"
        />

        {block.fields.map((field, index) => (
          <div key={field.id} className="rounded-sm border border-line p-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="shrink-0 font-mono text-[10px] text-fg-subtle">
                {index + 1}
              </span>
              <input
                value={field.label}
                onChange={(e) => setField(field.id, { label: e.target.value })}
                aria-label={`Question ${index + 1}`}
                className="min-w-0 flex-1 bg-transparent text-[13px] text-fg outline-none"
              />
              <select
                value={field.kind}
                onChange={(e) => {
                  const kind = e.target.value as FormFieldKind;
                  setField(field.id, {
                    kind,
                    options: NEEDS_OPTIONS(kind)
                      ? (field.options ?? ["First", "Second"])
                      : undefined,
                  });
                }}
                aria-label={`Answer type for question ${index + 1}`}
                className="shrink-0 rounded-xs border border-line bg-surface-2 px-1.5 py-0.5 text-[11.5px] text-fg-muted outline-none focus:border-accent"
              >
                {FIELD_ORDER.map((k) => (
                  <option key={k} value={k}>
                    {FIELD_LABELS[k]}
                  </option>
                ))}
              </select>
              <label className="flex shrink-0 items-center gap-1 text-[11.5px] text-fg-subtle">
                <input
                  type="checkbox"
                  checked={Boolean(field.required)}
                  onChange={(e) => setField(field.id, { required: e.target.checked })}
                />
                Required
              </label>
              <button
                type="button"
                onClick={() =>
                  patch({ fields: block.fields.filter((f) => f.id !== field.id) })
                }
                aria-label={`Remove question ${index + 1}`}
                className="shrink-0 rounded-xs p-1 text-fg-subtle transition-colors hover:text-danger"
              >
                <Icon name="x" size={11} />
              </button>
            </div>

            {NEEDS_OPTIONS(field.kind) && (
              <input
                value={(field.options ?? []).join(", ")}
                onChange={(e) =>
                  setField(field.id, {
                    options: e.target.value
                      .split(",")
                      .map((o) => o.trim())
                      .filter(Boolean),
                  })
                }
                aria-label={`Options for question ${index + 1}`}
                placeholder="Options, separated by commas"
                className="mt-1.5 w-full rounded-xs border border-line bg-surface-2 px-2 py-1 text-[12px] text-fg outline-none focus:border-accent"
              />
            )}
          </div>
        ))}

        <button
          type="button"
          onClick={() =>
            patch({
              fields: [
                ...block.fields,
                { id: uid(), label: "New question", kind: "short" },
              ],
            })
          }
          className="flex items-center gap-1.5 self-start rounded-sm border border-line px-2.5 py-1.5 text-[12.5px] text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg"
        >
          <Icon name="plus" size={11} />
          Add a question
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2">
        <button
          type="button"
          onClick={() =>
            formLink(block).then((url) => {
              setLink(url);
              void navigator.clipboard?.writeText(url);
              notify("Link copied — anyone with it can answer");
            })
          }
          className="flex items-center gap-1.5 rounded-sm bg-accent px-2.5 py-1.5 text-[12.5px] font-medium text-on-accent transition-[filter] duration-150 hover:brightness-110"
        >
          <Icon name="link" size={11} />
          Copy the link
        </button>

        {link && (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11.5px] text-accent transition-opacity hover:opacity-80"
          >
            Open it
          </a>
        )}

        <button
          type="button"
          onClick={load}
          disabled={!configured || busy}
          className="rounded-sm border border-line px-2.5 py-1.5 text-[12.5px] text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg disabled:opacity-50"
        >
          {busy ? "Checking…" : "Check for answers"}
        </button>

        <button
          type="button"
          onClick={intoTable}
          disabled={!responses?.length}
          className="rounded-sm border border-line px-2.5 py-1.5 text-[12.5px] text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg disabled:opacity-50"
        >
          Put the answers in a table
        </button>
      </div>

      {!configured && (
        <p className="border-t border-line bg-warn/[0.07] px-3 py-2 text-[12px] leading-relaxed text-fg-muted">
          No database is configured on this deployment, so answers have nowhere
          to land. The link opens and the questions work — but anybody who fills
          it in will be told their answer couldn&apos;t be sent, rather than
          having it quietly dropped. Settings → Connection says what is missing.
        </p>
      )}

      {problem && (
        <p className="border-t border-line bg-danger/[0.07] px-3 py-2 text-[12px] leading-relaxed text-danger">
          {problem}
        </p>
      )}
    </div>
  );
}
