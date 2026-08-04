/**
 * The stub provider.
 *
 * It does no inference — but it does real work on real document data, so the
 * interaction (streaming, a concrete proposed change, accept/reject) is the
 * same shape it will be with a model behind it. Nothing here leaks into the
 * components: replace this file with an HTTP call to a model and the UI is
 * unchanged.
 */

import type { AIChange, AIChunk, AIProvider, AIRequest } from "./types";
import type { CellValue, Row, Slide, TableBlock } from "../types";
import { escapeHtml, uid } from "../factories";
import { toNumber } from "../formula";

type Intent =
  | "summarize"
  | "slides"
  | "forecast"
  | "rewrite"
  | "bullets"
  | "explain"
  | "generic";

function classify(prompt: string): Intent {
  const p = prompt.toLowerCase();
  if (/\b(summar|tl;?dr|recap|gist)/.test(p)) return "summarize";
  if (/\b(slide|deck|present)/.test(p)) return "slides";
  if (/\b(forecast|project|predict|extrapolat|trend)/.test(p)) return "forecast";
  if (/\b(rewrite|tighten|shorten|clean up|polish|concise)/.test(p))
    return "rewrite";
  if (/\b(bullet|list|break (this )?(down|up))/.test(p)) return "bullets";
  if (/\b(explain|what does|why|how does)/.test(p)) return "explain";
  return "generic";
}

/* ── Text helpers ───────────────────────────────────────── */

function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 12);
}

const STOP = new Set(
  ("the a an and or of to in for on with is are was were be been it this that " +
    "as at by from we our you your they their has have had will can not but " +
    "all across led two second than more most into one").split(" "),
);

/** Cheap keyword extraction — good enough to make the stub feel attentive. */
function keywords(text: string, n: number): string[] {
  const counts = new Map<string, number>();
  for (const raw of text.toLowerCase().match(/[a-z][a-z'-]{2,}/g) ?? []) {
    if (STOP.has(raw)) continue;
    counts.set(raw, (counts.get(raw) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([w]) => w);
}

/** Lines that look like list items, used for text → slides. */
function listItems(text: string): string[] {
  return text
    .split(/\n+/)
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter(Boolean);
}

/* ── Table helpers ──────────────────────────────────────── */

/** Ordinary least squares on (index, value) — the forecast's whole brain. */
function linearFit(values: number[]): { slope: number; intercept: number } {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: values[0] ?? 0 };
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - meanX) * (values[i] - meanY);
    den += (i - meanX) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  return { slope, intercept: meanY - slope * meanX };
}

function findTable(ctx: AIRequest["context"], blocks: TableBlock[]): TableBlock | undefined {
  const selected = ctx.selection?.blockId;
  return blocks.find((b) => b.id === selected) ?? blocks[0];
}

/* ── Response builders ──────────────────────────────────── */

interface Built {
  text: string;
  change?: AIChange;
}

function buildSummary(req: AIRequest): Built {
  const { context } = req;
  const scope = context.selection?.text?.trim();
  const corpus = scope || context.blocks.map((b) => b.text).join("\n\n");
  const picked = sentences(corpus).slice(0, 3);
  const topics = keywords(corpus, 4);
  const tableCount = context.blocks.filter((b) => b.type === "table").length;
  const wordCount = corpus.split(/\s+/).filter(Boolean).length;

  const lines = [
    scope
      ? "Here's what the selection says, tightened:"
      : `Reading all ${context.blocks.length} blocks in ${context.projectName}:`,
    "",
    ...picked.map((s) => `• ${s}`),
    "",
    `${wordCount} words${tableCount ? `, ${tableCount} table${tableCount > 1 ? "s" : ""}` : ""}. Recurring themes: ${topics.join(", ") || "—"}.`,
  ];
  const text = lines.join("\n");

  const change: AIChange | undefined = context.selection
    ? {
        kind: "replace-text",
        blockId: context.selection.blockId,
        label: "Replace block with summary",
        html:
          `<h3>Summary</h3><ul>` +
          picked.map((s) => `<li>${escapeHtml(s)}</li>`).join("") +
          `</ul>`,
      }
    : undefined;

  return { text, change };
}

function buildSlides(req: AIRequest): Built {
  const { context } = req;
  const source = context.selection?.text || context.blocks[0]?.text || "";
  const items = listItems(source);
  const heading = items[0] ?? context.projectName;

  // Group items into slides of three bullets each.
  const body = items.slice(1).length ? items.slice(1) : sentences(source);
  const slides: Slide[] = [
    { id: uid(), title: heading, bullets: [context.projectName] },
  ];
  for (let i = 0; i < body.length; i += 3) {
    slides.push({
      id: uid(),
      title: `Point ${slides.length}`,
      bullets: body.slice(i, i + 3),
    });
  }
  if (slides.length === 1)
    slides.push({ id: uid(), title: "Details", bullets: ["(no content found)"] });

  return {
    text: `Turned ${body.length} point${body.length === 1 ? "" : "s"} into a ${slides.length}-slide deck. Titles are placeholders — edit them in place after accepting.`,
    change: {
      kind: "insert-block",
      afterBlockId: context.selection?.blockId ?? context.blocks.at(-1)?.id ?? "",
      label: `Insert ${slides.length}-slide deck`,
      block: { id: uid(), type: "slides", title: "From AI", slides },
    },
  };
}

function buildForecast(req: AIRequest, tables: TableBlock[]): Built {
  const table = findTable(req.context, tables);
  if (!table)
    return {
      text: "There's no table in this project to forecast from. Add one with `/table` and try again.",
    };

  const numeric = table.columns.filter((c) => c.type === "number");
  const target = numeric.at(-1);
  if (!target)
    return {
      text: `"${table.title ?? "Table"}" has no numeric column to forecast. Set a column's type to Number first.`,
    };

  const series = table.rows.map((r) => toNumber(r.cells[target.id]));
  const { slope, intercept } = linearFit(series);
  const periods = 3;

  const labelCol = table.columns.find((c) => c.type === "text");
  const appendRows: Row[] = [];
  const values: Record<string, CellValue> = {};

  // Fitted values for existing rows, so the column reads as a trend line.
  table.rows.forEach((r, i) => {
    values[r.id] = Math.round((intercept + slope * i) * 100) / 100;
  });

  for (let k = 0; k < periods; k++) {
    const i = series.length + k;
    const row: Row = { id: uid(), cells: {} };
    for (const c of table.columns) {
      if (c.type === "formula") continue;
      row.cells[c.id] = c.id === labelCol?.id ? `Forecast ${k + 1}` : null;
    }
    appendRows.push(row);
    values[row.id] = Math.round((intercept + slope * i) * 100) / 100;
  }

  const direction = slope > 0 ? "rising" : slope < 0 ? "falling" : "flat";
  const perStep = Math.abs(Math.round(slope * 100) / 100);

  return {
    text:
      `Fitted a least-squares trend to **${target.name}** across ${series.length} rows.\n\n` +
      `The series is ${direction}${slope !== 0 ? ` by about ${perStep} per row` : ""}. ` +
      `I've projected ${periods} periods forward into a new column, ` +
      `and added ${periods} rows to hold them.\n\n` +
      `Any chart bound to this table picks the new column up automatically once you accept.`,
    change: {
      kind: "add-column",
      blockId: table.id,
      label: `Add "${target.name} (forecast)" + ${periods} rows`,
      column: { id: uid(), name: `${target.name} (forecast)`, type: "number" },
      values,
      appendRows,
    },
  };
}

function buildRewrite(req: AIRequest): Built {
  const sel = req.context.selection;
  const source = sel?.text ?? req.context.blocks[0]?.text ?? "";
  const tightened = sentences(source)
    .map((s) =>
      s
        .replace(/\b(?:very|really|quite|just|actually|basically|simply)\s+/gi, "")
        .replace(/\bin order to\b/gi, "to")
        .replace(/\bat this point in time\b/gi, "now")
        .replace(/\bdue to the fact that\b/gi, "because")
        .replace(/\s{2,}/g, " ")
        .trim(),
    )
    .filter(Boolean);

  const before = source.split(/\s+/).filter(Boolean).length;
  const after = tightened.join(" ").split(/\s+/).filter(Boolean).length;

  return {
    text:
      `Tightened ${before} words to ${after} — cut hedges and filler, kept every claim.\n\n` +
      tightened.map((s) => `${s}`).join(" "),
    change: sel
      ? {
          kind: "replace-text",
          blockId: sel.blockId,
          label: "Apply tightened prose",
          html: tightened.map((s) => `<p>${escapeHtml(s)}</p>`).join(""),
        }
      : undefined,
  };
}

function buildBullets(req: AIRequest): Built {
  const sel = req.context.selection;
  const source = sel?.text ?? req.context.blocks[0]?.text ?? "";
  const points = sentences(source).slice(0, 6);
  return {
    text: `Broke this into ${points.length} points:\n\n${points.map((p) => `• ${p}`).join("\n")}`,
    change: sel
      ? {
          kind: "replace-text",
          blockId: sel.blockId,
          label: "Convert to a bulleted list",
          html: `<ul>${points.map((p) => `<li>${escapeHtml(p)}</li>`).join("")}</ul>`,
        }
      : undefined,
  };
}

function buildExplain(req: AIRequest): Built {
  const { context } = req;
  const kinds = new Map<string, number>();
  for (const b of context.blocks) kinds.set(b.type, (kinds.get(b.type) ?? 0) + 1);
  const inventory = [...kinds.entries()]
    .map(([k, n]) => `${n} ${k}${n > 1 ? "s" : ""}`)
    .join(", ");

  return {
    text:
      `**${context.projectName}** holds ${inventory}.\n\n` +
      (context.selection
        ? `You've selected ${context.selection.text.split(/\s+/).filter(Boolean).length} words in a ${context.selection.blockType} block. `
        : "") +
      `I read the whole project as context, so questions can span blocks — ` +
      `"does the chart match what the intro claims?" is a fair question here.\n\n` +
      `_This is the stub provider: it analyses your real content but does no inference. ` +
      `Point \`askAI\` at a model and this same flow becomes real._`,
  };
}

function buildGeneric(req: AIRequest): Built {
  const { prompt, context } = req;
  const topics = keywords(
    context.selection?.text ?? context.blocks.map((b) => b.text).join(" "),
    3,
  );
  return {
    text:
      `Working on "${prompt}" with ${context.blocks.length} blocks of context` +
      (topics.length ? ` (mostly about ${topics.join(", ")})` : "") +
      `.\n\n_The stub provider doesn't do open-ended generation. ` +
      `Try "summarize this", "rewrite this", "turn this into slides", or "forecast this column" ` +
      `to see a real accept/reject change._`,
  };
}

/* ── Streaming ──────────────────────────────────────────── */

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });

export function createMockProvider(getTables: (projectId: string) => TableBlock[]): AIProvider {
  return {
    name: "stub",
    async *stream(req: AIRequest): AsyncIterable<AIChunk> {
      // A beat of latency so the streaming UI has something to show.
      await sleep(220, req.signal);

      const intent = classify(req.prompt);
      const built: Built =
        intent === "summarize"
          ? buildSummary(req)
          : intent === "slides"
            ? buildSlides(req)
            : intent === "forecast"
              ? buildForecast(req, getTables(req.context.projectId))
              : intent === "rewrite"
                ? buildRewrite(req)
                : intent === "bullets"
                  ? buildBullets(req)
                  : intent === "explain"
                    ? buildExplain(req)
                    : buildGeneric(req);

      // Emit token-ish chunks at a readable cadence.
      const tokens = built.text.match(/\S+\s*/g) ?? [];
      for (const token of tokens) {
        yield { type: "text", value: token };
        await sleep(8 + Math.random() * 18, req.signal);
      }

      if (built.change) {
        await sleep(120, req.signal);
        yield { type: "change", value: built.change };
      }
      yield { type: "done" };
    },
  };
}
