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
import type { Block, CellValue, Row, Slide, SlidesBlock, TableBlock } from "../types";
import { escapeHtml, uid } from "../factories";
import { toNumber } from "../formula";
import { analyseRegister, compareRegister, describeRegister, nudgeRegister } from "./register";
import {
  answerBrief,
  answerFiles,
  answerKnowledge,
  answerRemember,
  answerWho,
} from "./team-answers";
import {
  buildBalance,
  buildChart,
  buildClean,
  buildCompute,
  buildFlow,
  buildFormulaExplain,
  buildPlan,
  buildRestyle,
  buildShorten,
} from "./depth";
import {
  analyseDrift,
  analyseTerminology,
  buildOutline,
  findInconsistencies,
  speechToProse,
  termsFromPrompt,
} from "./analysis";

type Intent =
  | "speech"
  | "who"
  | "remember"
  | "brief"
  | "files"
  | "knowledge"
  | "tone"
  | "format"
  | "terminology"
  | "consistency"
  | "drift"
  | "outline"
  | "deck"
  | "summarize"
  | "slides"
  | "forecast"
  | "rewrite"
  | "bullets"
  | "explain"
  | "clean"
  | "compute"
  | "formula"
  | "chart"
  | "restyle"
  | "balance"
  | "shorten"
  | "plan"
  | "flow"
  | "generic";

function classify(prompt: string): Intent {
  const p = prompt.toLowerCase();
  // Ordered most-specific first: "outline my thesis as a deck" is a deck.
  if (/^__speech__/.test(p)) return "speech";
  if (/^\s*(please\s+)?(remember|note that|keep in mind|don'?t forget)\b/.test(p))
    return "remember";
  if (/\b(who (is|are|does|should|handles|owns)|whose|my supervisor|second reader|team member|on the team|roles?)\b/.test(p))
    return "who";
  if (/\b(catch me up|onboard|new (person|member)|brief me|get up to speed|what should i know|where are we)\b/.test(p))
    return "brief";
  // Questions about the workspace itself — subject, school, company, remit.
  if (
    /\b(what (are|do) we (study|studying|research|working on|doing|building)|what('?s| is) (this|our|the) (workspace|team|project|course|subject|company|school|university) (about|called)|what subject|which (course|programme|program|department|faculty)|where do we (work|study))\b/.test(
      p,
    )
  )
    return "brief";
  if (/\b(file|upload|document i gave|brief|pdf|attachment|the deck i)\b/.test(p))
    return "files";
  if (/\b(what do (you|we) know|do (you|we) know|deadline|when is|convention|what do we call|our style)\b/.test(p))
    return "knowledge";
  // Depth intents first: "chart this table" is a chart, not a summary.
  if (/\b(clean|tidy|normali[sz]e|fix)\b/.test(p) && /\b(data|table|cells?|column|numbers?|values?)\b/.test(p))
    return "clean";
  if (/\b(chart|graph|plot|visuali[sz]e)\b/.test(p)) return "chart";
  if (/\b(explain|what does|how does|read)\b/.test(p) && /\bformula\b/.test(p))
    return "formula";
  if (/\b(add|new|create)\b.*\bcolumn\b/.test(p) || /\bcolumn that (computes|calculates)/.test(p))
    return "compute";
  if (/\b(restyle|rebrand|brand|our (colours?|colors?|style)|house style|on-brand)\b/.test(p))
    return "restyle";
  if (/\bbalance\b|\b(tidy|even out|space out)\b.*\b(layout|slide|objects?)\b/.test(p))
    return "balance";
  if (/\b(shorten|cut|trim|reduce)\b.*\b(slides?|deck)\b/.test(p) || /\bdown to \d+ slides?\b/.test(p))
    return "shorten";
  if (/\b(plan|now\/next|kanban|sort|organi[sz]e|bucket)\b/.test(p) && /\b(stick(y|ies)|notes?|these|board|items?)\b/.test(p))
    return "plan";
  if (/\b(connect|link|flow|sequence|chain|arrows?)\b/.test(p) && /\b(these|them|stick(y|ies)|notes?|items?|board)\b/.test(p))
    return "flow";
  if (/^__tone__/.test(p)) return "tone";
  if (/\b(match (the |my )?(tone|voice|register|style)|write .*like this|same (tone|voice|style))/.test(p))
    return "tone";
  if (/\b(number (all )?(the )?headings|title ?case|sentence ?case|capitali[sz]e (all )?headings|make .* headings|two columns|bold the)/.test(p))
    return "format";
  if (/\b(interchangeab|terminolog|consistent(ly)? (use|call)|same term|which term)/.test(p))
    return "terminology";
  if (/\b(deck|pitch|slide)s?\b/.test(p) && /\b(make|turn|build|create|from|into)\b/.test(p))
    return "deck";
  if (/\b(drift|line up|lines up|match(es)? my|answer(s)? the (research )?question|off topic|wander)/.test(p))
    return "drift";
  if (/\b(consistent with|contradict|conflicts?|disagree|argued in|earlier chapter|chapter \d)/.test(p))
    return "consistency";
  if (/\b(outline|structure of|where (am|i am)|how far|table of contents)/.test(p))
    return "outline";
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

const isTable = (b: Block): b is TableBlock => b.type === "table";
const isDeck = (b: Block): b is SlidesBlock => b.type === "slides";

function findTable(ctx: AIRequest["context"], blocks: TableBlock[]): TableBlock | undefined {
  const asked = ctx.targetBlockId ?? ctx.selection?.blockId;
  return blocks.find((b) => b.id === asked) ?? blocks[0];
}

/** Whatever the question was asked from, else the only one there is. */
function pick<T extends Block>(req: AIRequest, blocks: T[]): T | undefined {
  const asked = req.context.targetBlockId ?? req.context.selection?.blockId;
  return blocks.find((b) => b.id === asked) ?? blocks[0];
}

/* ── Response builders ──────────────────────────────────── */

interface Built {
  text: string;
  change?: AIChange;
}

/* ── Team-aware builders ────────────────────────────────── */

/** The intents answered from the workspace record rather than the document. */
const TEAM_INTENTS = new Set<Intent>([
  "who",
  "brief",
  "files",
  "remember",
  "knowledge",
]);

/**
 * These need the workspace. Without it the honest answer is that the
 * assistant hasn't been introduced to anyone yet.
 */
function buildTeam(req: AIRequest, intent: Intent): Built {
  const team = req.context.team;
  if (!team)
    return {
      text: "I don't have this workspace's team yet. Open the Team page to set up members and what the group knows.",
    };

  const answer =
    intent === "who"
      ? answerWho(team, req.prompt)
      : intent === "brief"
        ? answerBrief(team)
        : intent === "files"
          ? answerFiles(team, req.prompt)
          : intent === "remember"
            ? answerRemember(req.prompt)
            : answerKnowledge(team, req.prompt);

  return {
    text: answer.text,
    change: answer.learn
      ? {
          kind: "remember",
          entry: answer.learn,
          label: `Remember “${answer.learn.subject}”`,
        }
      : undefined,
  };
}

/* ── Tone matching ──────────────────────────────────────── */

/**
 * "Write the rest like this." The sample arrives after a `__tone__` marker;
 * the passage to bring into line is the current selection.
 */
function buildTone(req: AIRequest): Built {
  const marked = /^__tone__\s*([\s\S]*?)\s*__endtone__\s*([\s\S]*)$/.exec(req.prompt);
  const sampleText = marked?.[1] ?? "";
  const targetText =
    marked?.[2]?.trim() ||
    req.context.selection?.text ||
    req.context.blocks.filter((b) => b.type === "text").at(-1)?.text ||
    "";

  if (!sampleText.trim())
    return {
      text: "Select a passage whose voice is right, choose **Use as voice sample**, then select the passage to bring into line.",
    };
  if (!targetText.trim())
    return { text: "Nothing selected to rewrite in that voice." };

  const sample = analyseRegister(sampleText);
  const target = analyseRegister(targetText);
  const gaps = compareRegister(sample, target);

  const lines = [
    `Your sample reads as **${describeRegister(sample)}**.`,
    `The passage you've selected reads as **${describeRegister(target)}**.`,
    "",
  ];

  if (gaps.length === 0) {
    lines.push("They already match on every feature I measure — nothing to change.");
    return { text: lines.join("\n") };
  }

  lines.push("Where they diverge:", "");
  for (const g of gaps)
    lines.push(`• **${g.feature}** — ${g.sample} vs ${g.target}. ${g.direction}.`);

  const rewritten = nudgeRegister(targetText, sample);
  const changed = rewritten !== targetText.replace(/\s{2,}/g, " ").trim();

  lines.push(
    "",
    changed
      ? `_I've applied only the mechanical parts — contractions and sentence length. Word choice stays yours; a model would take it further without flattening your voice._`
      : `_Nothing here is safe to change mechanically. These are judgement calls, not find-and-replace._`,
  );

  return {
    text: lines.join("\n"),
    change:
      changed && req.context.selection
        ? {
            kind: "replace-text",
            blockId: req.context.selection.blockId,
            label: "Bring this passage into the sample's register",
            html: rewritten
              .split(/\n{2,}/)
              .map((p) => `<p>${escapeHtml(p)}</p>`)
              .join(""),
          }
        : undefined,
  };
}

/* ── Natural-language formatting ────────────────────────── */

/**
 * Typed formatting commands — "number all headings", "title case the
 * headings" — so nobody has to hunt a menu. Each one is a concrete,
 * reviewable change rather than a suggestion.
 */
function buildFormat(req: AIRequest): Built {
  const p = req.prompt.toLowerCase();
  const textBlocks = req.context.blocks.filter((b) => b.type === "text");
  if (textBlocks.length === 0)
    return { text: "There's no prose here to format." };

  if (/number/.test(p)) {
    let n = 0;
    const edits: Array<{ blockId: string; html: string }> = [];
    for (const b of textBlocks) {
      // The document's h1 is its title; numbering starts at the first section.
      if (!b.heading || b.headingLevel === 1) continue;
      n++;
      const clean = b.heading.replace(/^\s*\d+\s*(?:—|-|\.)\s*/, "");
      edits.push({ blockId: b.id, html: `${n} — ${clean}` });
    }
    if (n === 0) return { text: "No headings found to number." };

    return {
      text:
        `Found ${n} heading${n === 1 ? "" : "s"}:\n\n` +
        edits.map((e) => `• ${e.html}`).join("\n") +
        `\n\nAccepting renumbers them in order. Existing numbers are replaced, not doubled.`,
      change: {
        kind: "renumber-headings",
        label: `Number ${n} heading${n === 1 ? "" : "s"}`,
      },
    };
  }

  if (/title ?case/.test(p)) {
    return {
      text: `Title Case is a style choice your department may have an opinion on — APA wants sentence case for headings, MLA wants title case. Say which and I'll apply it.`,
    };
  }

  return {
    text: `I can number headings today. "Two columns" needs a layout primitive the document model doesn't have yet — it's on the list, not faked.`,
  };
}

/* ── Workspace-aware builders ───────────────────────────── */

/**
 * Speech → prose. Arrives with a `__speech__` prefix from the dictation panel
 * so it can never be confused with something the user typed.
 */
function buildSpeech(req: AIRequest): Built {
  const raw = req.prompt.replace(/^__speech__\s*/i, "");
  if (!raw.trim())
    return { text: "I didn't catch anything to write up." };

  const { html, stats } = speechToProse(raw);
  const target =
    req.context.selection?.blockId ?? req.context.blocks.at(-1)?.id ?? "";

  return {
    text:
      `Wrote up ${stats.before} spoken words as ${stats.after} written ones` +
      (stats.removed ? `, dropping ${stats.removed} filler${stats.removed === 1 ? "" : "s"}` : "") +
      `.\n\n` +
      `I removed the hesitations and false starts, joined the spoken clauses into sentences, ` +
      `and broke the result into paragraphs — so it reads like something you wrote, not something you said.`,
    change: target
      ? {
          kind: "append-text",
          blockId: target,
          html,
          label: "Insert the written-up prose",
        }
      : undefined,
  };
}

function buildTerminology(req: AIRequest): Built {
  const requested = termsFromPrompt(req.prompt);
  const found = analyseTerminology(req.context, requested);

  if (!found)
    return {
      text:
        requested.length >= 2
          ? `Neither “${requested[0]}” nor “${requested[1]}” appears often enough in ${req.context.projectName} to judge.`
          : `I scanned all ${req.context.blocks.length} sections and didn't find a term drifting between near-synonyms.`,
    };

  const total = found.group.reduce((n, u) => n + u.count, 0);
  const dominant = found.group.reduce((m, u) => (u.count > m.count ? u : m));

  const lines = [
    `Yes — you're using ${found.group.length} terms for the same thing across ${found.scanned} sections:`,
    "",
    ...found.group.map(
      (u) =>
        `• **${u.term}** — ${u.count}× in ${u.sections.join(", ") || "—"}`,
    ),
    "",
    `“${dominant.term}” is the majority usage (${dominant.count} of ${total}). ` +
      `The mixed sections are the ones to fix first: ` +
      `${[...new Set(found.group.flatMap((u) => u.sections))].join(", ")}.`,
    "",
    `_Pick one and I can rewrite the others to match._`,
  ];

  return { text: lines.join("\n") };
}

function buildConsistency(req: AIRequest): Built {
  const pairs = findInconsistencies(req.context);
  if (pairs.length === 0)
    return {
      text: `I compared every claim across the ${req.context.blocks.length} sections of ${req.context.projectName} and found no pair that contradicts itself on figures or polarity. That's a weak guarantee, not a strong one — it catches numeric and hedging conflicts, not conceptual ones.`,
    };

  const lines = [
    `Reading the whole document, ${pairs.length} pair${pairs.length === 1 ? "" : "s"} of claims sit awkwardly together:`,
    "",
  ];
  for (const p of pairs) {
    lines.push(`**${p.a.where} ↔ ${p.b.where}** — ${p.reason}`);
    lines.push(`• ${p.a.text}`);
    lines.push(`• ${p.b.text}`);
    lines.push("");
  }
  return { text: lines.join("\n") };
}

function buildDrift(req: AIRequest): Built {
  const drift = analyseDrift(req.context);
  if (!drift)
    return {
      text: `I couldn't find a stated research question. Write one as “Research question: …” and I can measure every section against it.`,
    };

  const lines = [
    `Your research question:`,
    "",
    `> ${drift.question}`,
    "",
    `Measuring each section's vocabulary against it:`,
    "",
    ...drift.sections.map(
      (s) =>
        `• ${s.where} — ${s.alignment}% ${bar(s.alignment, Math.max(...drift.sections.map((x) => x.alignment)))}`,
    ),
    "",
  ];

  if (drift.weakest)
    lines.push(
      `**${drift.weakest.where}** drifts furthest (${drift.weakest.alignment}%).`,
    );
  if (drift.strays.length)
    lines.push(
      `It leans on terms the question never raises: ${drift.strays.map((w) => `\`${w}\``).join(", ")}.`,
    );
  lines.push(
    "",
    `_Either the conclusion is answering a broader question than you asked, or the question needs widening to match it._`,
  );

  return { text: lines.join("\n") };
}

/** A tiny inline meter — cheaper to read than a column of bare percentages. */
function bar(value: number, max: number): string {
  const filled = Math.max(1, Math.round((value / (max || 1)) * 8));
  return "▮".repeat(filled) + "▯".repeat(8 - filled);
}

function buildOutlineAnswer(req: AIRequest): Built {
  const entries = buildOutline(req.context);
  const { words, wordGoal } = req.context;

  const lines = [
    `**${req.context.projectName}** — ${entries.length} sections, ${words.toLocaleString()} words` +
      (wordGoal ? ` of ${wordGoal.toLocaleString()} (${Math.round((words / wordGoal) * 100)}%)` : "") +
      `.`,
    "",
    ...entries.map(
      (e) => `• **${e.where}** — ${e.words} words${e.lead ? `\n  ${e.lead}…` : ""}`,
    ),
  ];

  if (wordGoal) {
    const remaining = Math.max(0, wordGoal - words);
    lines.push(
      "",
      remaining
        ? `${remaining.toLocaleString()} words to go. The thinnest section is **${
            entries.reduce((m, e) => (e.words < m.words ? e : m), entries[0])?.where
          }**.`
        : `You're past the target.`,
    );
  }

  return { text: lines.join("\n") };
}

/**
 * Thesis → deck. Uses the document's own structure: one slide per section,
 * bullets pulled from that section's leading sentences.
 */
function buildDeck(req: AIRequest): Built {
  const requested = /\b(\d{1,2})[- ]?slide/i.exec(req.prompt);
  const target = Math.min(20, Math.max(3, Number(requested?.[1] ?? 10)));

  const sections = buildOutline(req.context).filter((e) => e.words > 15);
  if (sections.length === 0)
    return { text: "There's no prose here yet to build a deck from." };

  const slides: Slide[] = [
    {
      id: uid(),
      title: req.context.projectName,
      bullets: [sections[0]?.lead?.slice(0, 90) ?? "A summary"],
      note: "Open on the problem.",
    },
  ];

  // Spread the available sections across the remaining slide budget.
  const body = sections.slice(sections.length > 1 ? 1 : 0);
  const perSlide = Math.max(1, Math.ceil(body.length / (target - 2)));
  for (let i = 0; i < body.length && slides.length < target - 1; i += perSlide) {
    const group = body.slice(i, i + perSlide);
    const source = req.context.blocks.find((b) => b.id === group[0].blockId);
    slides.push({
      id: uid(),
      title: group[0].where,
      bullets: sentences(source?.text ?? "")
        .slice(0, 3)
        .map((s) => (s.length > 96 ? s.slice(0, 95) + "…" : s)),
    });
  }

  slides.push({
    id: uid(),
    title: "In one line",
    bullets: [sections.at(-1)?.lead?.slice(0, 90) ?? "What it adds up to"],
    note: "Land the ask.",
  });

  return {
    text:
      `Built a ${slides.length}-slide deck from the ${sections.length} sections of **${req.context.projectName}**.\n\n` +
      `One slide per section, bullets taken from each section's opening claims, ` +
      `titles from your own headings. Accepting creates a new Deck project in the library ` +
      `and leaves this document untouched.`,
    change: {
      kind: "create-project",
      projectKind: "deck",
      name: `${req.context.projectName} — pitch`,
      label: `Create a ${slides.length}-slide deck project`,
      blocks: [{ id: uid(), type: "slides", title: "Deck", slides }],
    },
  };
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

/* ── Depth intents ──────────────────────────────────────── */

/**
 * Tables, decks and boards. Returns undefined for everything else, so the prose
 * chain below stays exactly as it was — a question about a document doesn't
 * suddenly route through the spreadsheet.
 *
 * The deck is found the same way tables are: whatever the user had selected,
 * falling back to the first one in the project. Asking "balance this layout"
 * from inside a deck should not require also selecting it.
 */
function buildDepth(
  req: AIRequest,
  intent: Intent,
  blocks: Block[],
): Built | undefined {
  const table = () => findTable(req.context, blocks.filter(isTable));
  const deck = () => pick(req, blocks.filter(isDeck));

  switch (intent) {
    case "clean":
      return buildClean(table());
    case "compute":
      return buildCompute(req.prompt, table());
    case "formula":
      return buildFormulaExplain(req.prompt, table());
    case "chart":
      return buildChart(table());
    case "restyle":
      return buildRestyle(req, deck());
    case "balance":
      return buildBalance(req, deck());
    case "shorten":
      return buildShorten(req, deck());
    case "plan":
      return buildPlan(req);
    case "flow":
      return buildFlow(req);
    default:
      return undefined;
  }
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

export function createMockProvider(
  /** Live document access, so answers are computed from the real blocks. */
  getBlocks: (projectId: string) => Block[],
): AIProvider {
  return {
    name: "stub",
    async *stream(req: AIRequest): AsyncIterable<AIChunk> {
      // A beat of latency so the streaming UI has something to show.
      await sleep(220, req.signal);

      // A file attached to the question steers the answer to it, unless the
      // wording already asks for something else the workspace can answer.
      const focused = req.context.team?.focusFiles?.length ?? 0;
      const spoken = classify(req.prompt);
      const intent: Intent =
        focused && !TEAM_INTENTS.has(spoken) ? "files" : spoken;
      const blocks = getBlocks(req.context.projectId);
      const depth = buildDepth(req, intent, blocks);
      const built: Built =
        depth ??
        (intent === "speech"
          ? buildSpeech(req)
          : intent === "who" ||
              intent === "brief" ||
              intent === "files" ||
              intent === "remember" ||
              intent === "knowledge"
            ? buildTeam(req, intent)
          : intent === "tone"
            ? buildTone(req)
            : intent === "format"
              ? buildFormat(req)
          : intent === "terminology"
            ? buildTerminology(req)
            : intent === "consistency"
              ? buildConsistency(req)
              : intent === "drift"
                ? buildDrift(req)
                : intent === "outline"
                  ? buildOutlineAnswer(req)
                  : intent === "deck"
                    ? buildDeck(req)
                    : intent === "summarize"
          ? buildSummary(req)
          : intent === "slides"
            ? buildSlides(req)
            : intent === "forecast"
              ? buildForecast(req, blocks.filter(isTable))
              : intent === "rewrite"
                ? buildRewrite(req)
                : intent === "bullets"
                  ? buildBullets(req)
                  : intent === "explain"
                    ? buildExplain(req)
                    : buildGeneric(req));

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
