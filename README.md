# Assignments

`/` is the public landing page. The app lives at `/library`.

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
  app/
    (marketing)/          / — the public landing page, no app shell
    (app)/                /library · /p/[id] · /chat/[id] · /team · /settings
  components/
    landing/              hero, product, impact, pricing, estimator, footer
    shell/                sidebar, top bar, ⌘K command palette
    editors/              one per project kind + typography, deck style, dictation
    chat/                 message list, composer, threads, team assistant
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
    appearance.ts         theme tokens + the pre-paint boot script
    theme-store.ts        appearance store, synced to <html data-*>
    impact/               ← every price, share and euro→tree rate lives here
    visuals/              landing-page asset slots + the generateVisual seam
    team/                 workspace, members, roles, permissions, memory
    files/                ingestFile seam — text extraction for AI context
    deck-themes.ts        five deck looks, each as --slide-* properties
    pptx.ts               PowerPoint import (unzip + read the slide XML)
    chat/                 ChatProvider seam + simulated transport
    sources/              resolveSource seam, parsers, four citation styles
    export.ts             PDF · Word · web · Markdown, from the model
    ai/                   askAI seam, stub provider, document + team analyses
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

**Citations that maintain themselves.** Paste a link, DOI, arXiv id, BibTeX
record or a reference copied out of a paper; `lib/sources` parses what it can
and *flags what it guessed* rather than presenting inference as fact. Markers
in the prose are Tiptap nodes holding a source id, so switching APA → MLA
rewrites every marker and every reference in one move, and the bibliography —
which stores nothing of its own — can never drift from the source list.

**Chat is in the workspace, not beside it.** A message can carry a live
reference to a Library project: the card reads through the store, so it
reflects the project rather than being a dead link to another tool. `#` in the
composer attaches one, and ⌘K can share the project you're in without leaving
the keyboard. Channels, DMs, threads, reactions, typing indicators and unread
counts all sit behind a websocket-shaped `ChatProvider`.

**The demo under the hero is the app, not a picture of it.** It frames the real
`/library` route, same origin and same bundle, so it is 1:1 by construction and
you can click into it — open a project, type, press ⌘K. A hand-drawn
approximation drifts the moment the product moves and can never be clicked. It
mounts lazily, ~300px before it scrolls into view, so the storefront itself
still loads without the editor.

**The landing page argues with numbers, not adjectives.** `/` is a route group
of its own — no sidebar, no palette, no stores until the demo mounts. Every
price, share and euro→tree rate on it
resolves from `lib/impact/config.ts`; there is no arithmetic in a component
that isn't layout. The estimator is pure front-end maths against that config
and swaps for real billing behind `estimate()`.

**Nothing unverified is presented as verified.** Each figure in the config
carries a `status`, and anything still `"placeholder"` renders with a visible
*provisional* marker plus a panel headed "What we can't tell you yet" — no
partner appointed, per-tree cost an estimate, nobody has audited us. The
"funded so far" counter reads a `getImpactLedger()` seam that ships reporting
*nothing*, because on day one nothing has been funded and a counter spinning up
to an invented number is the exact move that makes people stop believing
environmental claims. The page states the 95% we keep as plainly as the 5% we
give. Flip a `status` to `"confirmed"` in one file and the markers disappear on
their own.

**The pricing model has an invariant, and it's written down.** A plan's
included AI allowance must be worth less at the metered rate than the plan
costs — otherwise a seat is a cheaper way to buy credits than credits are, and
a Team customer lowers their bill by adding seats they don't need. It's a
comment in `config.ts` and an assertion in the smoke suite because the first
draft of these numbers had exactly that bug.

**Visuals are slots, not hard-coded art.** `lib/visuals/slots.ts` declares each
image position with the prompt it was generated from; `generateVisual()` is the
Higgsfield seam, deliberately design-time rather than a live call on someone's
first page view. Ambient slots paint as backgrounds with the hand-built graphic
*underneath*, so an unreachable asset degrades to crafted vector instead of a
broken-image box. Half the page is meant to be hand-made — that mix is the
brand argument: AI where it shines, design everywhere.

**Files go into conversations, not just into a settings page.** Attach, drop or
paste a file in any channel, DM or the assistant thread. Extraction runs
through the same `ingestFile` seam the Team page uses, and the *extracted text*
travels with the message rather than a blob — so a file shared in a channel is
answerable from immediately, with no separate "index this" step, and a
server-side extractor upgrades every surface at once. A file attached to a
question also steers the answer to it: ask "summarise this" with a document
attached and it answers from the document, not from an empty page. Those files
join the context for that turn only — sharing a file in a chat isn't the same
act as putting it in the workspace's permanent memory.

**A document is a setting, not a pile of controls.** Six presets — Thesis,
Book, Report, Manuscript, Notes, Draft — each a *complete* setting shown as a
real specimen drawn in its own face, measure and leading. The combinations are
the point: justified text turns hyphenation on with it, because justification
without it opens rivers; choosing indented paragraphs clears the paragraph gap,
because doing both reads as a mistake. Paper (app, white, warm, night) re-points
the colour tokens on the writing surface alone, so a white sheet stays a sheet
and the chrome around it keeps the app's colours. Everything else is folded
behind "Fine-tune" for the person who wants the last five per cent.

**A deck is a look, not a formatting surface.** Five themes, plus an accent
override from a fixed set, four surface treatments drawn from the theme's own
ink, and a transition. No free colour picker: the whole value of a theme is
that its ground and its ink were chosen together, and an arbitrary accent is
the one value that can undo that.

**A team is a record, not a member list.** `/team` holds who is here, what they
may do, what the group knows and what it has read — and those last two are
exactly what the assistant is handed, so the page doubles as *what the AI knows
about us*. Roles are ordered (owner → admin → editor → commenter → viewer) and
every capability check goes through one `can(role, action)`; the store refuses
any change that would leave the workspace with no owner, so the last owner
simply has no demote control. Invites carry the role they'll join with and
produce a real link.

**The assistant learns, but nothing it infers becomes truth on its own.** Ask it
in `#Team assistant` and it answers over the workspace record: who your
supervisor is, what the department requires, what's in the brief someone
uploaded — quoting the file so the answer is checkable. When an exchange
produces something worth keeping it offers to remember it, and the entry lands
**unconfirmed**, shown as such on the Team page until a person confirms it.
Shared memory earns a higher bar than one person's phrasing.

**Files become context, not attachments.** `ingestFile()` extracts text in the
browser — Markdown, text, CSV, JSON, `.docx` and `.pptx` (both are ZIPs of XML)
— stores the words rather than the original, and says plainly when it can't
read something (PDFs need a server-side extractor). Any file can be excluded
from context without deleting it.

**Decks: pick a look, don't assemble one.** Five themes, each fully set —
surface, ink, accent, type pairing — resolving to `--slide-*` custom properties
that the slide renderer reads, so the same markup renders as Ink, Paper or
Signal without a branch and adding a theme is a data change. The controls
underneath (type scale, title position, accent rule, slide numbers, footer)
only adjust things that can't make it ugly. Layout is inferred from each
slide's own shape, and "Automatic" tells you which layout it's currently
implying before you override it.

**PowerPoint import is honest about what it drops.** A `.pptx` is unzipped, its
slides read in numeric order (so slide10 sorts after slide2), titles told from
bullets by the placeholder tag rather than by position, and speaker notes
pulled from the parallel notes part. It does *not* reproduce the original
theme, images, positioning or animations — those are bound to PowerPoint's
layout model, and a half-copy would look broken. The import names what it left
behind and the slides adopt your deck's theme.

**Appearance is CSS custom properties, end to end.** Theme (dark/light/system),
accent, corner radius, density, interface typeface, motion and sidebar width
all resolve to attributes on `<html>` that override tokens the utilities
already reference — so a preference change repaints everything without a
component re-render. A small inline script applies stored preferences before
first paint; `next/script` can't do this job, because `beforeInteractive`
defers execution until after hydration bootstraps.

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
| `@` / `#` | in chat: mention someone / attach a live project |
| `/` | insert a block, from inside any text block |
| `⌘⇧C` | cite a source at the caret (paste a link to add and cite in one) |
| `P` | promote the board selection into a Library project |
| `⌘0` | fit the board to its content |
| shift-drag | marquee-select on a board |

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind v4 · zustand · Tiptap ·
CodeMirror 6 · Recharts · dnd-kit
