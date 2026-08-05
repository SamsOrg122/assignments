"use client";

/**
 * The source list.
 *
 * Paste anything — a link, a DOI, an arXiv id, a BibTeX record, or a reference
 * copied out of a paper — and it lands as structured metadata. Fields the
 * resolver *inferred* rather than read are marked, because a citation that is
 * confidently wrong is worse than one that asks to be checked.
 */

import { useEffect, useRef, useState } from "react";
import { useProjects } from "@/lib/store";
import { useUI } from "@/lib/ui-store";
import {
  describeInput,
  formatReference,
  resolveSource,
  sortSources,
  STYLE_LABELS,
} from "@/lib/sources";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";
import type { CitationStyle, Source } from "@/lib/types";

const STYLES: CitationStyle[] = ["apa", "mla", "chicago", "harvard"];

export function SourcesPanel({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const project = useProjects((s) => s.projects.find((p) => p.id === projectId));
  const addSource = useProjects((s) => s.addSource);
  const removeSource = useProjects((s) => s.removeSource);
  const updateSource = useProjects((s) => s.updateSource);
  const setCitationStyle = useProjects((s) => s.setCitationStyle);
  const addBlock = useProjects((s) => s.addBlock);
  const notify = useUI((s) => s.notify);

  const [input, setInput] = useState("");
  const [resolving, setResolving] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const style = project?.citationStyle ?? "apa";
  const sources = sortSources(project?.sources ?? []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !editing) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, editing]);

  const add = async () => {
    if (!input.trim() || resolving) return;
    setResolving(true);
    try {
      const source = await resolveSource(input);
      addSource(projectId, source);
      notify(`Added ${describeInput(input)}`);
      setInput("");
      inputRef.current?.focus();
    } catch {
      notify("Couldn't read that");
    } finally {
      setResolving(false);
    }
  };

  const hasBibliography = project?.blocks.some((b) => b.type === "bibliography");

  return (
    <aside className="fixed top-12 right-0 bottom-0 z-30 flex w-[320px] flex-col border-l border-line bg-surface/95 backdrop-blur print:hidden">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
        <Icon name="quote" size={13} className="text-fg-subtle" />
        <span className="label-mono">Sources</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close sources"
          className="ml-auto rounded-xs p-0.5 text-fg-subtle transition-colors hover:text-fg"
        >
          <Icon name="x" size={12} />
        </button>
      </div>

      {/* Paste box */}
      <div className="border-b border-line p-3">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void add();
            }
          }}
          rows={2}
          placeholder="Paste a link, DOI, arXiv id, BibTeX or a reference…"
          className="w-full resize-none rounded-sm border border-line bg-surface-2 px-2.5 py-2 text-[12.5px] leading-relaxed text-fg outline-none placeholder:text-fg-subtle focus:border-accent"
        />
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => void add()}
            disabled={!input.trim() || resolving}
            className={cn(
              "rounded-sm px-2.5 py-1 text-[12px] font-medium transition-[filter] duration-150",
              input.trim() && !resolving
                ? "bg-accent text-on-accent hover:brightness-110"
                : "border border-line text-fg-subtle",
            )}
          >
            {resolving ? "Reading…" : "Add source"}
          </button>
          {input.trim() && !resolving && (
            <span className="font-mono text-[10px] text-fg-subtle">
              looks like a {describeInput(input)}
            </span>
          )}
        </div>
      </div>

      {/* Style */}
      <div className="flex items-center gap-1 border-b border-line px-3 py-2">
        <span className="label-mono mr-auto">Style</span>
        {STYLES.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={style === s}
            onClick={() => setCitationStyle(projectId, s)}
            className={cn(
              "rounded-xs px-1.5 py-1 text-[10.5px] transition-colors duration-150",
              style === s
                ? "bg-surface-3 text-fg"
                : "text-fg-subtle hover:text-fg-muted",
            )}
          >
            {STYLE_LABELS[s]}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {sources.length === 0 ? (
          <p className="px-3 py-8 text-center text-[12.5px] leading-relaxed text-fg-subtle">
            Nothing collected yet.
            <br />
            <span className="font-mono text-[10.5px]">
              ⌘⇧C in the text cites as you write.
            </span>
          </p>
        ) : (
          sources.map((s) => (
            <SourceRow
              key={s.id}
              source={s}
              style={style}
              editing={editing === s.id}
              onEdit={() => setEditing(editing === s.id ? null : s.id)}
              onChange={(patch) => updateSource(projectId, s.id, patch)}
              onRemove={() => {
                removeSource(projectId, s.id);
                setEditing(null);
              }}
            />
          ))
        )}
      </div>

      <div className="border-t border-line p-3">
        <button
          type="button"
          onClick={() => {
            if (hasBibliography) {
              notify("This project already has a bibliography");
              return;
            }
            addBlock(projectId, "bibliography");
            notify("Bibliography added");
          }}
          className="flex w-full items-center justify-center gap-1.5 rounded-sm border border-line py-1.5 text-[11.5px] text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg"
        >
          <Icon name="plus" size={11} />
          {hasBibliography ? "Bibliography in document" : "Add bibliography block"}
        </button>
      </div>
    </aside>
  );
}

function SourceRow({
  source,
  style,
  editing,
  onEdit,
  onChange,
  onRemove,
}: {
  source: Source;
  style: CitationStyle;
  editing: boolean;
  onEdit: () => void;
  onChange: (patch: Partial<Source>) => void;
  onRemove: () => void;
}) {
  const flagged = source.uncertain ?? [];

  return (
    <div className="group/src border-b border-line px-3 py-2.5 last:border-b-0">
      <div className="flex items-start gap-2">
        <p
          className="prose-canvas min-w-0 flex-1 text-[12px] leading-relaxed"
          dangerouslySetInnerHTML={{ __html: formatReference(source, style) }}
        />
        <span className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover/src:opacity-100 focus-within:opacity-100">
          <button
            type="button"
            onClick={onEdit}
            aria-label="Edit source"
            className="rounded-xs p-1 text-fg-subtle transition-colors hover:text-fg"
          >
            <Icon name="text" size={11} />
          </button>
          <button
            type="button"
            onClick={onRemove}
            aria-label="Remove source"
            className="rounded-xs p-1 text-fg-subtle transition-colors hover:text-danger"
          >
            <Icon name="trash" size={11} />
          </button>
        </span>
      </div>

      {flagged.length > 0 && !editing && (
        <button
          type="button"
          onClick={onEdit}
          className="mt-1 flex items-center gap-1.5 font-mono text-[9.5px] text-warn transition-opacity hover:opacity-80"
        >
          <Icon name="sparkle" size={9} />
          check {flagged.join(", ")}
        </button>
      )}

      {editing && (
        <div className="mt-2 flex flex-col gap-1.5">
          <Field
            label="Title"
            value={source.title}
            flagged={flagged.includes("title")}
            onChange={(title) => onChange({ title, uncertain: clear(flagged, "title") })}
          />
          <Field
            label="Authors"
            value={source.authors
              .map((a) => (a.given ? `${a.family}, ${a.given}` : a.family))
              .join("; ")}
            flagged={flagged.includes("authors")}
            onChange={(v) =>
              onChange({
                authors: v
                  .split(";")
                  .map((s) => s.trim())
                  .filter(Boolean)
                  .map((s) => {
                    const [family, given] = s.split(",");
                    return { family: family.trim(), given: given?.trim() || undefined };
                  }),
                uncertain: clear(flagged, "authors"),
              })
            }
          />
          <div className="grid grid-cols-2 gap-1.5">
            <Field
              label="Year"
              value={source.year ? String(source.year) : ""}
              flagged={flagged.includes("year")}
              onChange={(v) =>
                onChange({
                  year: Number(v) || undefined,
                  uncertain: clear(flagged, "year"),
                })
              }
            />
            <Field
              label="Container"
              value={source.container ?? ""}
              flagged={flagged.includes("container")}
              onChange={(container) =>
                onChange({ container, uncertain: clear(flagged, "container") })
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}

const clear = (flags: string[], field: string) => flags.filter((f) => f !== field);

function Field({
  label,
  value,
  flagged,
  onChange,
}: {
  label: string;
  value: string;
  flagged?: boolean;
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <label className="block">
      <span className="label-mono mb-1 block">{label}</span>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft !== value && onChange(draft)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        className={cn(
          "w-full rounded-sm border bg-surface-2 px-2 py-1.5 text-[11.5px] text-fg outline-none focus:border-accent",
          flagged ? "border-warn/50" : "border-line",
        )}
      />
    </label>
  );
}
