# Assignments

Everything, in one. Projects made of blocks — prose, tables, charts, slides and
code on a single canvas, with realtime collaboration.

```bash
npm install
npm run dev     # http://localhost:3000
```

No login, no setup. The workspace seeds two sample projects on first run and
persists to `localStorage` from then on (⌘K → "Reset workspace" restores them).

## Structure

```
src/
  app/                    routes — / (projects) and /p/[projectId] (canvas)
  components/
    shell/                sidebar, top bar, ⌘K command palette
    canvas/               block canvas, block chrome, / menu
    blocks/               text · table · chart · slides · code
    ai/                   inline AI popover (streaming, accept/reject)
    presence/             peer cursors, avatars
    ui/                   icons, toast
  lib/
    types.ts              domain model
    store.ts              zustand + localStorage — the one copy of the data
    formula.ts            hand-written spreadsheet expression parser
    fuzzy.ts              ranking for ⌘K and the / menu
    ai/                   askAI seam + stub provider
    realtime/             RealtimeProvider seam + simulated presence
```

## The parts worth knowing about

**One copy of the data.** A chart doesn't hold a snapshot of a table — it holds
the table's id and reads through the store. Editing a cell repaints every
dependent view on the same commit, so there is no sync code to get wrong.

**Formulas are parsed, not `eval`'d.** `lib/formula.ts` is a recursive-descent
parser over a fixed grammar (`[Column]` refs, arithmetic, `SUM`/`AVG`/`MIN`/
`MAX`/`COUNT`/`ROUND`/`ABS`/`IF`). User-authored expressions can't reach the
host page; the worst case is `#ERR`.

**AI is a seam, not a feature.** Everything the UI knows is
`askAI(prompt, context)` returning a stream of chunks, plus an optional
structured `AIChange` the user accepts or rejects — the model never writes to
the document directly. `lib/ai/mock.ts` does no inference but operates on your
real content (least-squares forecasts, extractive summaries), so the
interaction is the shape it will be with a model behind it. Swap it with
`setAIProvider()`.

**Realtime is a seam too.** `RealtimeProvider` is modelled on a CRDT awareness
map, so a Yjs provider forwarding `awareness.getStates()` drops in behind
`setRealtimeProvider()` without touching a component. The shipped provider
simulates peers.

## Keys

| | |
|---|---|
| `⌘K` | command palette — actions, blocks, projects, settings |
| `⌘J` | ask AI about the selection (whole project as context) |
| `⌘B` | toggle sidebar |
| `/` | insert a block, from inside any text block |

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind v4 · zustand · Tiptap ·
CodeMirror 6 · Recharts · dnd-kit
