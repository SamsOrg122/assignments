/**
 * The intents that reach into the depth features: tables, decks and boards.
 *
 * They live apart from `mock.ts` because they share a property the prose
 * intents don't — every one of them computes a *concrete change* against real
 * document data and hands it back for the user to accept or reject. Nothing
 * here writes to the store; the answer is a proposal, the same shape a real
 * model's tool call would arrive in.
 *
 * The stub does no inference. What it does do is the actual work: the cleaner
 * really finds the ragged cells, the balancer really lays the objects out on a
 * grid, the planner really measures the stickies it's arranging. So the
 * interaction is honest even though the intelligence is not.
 */

import type {
  BoardItem,
  BoardTone,
  CellValue,
  Column,
  DeckStyle,
  Slide,
  SlideObject,
  SlidesBlock,
  TableBlock,
} from "../types";
import { DEFAULT_DECK_STYLE } from "../types";
import { uid } from "../factories";
import { computeFormulas } from "../formula";
import { balance } from "../geometry";
import type { AIChange, AIRequest } from "./types";

export interface Built {
  text: string;
  change?: AIChange;
}

/* ── Tables ─────────────────────────────────────────────── */

/** A cell that looks like a number wearing a string's clothes. */
const NUMERIC_TEXT = /^\s*[-+]?[\d.,\s]*\d\s*%?\s*$/;

function cleanValue(
  value: CellValue,
  type: Column["type"],
): { next: CellValue; why: string } | null {
  if (typeof value !== "string") return null;

  const trimmed = value.replace(/\s+/g, " ").trim();
  if (trimmed !== value)
    return { next: trimmed, why: "stray whitespace" };

  if ((type === "number" || type === "currency") && NUMERIC_TEXT.test(value)) {
    // "1,240" and "1 240" are the same number typed by two different people.
    const n = Number(value.replace(/[\s,]/g, "").replace("%", ""));
    if (Number.isFinite(n) && String(n) !== value)
      return { next: n, why: "text that should be a number" };
  }

  return null;
}

/**
 * Make the invisible visible. "  Americas  " → "Americas" is a real change that
 * renders as "Americas → Americas" — a preview that shows nothing is worse than
 * no preview, because it looks like the tool is about to do nothing.
 */
function showSpaces(s: string): string {
  return s
    .replace(/^\s+/, (m) => "·".repeat(m.length))
    .replace(/\s+$/, (m) => "·".repeat(m.length));
}

export function buildClean(table: TableBlock | undefined): Built {
  if (!table)
    return { text: "There's no table here to clean. Add one with `/table`." };

  const cells: Array<{ rowId: string; columnId: string; value: CellValue }> = [];
  const examples: Array<{ from: string; to: string }> = [];
  const reasons = new Map<string, number>();

  for (const row of table.rows)
    for (const column of table.columns) {
      if (column.type === "formula") continue;
      const found = cleanValue(row.cells[column.id] ?? null, column.type);
      if (!found) continue;
      cells.push({ rowId: row.id, columnId: column.id, value: found.next });
      reasons.set(found.why, (reasons.get(found.why) ?? 0) + 1);
      if (examples.length < 4)
        examples.push({
          from: showSpaces(String(row.cells[column.id])),
          to: String(found.next),
        });
    }

  if (!cells.length)
    return {
      text: `I went through all ${table.rows.length} rows of “${table.title ?? "the table"}” and found nothing to fix — no ragged whitespace, no numbers stored as text. It's clean.`,
    };

  const breakdown = [...reasons.entries()]
    .map(([why, n]) => `${n} × ${why}`)
    .join(", ");

  return {
    text: `Found **${cells.length} cell${cells.length === 1 ? "" : "s"}** worth fixing in “${table.title ?? "the table"}”: ${breakdown}.\n\nNothing is deleted and no rows move — only the values listed below change. Formula columns are left alone, since they recompute from the cells this touches.`,
    change: {
      kind: "set-cells",
      blockId: table.id,
      cells,
      examples,
      label: `Clean ${cells.length} cell${cells.length === 1 ? "" : "s"}`,
    },
  };
}

/**
 * "Add a column that computes X." The stub can't parse arbitrary English, so it
 * matches the handful of shapes people actually ask for and — importantly —
 * says plainly when it can't, rather than inventing a column.
 */
export function buildCompute(prompt: string, table: TableBlock | undefined): Built {
  if (!table)
    return { text: "There's no table here to add a column to." };

  const numeric = table.columns.filter(
    (c) => c.type === "number" || c.type === "currency" || c.type === "formula",
  );
  if (numeric.length < 1)
    return {
      text: `“${table.title ?? "The table"}” has no numeric columns yet, so there's nothing to compute from. Set a column's type to Number first.`,
    };

  const p = prompt.toLowerCase();
  // Order by where each name appears in the question, not by where the column
  // sits in the table: "Q3 per Q2" has to divide Q3 by Q2, not the reverse.
  const named = table.columns
    .map((c) => ({ c, at: p.indexOf(c.name.toLowerCase()) }))
    .filter((n) => n.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((n) => n.c);

  let formula: string;
  let name: string;

  if (/\b(per|each|divide|ratio|rate|average per)\b/.test(p) && named.length >= 2) {
    formula = `[${named[0].name}] / [${named[1].name}]`;
    name = `${named[0].name} per ${named[1].name}`;
  } else if (/\b(times|multipl|product|total|revenue|amount)\b/.test(p) && named.length >= 2) {
    formula = `[${named[0].name}] * [${named[1].name}]`;
    name = `${named[0].name} × ${named[1].name}`;
  } else if (/\b(sum|plus|add|combined)\b/.test(p) && named.length >= 2) {
    formula = `[${named[0].name}] + [${named[1].name}]`;
    name = `${named[0].name} + ${named[1].name}`;
  } else if (/\b(share|percent|percentage|proportion|%)\b/.test(p) && named.length >= 1) {
    formula = `[${named[0].name}] / SUM([${named[0].name}]) * 100`;
    name = `${named[0].name} share %`;
  } else if (named.length >= 2) {
    formula = `[${named[0].name}] * [${named[1].name}]`;
    name = `${named[0].name} × ${named[1].name}`;
  } else {
    return {
      text: `I can see “${table.title ?? "the table"}” has ${table.columns.map((c) => `**${c.name}**`).join(", ")}, but I can't tell which of them you want combined and how.\n\nName two of them and an operation — "add a column for price times units", "a column with revenue per seat" — and I'll build the formula.`,
    };
  }

  const column: Column = { id: uid(), name, type: "formula", formula };
  return {
    text: `Adding **${name}** as a formula column:\n\n\`${formula}\`\n\nIt recomputes whenever the columns it reads change, so it won't go stale the way a pasted result would.`,
    change: {
      kind: "add-column",
      blockId: table.id,
      column,
      values: {},
      label: `Add “${name}”`,
    },
  };
}

/** "Explain this formula" — reads the actual formula, in plain English. */
export function buildFormulaExplain(
  prompt: string,
  table: TableBlock | undefined,
): Built {
  if (!table) return { text: "There's no table here." };

  const p = prompt.toLowerCase();
  const formulas = table.columns.filter((c) => c.type === "formula" && c.formula);
  if (!formulas.length)
    return {
      text: `“${table.title ?? "The table"}” has no formula columns — every column holds typed-in values.`,
    };

  const target =
    formulas.find((c) => p.includes(c.name.toLowerCase())) ?? formulas[0];
  const src = target.formula ?? "";

  const refs = [...src.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]);
  const funcs = [...new Set([...src.matchAll(/\b([A-Z]{2,})\s*\(/g)].map((m) => m[1]))];
  const derived = computeFormulas(table.columns, table.rows);
  const sample = table.rows[0];
  const sampleValue = sample ? derived[sample.id]?.[target.id] : undefined;

  const opNames: Record<string, string> = {
    "*": "multiplies",
    "/": "divides",
    "+": "adds",
    "-": "subtracts",
  };
  const ops = [...new Set(src.match(/[*/+-]/g) ?? [])]
    .map((o) => opNames[o])
    .filter(Boolean);

  const lines = [
    `**${target.name}** is \`${src}\`.`,
    "",
    refs.length
      ? `It reads ${refs.map((r) => `**${r}**`).join(" and ")} from the same row — square brackets mean "this row's value of that column".`
      : "It doesn't read any other column.",
  ];
  if (ops.length)
    lines.push(`It ${ops.join(", then ")} them.`);
  if (funcs.length)
    lines.push(
      `${funcs.map((f) => `\`${f}()\``).join(" and ")} ${funcs.length === 1 ? "works" : "work"} across the whole column rather than one row.`,
    );
  if (sampleValue !== undefined && sample)
    lines.push(
      "",
      `On the first row that comes out as **${sampleValue}**${
        refs.length
          ? ` (${refs
              .map((r) => {
                const col = table.columns.find((c) => c.name === r);
                return `${r} = ${col ? String(sample.cells[col.id] ?? derived[sample.id]?.[col.id] ?? "—") : "—"}`;
              })
              .join(", ")})`
          : ""
      }.`,
    );

  return { text: lines.join("\n") };
}

/** "Chart this" — a chart block bound to the table, not a picture of it. */
export function buildChart(table: TableBlock | undefined): Built {
  if (!table) return { text: "There's no table here to chart." };

  const numeric = table.columns.filter(
    (c) => c.type === "number" || c.type === "currency" || c.type === "formula",
  );
  if (!numeric.length)
    return {
      text: `“${table.title ?? "The table"}” has no numeric column, so there's nothing to plot. Set a column's type to Number first.`,
    };

  const label = table.columns.find((c) => c.type === "text") ?? table.columns[0];
  // More than a handful of rows reads better as a line; a few as bars.
  const kind = table.rows.length > 8 ? ("line" as const) : ("bar" as const);

  return {
    text: `Charting **${numeric.map((c) => c.name).join(", ")}** against **${label.name}** as a ${kind} chart.\n\nIt binds to the table by id rather than copying the numbers, so editing a cell moves the chart.`,
    change: {
      kind: "insert-block",
      afterBlockId: table.id,
      block: {
        id: uid(),
        type: "chart",
        title: `${table.title ?? "Table"} — chart`,
        sourceId: table.id,
        kind,
        xColumnId: label.id,
        yColumnIds: numeric.slice(0, 3).map((c) => c.id),
      },
      label: "Insert the chart",
    },
  };
}

/* ── Decks ──────────────────────────────────────────────── */

/**
 * "Restyle to our brand." There is no brand file, and inventing one would be
 * exactly the kind of confident fiction this app is trying not to ship — so the
 * style is derived from what the workspace actually is, and the answer says so.
 */
export function buildRestyle(req: AIRequest, deck: SlidesBlock | undefined): Built {
  if (!deck) return { text: "There's no deck in this project to restyle." };

  const p = req.prompt.toLowerCase();
  const current = deck.style ?? DEFAULT_DECK_STYLE;

  // Stems, not whole words: people write "quieter" and "bolder" far more often
  // than "quiet" and "bold".
  const asked: Partial<DeckStyle> = {};
  if (/\b(quiet|calm|understated|subtle|serious|formal|soft)/.test(p))
    Object.assign(asked, { theme: "slate", background: "flat", rule: false });
  else if (/\b(loud|bold|punch|striking|energetic|strong)/.test(p))
    Object.assign(asked, { theme: "signal", background: "glow", scale: 1.1 });
  else if (/\b(paper|print|editorial|magazine|serif|classic)/.test(p))
    Object.assign(asked, { theme: "editorial", background: "grain" });
  else if (/\b(light|white|bright)/.test(p))
    Object.assign(asked, { theme: "paper", background: "flat" });

  const style: DeckStyle = {
    ...current,
    ...asked,
    // A footer with the team's name is the one piece of "brand" that's
    // actually true — it comes from the workspace, not from a guess.
    footer: req.context.team?.workspaceName ?? current.footer,
    numbers: true,
  };

  const named = Object.keys(asked).length;
  return {
    text: named
      ? `Switching the deck to the **${style.theme}** theme with slide numbers and “${style.footer}” in the footer.\n\nOne thing to be straight about: there's no brand file in this workspace, so I'm reading "brand" from the words you used and from the workspace name. If you have real colours and a logo, set them in the deck's style panel and I'll match them next time.`
      : `There's no brand file in this workspace, so I can't restyle *to* anything specific without guessing — and a made-up palette is worse than none.\n\nWhat I can do is tidy what's there: slide numbers on, “${style.footer}” in the footer, everything else left as you set it. Tell me the feeling you're after ("quieter", "bolder", "editorial") and I'll pick a theme to match.`,
    change: {
      kind: "set-deck-style",
      blockId: deck.id,
      style,
      label: named ? `Apply the ${style.theme} theme` : "Apply the tidy-up",
    },
  };
}

/** "Balance this layout" — the same `balance` the slide editor's button calls. */
export function buildBalance(req: AIRequest, deck: SlidesBlock | undefined): Built {
  if (!deck) return { text: "There's no deck in this project." };

  const withObjects = deck.slides.filter((s) => (s.objects?.length ?? 0) > 1);
  if (!withObjects.length)
    return {
      text: `No slide in “${deck.title ?? "this deck"}” has more than one free-form object, so there's no layout to balance yet. Structured slides (title and bullets) are already laid out by the theme.`,
    };

  const slides: Slide[] = deck.slides.map((slide) => {
    const objects = slide.objects ?? [];
    if (objects.length < 2) return slide;
    // Percent space, so the container is 100×100 and the margin is a percentage
    // — the same units the slide stage stores.
    const laid = balance(objects, { width: 100, height: 100 }, 8);
    return {
      ...slide,
      objects: objects.map(
        (o, n): SlideObject => ({
          ...o,
          x: Math.round(laid[n].x * 10) / 10,
          y: Math.round(laid[n].y * 10) / 10,
        }),
      ),
    };
  });

  const count = withObjects.length;
  return {
    text: `Laying the objects on **${count} slide${count === 1 ? "" : "s"}** onto an even grid, keeping each one's size and reading order.\n\nIt's deterministic — running it again on an already-balanced slide changes nothing, so you can't nudge it into a jitter.`,
    change: {
      kind: "set-slides",
      blockId: deck.id,
      slides,
      label: `Balance ${count} slide${count === 1 ? "" : "s"}`,
    },
  };
}

/** "Shorten to 8 slides" — by merging the weakest, not by truncating. */
export function buildShorten(req: AIRequest, deck: SlidesBlock | undefined): Built {
  if (!deck) return { text: "There's no deck in this project." };

  const target = Number(/\b(\d{1,2})\b/.exec(req.prompt)?.[1] ?? 0) || 8;
  const total = deck.slides.length;
  if (total <= target)
    return {
      text: `“${deck.title ?? "This deck"}” is already ${total} slide${total === 1 ? "" : "s"} — at or under ${target}. Nothing to cut.`,
    };

  // Score by how much a slide carries. Dropping the emptiest is a defensible
  // rule; dropping the last N is just truncation wearing a suggestion's hat.
  const scored = deck.slides.map((s, i) => ({
    slide: s,
    i,
    weight:
      s.title.length +
      s.bullets.join(" ").length +
      (s.objects?.length ?? 0) * 40 +
      // The opening and the close earn their place regardless.
      (i === 0 || i === deck.slides.length - 1 ? 10_000 : 0),
  }));
  const keep = new Set(
    [...scored]
      .sort((a, b) => b.weight - a.weight)
      .slice(0, target)
      .map((s) => s.i),
  );

  const dropped = scored.filter((s) => !keep.has(s.i));
  const slides = deck.slides.filter((_, i) => keep.has(i));

  return {
    text: `Cutting **${total} → ${target}** by dropping the ${dropped.length} thinnest slide${dropped.length === 1 ? "" : "s"}: ${dropped
      .map((d) => `“${d.slide.title || `slide ${d.i + 1}`}”`)
      .join(", ")}.\n\nThe first and last slides are kept whatever they weigh — an opening and a close are structural, not content. Nothing is merged, so if one of these carries a point you need, reject this and cut by hand.`,
    change: {
      kind: "set-slides",
      blockId: deck.id,
      slides,
      label: `Cut to ${target} slides`,
    },
  };
}

/* ── Boards ─────────────────────────────────────────────── */

const PLAN_COLUMNS: Array<{ title: string; tone: BoardTone }> = [
  { title: "Now", tone: "accent" },
  { title: "Next", tone: "neutral" },
  { title: "Later", tone: "neutral" },
];

const COL_W = 300;
const COL_GAP = 30;
const CARD_W = 220;
const CARD_H = 130;

/** Board items the user picked, or every sticky if they picked nothing. */
function subjects(req: AIRequest): BoardItem[] {
  const board = req.context.board;
  if (!board) return [];
  const picked = board.items.filter((i) => board.selection.includes(i.id));
  const pool = picked.length ? picked : board.items;
  return pool.filter((i) => i.kind === "sticky" || i.kind === "text");
}

/**
 * "Turn these stickies into a plan": three frames, and the notes dealt into
 * them. Which note goes where is the one judgement call, and the stub makes it
 * from the words on the note rather than pretending to understand the work.
 */
export function buildPlan(req: AIRequest): Built {
  const notes = subjects(req);
  if (notes.length < 2)
    return {
      text: "Select at least two notes on the board and I'll sort them into Now / Next / Later.",
    };

  const urgent = /\b(now|today|urgent|asap|blocked|deadline|this week|first)\b/i;
  const later = /\b(later|someday|maybe|eventually|nice to have|park|if )\b/i;

  const bucket = (item: BoardItem) => {
    const text = "text" in item ? item.text : "";
    if (urgent.test(text)) return 0;
    if (later.test(text)) return 2;
    return 1;
  };

  // Place the plan clear of everything already on the board.
  const all = req.context.board?.items.filter((i) => i.kind !== "connector") ?? [];
  const originX = all.length
    ? Math.max(...all.map((i) => i.x + i.width)) + 160
    : 0;
  const originY = all.length ? Math.min(...all.map((i) => i.y)) : 0;

  const buckets: BoardItem[][] = [[], [], []];
  for (const note of notes) buckets[bucket(note)].push(note);

  const add: BoardItem[] = [];
  const patch: Record<string, Partial<BoardItem>> = {};
  const tallest = Math.max(...buckets.map((b) => b.length), 1);

  PLAN_COLUMNS.forEach((col, c) => {
    const x = originX + c * (COL_W + COL_GAP);
    add.push({
      id: uid(),
      kind: "frame",
      x,
      y: originY,
      width: COL_W,
      height: Math.max(320, 70 + tallest * (CARD_H + 20) + 20),
      z: -1000 - c,
      title: col.title,
      tone: col.tone,
    });
    buckets[c].forEach((note, r) => {
      patch[note.id] = {
        x: x + (COL_W - CARD_W) / 2,
        y: originY + 70 + r * (CARD_H + 20),
        width: CARD_W,
        height: CARD_H,
      };
    });
  });

  const counts = PLAN_COLUMNS.map(
    (c, i) => `${buckets[i].length} in ${c.title}`,
  ).join(", ");

  return {
    text: `Sorting **${notes.length} notes** into Now / Next / Later: ${counts}.\n\nI read the notes for words like "urgent", "blocked" and "later" — that's genuinely all I'm going on, so treat the split as a starting arrangement rather than a judgement. Everything stays draggable; the frames carry their contents if you move a column.`,
    change: {
      kind: "board-ops",
      add,
      patch,
      label: `Arrange ${notes.length} notes into a plan`,
    },
  };
}

/** "Connect these into a flow": one chain, in reading order. */
export function buildFlow(req: AIRequest): Built {
  const board = req.context.board;
  if (!board) return { text: "This isn't a board." };

  const picked = board.items.filter(
    (i) => board.selection.includes(i.id) && i.kind !== "connector",
  );
  const chain = (picked.length >= 2 ? picked : subjects(req)).sort(
    // Reading order: top to bottom, left to right within a band. The band is a
    // third of a card, so a row of notes at slightly different heights still
    // reads as a row.
    (a, b) => Math.floor(a.y / 60) - Math.floor(b.y / 60) || a.x - b.x,
  );

  if (chain.length < 2)
    return {
      text: "Select two or more items on the board and I'll connect them in order.",
    };

  const existing = new Set(
    board.items
      .filter((i) => i.kind === "connector")
      .map((c) => (c.kind === "connector" ? `${c.fromId}→${c.toId}` : "")),
  );

  const add: BoardItem[] = [];
  for (let i = 0; i < chain.length - 1; i++) {
    const key = `${chain[i].id}→${chain[i + 1].id}`;
    if (existing.has(key)) continue;
    add.push({
      id: uid(),
      kind: "connector",
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      z: -500,
      fromId: chain[i].id,
      toId: chain[i + 1].id,
      arrow: "end",
      route: "elbow",
      tone: "neutral",
    });
  }

  if (!add.length)
    return {
      text: "Those items are already connected in that order — nothing to add.",
    };

  const names = chain
    .map((i) =>
      "text" in i
        ? i.text.split("\n")[0].slice(0, 24) || "untitled"
        : i.kind === "frame"
          ? i.title
          : i.kind,
    )
    .join(" → ");

  return {
    text: `Connecting **${chain.length} items** in reading order, top to bottom:\n\n${names}\n\nThe connectors store the items' ids, not their positions, so moving anything re-routes the arrows instead of breaking them.`,
    change: {
      kind: "board-ops",
      add,
      patch: {},
      label: `Add ${add.length} connector${add.length === 1 ? "" : "s"}`,
    },
  };
}
