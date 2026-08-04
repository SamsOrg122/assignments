import { nanoid } from "nanoid";
import type {
  Block,
  BlockType,
  ChartBlock,
  CodeBlock,
  Column,
  Project,
  Row,
  SlidesBlock,
  TableBlock,
  TextBlock,
} from "./types";

export const uid = () => nanoid(10);

export function emptyRow(columns: Column[]): Row {
  const cells: Row["cells"] = {};
  for (const c of columns) if (c.type !== "formula") cells[c.id] = null;
  return { id: uid(), cells };
}

export function createTextBlock(html = "<p></p>"): TextBlock {
  return { id: uid(), type: "text", html };
}

export function createTableBlock(): TableBlock {
  const columns: Column[] = [
    { id: uid(), name: "Item", type: "text" },
    { id: uid(), name: "Units", type: "number" },
    { id: uid(), name: "Price", type: "number" },
    { id: uid(), name: "Total", type: "formula", formula: "[Units] * [Price]" },
  ];
  const seed: Array<[string, number, number]> = [
    ["Alpha", 12, 40],
    ["Beta", 8, 65],
    ["Gamma", 21, 24],
  ];
  const rows: Row[] = seed.map(([item, units, price]) => ({
    id: uid(),
    cells: {
      [columns[0].id]: item,
      [columns[1].id]: units,
      [columns[2].id]: price,
    },
  }));
  return { id: uid(), type: "table", title: "Table", columns, rows, sort: null };
}

export function createChartBlock(source?: TableBlock): ChartBlock {
  const numeric = source?.columns.filter(
    (c) => c.type === "number" || c.type === "formula",
  );
  return {
    id: uid(),
    type: "chart",
    title: "Chart",
    sourceId: source?.id ?? null,
    kind: "bar",
    xColumnId: source?.columns[0]?.id ?? null,
    yColumnIds: numeric?.length ? [numeric[0].id] : [],
  };
}

export function createSlidesBlock(): SlidesBlock {
  return {
    id: uid(),
    type: "slides",
    title: "Slides",
    slides: [
      {
        id: uid(),
        title: "Title slide",
        bullets: ["Click any text to edit", "Use ← → to move between slides"],
      },
      {
        id: uid(),
        title: "Second slide",
        bullets: ["Slides live in the same canvas as everything else"],
      },
    ],
  };
}

const STARTER_HTML = `<!doctype html>
<html>
  <head>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <main>
      <h1>Hello</h1>
      <p id="out">…</p>
    </main>
    <script src="main.js"></script>
  </body>
</html>`;

const STARTER_CSS = `body {
  margin: 0;
  display: grid;
  place-items: center;
  min-height: 100vh;
  background: #0a0a0a;
  color: #ededed;
  font: 15px/1.6 ui-sans-serif, system-ui, sans-serif;
}
h1 { font-size: 28px; letter-spacing: -0.02em; margin: 0 0 8px; }
p  { color: #8a8a8a; margin: 0; }`;

const STARTER_JS = `const out = document.getElementById("out");
out.textContent = "Edit any file, then press Run.";`;

export function createCodeBlock(): CodeBlock {
  const files = [
    { id: uid(), name: "index.html", language: "html" as const, content: STARTER_HTML },
    { id: uid(), name: "styles.css", language: "css" as const, content: STARTER_CSS },
    { id: uid(), name: "main.js", language: "javascript" as const, content: STARTER_JS },
  ];
  return {
    id: uid(),
    type: "code",
    title: "Code",
    files,
    activeFileId: files[0].id,
    preview: true,
  };
}

export function createBlock(type: BlockType, source?: TableBlock): Block {
  switch (type) {
    case "text":
      return createTextBlock();
    case "table":
      return createTableBlock();
    case "chart":
      return createChartBlock(source);
    case "slides":
      return createSlidesBlock();
    case "code":
      return createCodeBlock();
  }
}

const GLYPHS = ["◆", "◇", "●", "○", "▲", "■", "◈", "✦"];

export function createProject(name = "Untitled project"): Project {
  const now = Date.now();
  return {
    id: uid(),
    name,
    glyph: GLYPHS[Math.floor(Math.random() * GLYPHS.length)],
    createdAt: now,
    updatedAt: now,
    blocks: [
      createTextBlock(
        `<h1>${escapeHtml(name)}</h1><p>Press <code>/</code> for a block, or <code>⌘K</code> for anything.</p>`,
      ),
    ],
  };
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
