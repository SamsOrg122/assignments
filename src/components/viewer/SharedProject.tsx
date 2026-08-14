"use client";

/**
 * A shared project, read-only.
 *
 * Deliberately not the editor with its controls hidden. A viewer that is
 * secretly an editor is a viewer that will one day let someone type into a
 * document they can't save — and it drags the whole store, the palette and
 * every global listener into a page a stranger opened from a chat message.
 *
 * This renders the same document model with the same components where they're
 * pure (slides, chart drawing, board geometry) and plain markup where they
 * aren't. Nothing here writes anywhere.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { ResponsiveContainer } from "recharts";
import type { Block, Project, TableBlock as TableBlockModel } from "@/lib/types";
import { DEFAULT_DECK_STYLE, DEFAULT_TYPOGRAPHY, sortsOf } from "@/lib/types";
import { computeFormulas } from "@/lib/formula";
import { formatReference, sortSources } from "@/lib/sources";
import { proseVars } from "@/lib/doc-presets";
import { collectNotes, renderMarkers } from "@/lib/notes";
import { headings } from "@/lib/toc";
import { figureFor, figureLabels, renderRefs } from "@/lib/figures";
import { renderMathIn } from "@/lib/math";
import { routeConnector } from "@/lib/board-routing";
import { bounds } from "@/lib/geometry";
import { chartData, renderChart } from "@/components/blocks/ChartBlock";
import { SlideView } from "@/components/slides/SlideView";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";
import { CommentRail } from "./CommentRail";

export function SharedProject({
  project,
  /**
   * The room notes go to, set when the link said "can comment". Absent means
   * a plain reader — and the rail is then not rendered at all rather than
   * rendered disabled, so there is nothing to click and nothing to explain.
   */
  commentIn,
}: {
  project: Project;
  commentIn?: string;
}) {
  if (project.kind === "board") return <SharedBoard project={project} />;
  if (project.kind === "deck") return <SharedDeck project={project} />;
  return <SharedDocument project={project} commentIn={commentIn} />;
}

/* ── Documents ──────────────────────────────────────────── */

function SharedDocument({
  project,
  commentIn,
}: {
  project: Project;
  commentIn?: string;
}) {
  const type = { ...DEFAULT_TYPOGRAPHY, ...project.typography };

  return (
    <div
      className="paper flex-1 overflow-y-auto"
      data-paper={type.paper && type.paper !== "canvas" ? type.paper : undefined}
    >
      <div
        className="mx-auto w-full"
        style={{
          maxWidth: `calc(${type.measure}ch + 2 * ${type.margin}px)`,
          paddingLeft: `min(${type.margin}px, 6vw)`,
          paddingRight: `min(${type.margin}px, 6vw)`,
          paddingTop: 48,
          paddingBottom: 160,
        }}
      >
        <div
          className="prose-shell"
          style={proseVars(type)}
          data-family={type.family}
          data-indent={type.firstLineIndent ? "true" : undefined}
          data-notes-root
        >
          <div className="flex flex-col gap-6">
            {project.blocks.map((b) =>
              commentIn ? (
                // The rail hangs in the margin, so the block needs to be the
                // thing it is positioned against.
                <div key={b.id} className="group/block relative">
                  <CommentRail
                    room={commentIn}
                    blockId={b.id}
                    existing={b.comments ?? []}
                  />
                  <ReadOnlyBlock block={b} project={project} />
                </div>
              ) : (
                <ReadOnlyBlock key={b.id} block={b} project={project} />
              ),
            )}
          </div>
          <SharedNotes project={project} />
        </div>
      </div>
    </div>
  );
}

/**
 * The notes, for a reader.
 *
 * Not the editor's `NotesList`: that one lets you switch between footnotes and
 * endnotes, and a reader has nothing to switch. Same numbering, same order.
 */
function SharedNotes({ project }: { project: Project }) {
  const notes = collectNotes(project.blocks);
  if (!notes.length) return null;
  return (
    <section className="mt-10 border-t border-line pt-5" aria-label="Notes">
      <h2 className="mb-3 text-[12px] tracking-wide text-fg-muted uppercase">
        Notes
      </h2>
      <ol className="space-y-1.5">
        {notes.map((note) => (
          <li
            key={note.id}
            id={`note-${note.id}`}
            className="flex gap-2.5 text-[12.5px] leading-relaxed text-fg-muted"
          >
            <span className="shrink-0 font-mono text-[11px] text-fg-subtle">
              {note.number}.
            </span>
            <span className="min-w-0">{note.text}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function ReadOnlyBlock({
  block,
  project,
}: {
  block: Block;
  project: Project;
}) {
  const face =
    project.typography?.family === "serif"
      ? "prose-serif"
      : project.typography?.family === "mono"
        ? "prose-mono"
        : undefined;

  switch (block.type) {
    case "text":
      return (
        // Sanitised at the boundary, in `decodeShare` — by the time a document
        // reaches this component its markup has already been rebuilt from an
        // allowlist, so there is nothing left here to be careful about.
        // The numbers come from `renderMarkers` rather than the editor's
        // decoration, which does not exist here — a reader has no editor.
        <div
          className={cn("prose-canvas", face)}
          dangerouslySetInnerHTML={{
            __html: renderMathIn(
              renderRefs(
                renderMarkers(block.html, collectNotes(project.blocks)),
                figureLabels(project.blocks),
              ),
            ),
          }}
        />
      );

    case "image":
      return block.src ? (
        <figure
          className={cn(
            "flex flex-col",
            block.align === "left" ? "items-start" : "items-center",
          )}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- a data URL
              carried in the link itself; there is nothing to fetch. */}
          <img
            src={block.src}
            alt={block.alt}
            className={cn(
              "h-auto rounded-sm",
              block.frame === "line" && "border border-line",
              block.frame === "shadow" &&
                "shadow-[0_24px_60px_-24px_rgba(0,0,0,0.75)]",
            )}
            style={{
              width: block.align === "full" ? "100%" : `${block.scale ?? 100}%`,
            }}
          />
          {(figureFor(project.blocks, block.id) || block.caption) && (
            <figcaption
              className={cn(
                "mt-2 w-full text-[12px] text-fg-subtle",
                block.align !== "left" && "text-center",
              )}
            >
              {[figureFor(project.blocks, block.id)?.label, block.caption]
                .filter(Boolean)
                .join(". ")}
            </figcaption>
          )}
        </figure>
      ) : null;

    case "table":
      return <ReadOnlyTable block={block} />;

    case "chart":
      return <ReadOnlyChart block={block} project={project} />;

    case "slides":
      return (
        <div className="overflow-hidden rounded-md border border-line">
          {block.slides.map((slide, i) => (
            <div
              key={slide.id}
              className={cn(
                "relative aspect-[16/9] w-full",
                i > 0 && "border-t border-line",
              )}
              style={{ containerType: "inline-size" }}
            >
              <SlideView
                slide={slide}
                index={i}
                style={block.style ?? DEFAULT_DECK_STYLE}
                readOnly
              />
            </div>
          ))}
        </div>
      );

    case "code":
      return (
        <div className="overflow-hidden rounded-md border border-line bg-surface">
          {block.files.map((file) => (
            <div key={file.id} className="border-b border-line last:border-0">
              <div className="border-b border-line px-3 py-1.5 font-mono text-[10.5px] text-fg-subtle">
                {file.name}
              </div>
              <pre className="overflow-x-auto p-3 font-mono text-[12px] leading-relaxed text-fg-muted">
                {file.content}
              </pre>
            </div>
          ))}
        </div>
      );

    case "bibliography": {
      const cited = new Set<string>();
      for (const b of project.blocks)
        if (b.type === "text")
          for (const m of b.html.matchAll(/data-citation="([^"]+)"/g))
            cited.add(m[1]);
      const pool =
        block.scope === "cited"
          ? (project.sources ?? []).filter((s) => cited.has(s.id))
          : (project.sources ?? []);
      const style = project.citationStyle ?? "apa";

      return (
        <div className={cn("prose-canvas", face)}>
          <h2>{block.title ?? "References"}</h2>
          {sortSources(pool).map((s) => (
            <p
              key={s.id}
              className="pl-8 -indent-8"
              // Built here from the source model by our own formatter, not
              // carried across as markup.
              dangerouslySetInnerHTML={{ __html: formatReference(s, style) }}
            />
          ))}
        </div>
      );
    }

    case "form":
      return (
        <section className="rounded-md border border-line bg-surface px-4 py-3.5">
          <h2 className="mb-2 text-[14px] font-medium text-fg">
            {block.title ?? "Form"}
          </h2>
          {block.intro && (
            <p className="mb-2.5 text-[13px] leading-relaxed text-fg-muted">
              {block.intro}
            </p>
          )}
          <ol className="space-y-1">
            {block.fields.map((field, i) => (
              <li key={field.id} className="text-[13px] text-fg-muted">
                <span className="mr-1.5 font-mono text-[10px] text-fg-subtle">
                  {i + 1}
                </span>
                {field.label}
                {field.required && <span className="text-danger"> *</span>}
              </li>
            ))}
          </ol>
          {/* A copied document is a copy: its form link and its answers are
              not in it, and pretending otherwise would send someone hunting
              for a button that cannot exist here. */}
          <p className="mt-2.5 text-[11.5px] text-fg-subtle">
            The questions only — answering happens through the form&apos;s own
            link.
          </p>
        </section>
      );

    case "toc": {
      const entries = headings(project.blocks).filter(
        (h) => h.level <= (block.depth ?? 3),
      );
      if (!entries.length) return null;
      return (
        <nav className="rounded-md border border-line bg-surface px-4 py-3.5">
          <h2 className="mb-2.5 text-[12px] tracking-wide text-fg-muted uppercase">
            {block.title ?? "Contents"}
          </h2>
          <ol className="space-y-0.5">
            {entries.map((entry) => (
              <li
                key={entry.id}
                style={{ paddingLeft: `${(entry.level - 1) * 16}px` }}
                className={cn(
                  "text-[13px]",
                  entry.level === 1 ? "font-medium text-fg" : "text-fg-muted",
                )}
              >
                {entry.text}
              </li>
            ))}
          </ol>
        </nav>
      );
    }
  }
}

function ReadOnlyTable({ block }: { block: TableBlockModel }) {
  const derived = useMemo(
    () => computeFormulas(block.columns, block.rows),
    [block.columns, block.rows],
  );

  // The stored sort is a view, so a shared table has to apply it to be the
  // table the author was looking at.
  const rows = useMemo(() => {
    const keys = sortsOf(block);
    if (!keys.length) return block.rows;
    return [...block.rows].sort((a, b) => {
      for (const key of keys) {
        const column = block.columns.find((c) => c.id === key.columnId);
        const va = column?.type === "formula"
          ? derived[a.id]?.[key.columnId]
          : a.cells[key.columnId];
        const vb = column?.type === "formula"
          ? derived[b.id]?.[key.columnId]
          : b.cells[key.columnId];
        const cmp =
          typeof va === "number" && typeof vb === "number"
            ? va - vb
            : String(va ?? "").localeCompare(String(vb ?? ""));
        if (cmp) return key.dir === "asc" ? cmp : -cmp;
      }
      return 0;
    });
  }, [block, derived]);

  return (
    <div className="overflow-x-auto rounded-md border border-line">
      <table className="w-full border-collapse text-[12.5px]">
        {block.title && (
          <caption className="px-3 pt-2.5 pb-1.5 text-left text-[12px] font-medium text-fg-muted">
            {block.title}
          </caption>
        )}
        <thead>
          <tr>
            {block.columns.map((c) => (
              <th
                key={c.id}
                className="border-b border-line px-3 py-2 text-left font-medium text-fg-muted"
              >
                {c.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {block.columns.map((c) => (
                <td
                  key={c.id}
                  className="border-b border-line px-3 py-2 text-fg-muted last:border-0"
                >
                  {String(
                    (c.type === "formula"
                      ? derived[row.id]?.[c.id]
                      : row.cells[c.id]) ?? "",
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReadOnlyChart({
  block,
  project,
}: {
  block: Extract<Block, { type: "chart" }>;
  project: Project;
}) {
  const source =
    project.blocks.find(
      (b): b is TableBlockModel => b.type === "table" && b.id === block.sourceId,
    ) ?? null;
  const { data, series } = useMemo(
    () => chartData(source, block),
    [source, block],
  );

  if (!data.length)
    return (
      <p className="rounded-md border border-dashed border-line px-4 py-8 text-center text-[12.5px] text-fg-subtle">
        {block.title ?? "Chart"} — the table it reads from wasn&apos;t shared.
      </p>
    );

  return (
    <div className="rounded-md border border-line bg-surface p-3">
      {block.title && (
        <p className="mb-2 text-[12px] font-medium text-fg-muted">{block.title}</p>
      )}
      <div className="h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          {renderChart(block.kind, data, series)}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ── Decks ──────────────────────────────────────────────── */

function SharedDeck({ project }: { project: Project }) {
  const deck = project.blocks.find((b) => b.type === "slides");
  const [index, setIndex] = useState(0);

  if (!deck || deck.type !== "slides" || !deck.slides.length)
    return <Empty>This deck has no slides.</Empty>;

  const clamped = Math.min(index, deck.slides.length - 1);
  const style = deck.style ?? DEFAULT_DECK_STYLE;

  return (
    <div
      className="flex flex-1 flex-col items-center justify-center gap-4 overflow-y-auto p-5 sm:p-8"
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight")
          setIndex((i) => Math.min(i + 1, deck.slides.length - 1));
        if (e.key === "ArrowLeft") setIndex((i) => Math.max(i - 1, 0));
      }}
    >
      <div
        className="relative aspect-[16/9] w-full max-w-[980px] overflow-hidden rounded-lg border border-line"
        style={{ containerType: "inline-size" }}
      >
        <SlideView slide={deck.slides[clamped]} index={clamped} style={style} readOnly />
      </div>

      <div className="flex w-full max-w-[980px] items-center gap-2">
        <button
          type="button"
          onClick={() => setIndex((i) => Math.max(i - 1, 0))}
          disabled={clamped === 0}
          aria-label="Previous slide"
          className="rounded-sm border border-line p-1.5 text-fg-subtle transition-colors hover:border-line-strong hover:text-fg disabled:opacity-30"
        >
          <Icon name="chevron-left" size={12} />
        </button>
        <span className="font-mono text-[11px] text-fg-subtle tabular-nums">
          {clamped + 1} / {deck.slides.length}
        </span>
        <span className="h-px flex-1 bg-line" />
        <button
          type="button"
          onClick={() =>
            setIndex((i) => Math.min(i + 1, deck.slides.length - 1))
          }
          disabled={clamped === deck.slides.length - 1}
          aria-label="Next slide"
          className="rounded-sm border border-line p-1.5 text-fg-subtle transition-colors hover:border-line-strong hover:text-fg disabled:opacity-30"
        >
          <Icon name="chevron-right" size={12} />
        </button>
      </div>
    </div>
  );
}

/* ── Boards ─────────────────────────────────────────────── */

const STICKY_TONES: Record<string, string> = {
  neutral: "bg-[#33353a] text-fg",
  accent: "bg-[#1c2b4d] text-[#cfe0ff]",
  mint: "bg-[#153026] text-[#bfe6d2]",
  warn: "bg-[#332a19] text-[#e8d5a8]",
};

/**
 * The whole board at once, scaled to fit.
 *
 * A shared board has no pan and no zoom on purpose: the point of the link is
 * that someone sees what you made without learning a canvas first.
 */
function SharedBoard({ project }: { project: Project }) {
  const items = useMemo(
    () =>
      [...project.board].sort(
        (a, b) =>
          (a.kind === "frame" ? 0 : 1) - (b.kind === "frame" ? 0 : 1) ||
          a.z - b.z,
      ),
    [project.board],
  );
  const positioned = useMemo(
    () => items.filter((i) => i.kind !== "connector"),
    [items],
  );

  const box = useMemo(
    () => (positioned.length ? bounds(positioned) : null),
    [positioned],
  );
  const pad = 90;
  const width = (box?.width ?? 0) + pad * 2;
  const height = (box?.height ?? 0) + pad * 2;

  // Fit to whatever width the page has, measured rather than guessed. A
  // container query can't divide a length by a length, and a shared board that
  // needs panning before it can be read defeats the point of the link.
  const [fit, setFit] = useState(1);
  const shellRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = shellRef.current;
    if (!el || !width) return;
    const observer = new ResizeObserver(([entry]) =>
      setFit(Math.min(1, entry.contentRect.width / width)),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [width]);

  if (!box) return <Empty>This board is empty.</Empty>;

  return (
    <div ref={shellRef} className="flex-1 overflow-auto p-4">
      <div
        className="relative mx-auto"
        style={{ width: width * fit, height: height * fit }}
      >
        <div
          className="absolute top-0 left-0 origin-top-left"
          style={{ width, height, transform: `scale(${fit})` }}
        >
          {items.map((item) => {
            if (item.kind === "connector") {
              const from = positioned.find((i) => i.id === item.fromId);
              const to = positioned.find((i) => i.id === item.toId);
              if (!from || !to) return null;
              const route = routeConnector(
                { x: from.x - box.x + pad, y: from.y - box.y + pad, width: from.width, height: from.height },
                { x: to.x - box.x + pad, y: to.y - box.y + pad, width: to.width, height: to.height },
                item.route,
              );
              return (
                <svg
                  key={item.id}
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 overflow-visible"
                  width={width}
                  height={height}
                >
                  <path
                    d={route.d}
                    fill="none"
                    stroke="rgba(255,255,255,0.35)"
                    strokeWidth={1.5}
                    strokeDasharray={item.dashed ? "5 4" : undefined}
                  />
                </svg>
              );
            }

            const at: React.CSSProperties = {
              position: "absolute",
              left: item.x - box.x + pad,
              top: item.y - box.y + pad,
              width: item.width,
              height: item.height,
            };

            if (item.kind === "frame")
              return (
                <div key={item.id} style={at}>
                  <div className="size-full rounded-md border-2 border-dashed border-line-strong" />
                  <span className="absolute -top-5 left-0 text-[12px] text-fg-muted">
                    {item.title}
                  </span>
                </div>
              );

            if (item.kind === "image")
              return item.src ? (
                /* eslint-disable-next-line @next/next/no-img-element -- a
                   data URL carried in the link; there is nothing to fetch. */
                <img
                  key={item.id}
                  src={item.src}
                  alt={item.alt}
                  style={{ ...at, objectFit: "cover", borderRadius: 6 }}
                />
              ) : null;

            if (item.kind === "sticky")
              return (
                <div
                  key={item.id}
                  style={at}
                  className={cn(
                    "rounded-md p-3.5 text-[13px] leading-snug whitespace-pre-wrap",
                    STICKY_TONES[item.tone] ?? STICKY_TONES.neutral,
                  )}
                >
                  {item.text}
                </div>
              );

            // A card is a window onto a project that stayed behind, so it
            // arrives as an outline rather than as a broken preview.
            if (item.kind === "card")
              return (
                <div
                  key={item.id}
                  style={at}
                  className="grid place-items-center rounded-md border border-dashed border-line text-[11.5px] text-fg-subtle"
                >
                  A linked project, not shared
                </div>
              );

            return (
              <div
                key={item.id}
                style={at}
                className="rounded-md p-2 text-[14px] leading-relaxed whitespace-pre-wrap text-fg"
              >
                {item.text}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid flex-1 place-items-center px-6 text-center">
      <p className="text-[13px] text-fg-subtle">{children}</p>
    </div>
  );
}
