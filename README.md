# Assignments

Everything, in one. Two layers with a clear line between them:

- **Library** — sorted, findable, finished work. Every project has a real type
  (Thesis/Doc, Deck, Notes, Code, Design, Board) and opens in its own editor.
- **Board** — an infinite canvas where structure falls away: a paragraph beside
  a sticky beside a live card for a real project. This is where you think.
- **The bridge** — promote a board cluster into a Library project, or drop a
  Library project onto a board as a card that mirrors it live.

```bash
npm install
npm run dev     # http://localhost:3000
```

No login, no setup. The workspace seeds five sample projects on first run and
persists to `localStorage` from then on (⌘K → "Reset workspace" restores them).

## Structure

```
src/
  app/                    routes — / (Library) and /p/[projectId]
  components/
    shell/                sidebar, top bar, ⌘K command palette
    editors/              one per project kind + typography & dictation
    board/                board items, live project cards, promote dialog
    canvas/               block canvas, block chrome, / menu
    blocks/               text · table · chart · slides · code
    ai/                   inline AI popover (streaming, accept/reject)
    presence/             peer cursors, avatars
    ui/                   icons, toast
  lib/
    types.ts              domain model
    kinds.ts              one table describing every project type
    store.ts              zustand + localStorage — the one copy of the data
    formula.ts            hand-written spreadsheet expression parser
    fuzzy.ts              ranking for ⌘K and the / menu
    summary.ts            word counts, outlines, one-line descriptions
    ai/                   askAI seam, stub provider, document analyses
    speech/               transcribe seam — Web Speech + simulated fallback
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

**The Board is a custom transform layer**, not react-konva or tldraw. Board
items are live React components — an editable paragraph, a sticky, a project
card rendering a real preview. Canvas rasterisation would cost DOM text
editing, selection and accessibility; tldraw would bring a second document
model to fight ours. One `translate/scale` on a container buys all of it for
about a hundred lines of pointer maths.

**Speak-to-prose, not dictation.** `lib/speech` captures (real Web Speech where
the browser supports it, a simulated provider otherwise), and the transcript
goes through `askAI` for clean-up: hesitations and false starts removed,
spoken clauses joined into sentences, paragraphs re-broken. The panel shows
what you *said* small and grey next to what will be *written* — the difference
is the feature.

**Workspace-aware AI.** `buildContext` hands the provider every block in the
project plus a summary of the rest of the library, trimmed from the middle
outward so the opening and conclusion always survive. That's what lets
"where does my argument drift?" or "am I using 'respondent' and 'participant'
interchangeably?" be answerable at all. The analyses in `lib/ai/analysis.ts`
are real computations over your text, not canned prose.

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
| `P` | promote the board selection into a Library project |
| `⌘0` | fit the board to its content |
| shift-drag | marquee-select on a board |

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind v4 · zustand · Tiptap ·
CodeMirror 6 · Recharts · dnd-kit
