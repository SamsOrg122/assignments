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

No login, no setup. The workspace starts empty and persists to `localStorage`
from the first edit (⌘K → "Load the sample workspace" fills it with examples;
`/library?demo=1` does the same in memory, leaving storage untouched).

## Structure

```
src/
  app/
    (marketing)/          / — the public landing page, no app shell
    (app)/                /library · /p/[id] · /chat/[id] · /kit · /team · /settings
    api/collab/[room]/    the live-session relay — SSE down, POST up
    v/                    a shared project — a reader, or a live editing session
  components/
    landing/              hero, product, impact, pricing, estimator, footer
    shell/                sidebar, top bar, ⌘K command palette
    editors/              one per project kind + typography, deck style, dictation
    chat/                 message list, composer, threads, team assistant
    board/                board items, live project cards, promote dialog
    canvas/               block canvas, block chrome, / menu
    blocks/               text · table · chart · slides · code · image
    slides/               the deck: stage, tools, layouts — shared everywhere
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
    share.ts              share links — the document, gzipped, in the fragment
    persistence/          storage health, backup files, and version migrations
    collab/               live sessions: relay transport, cursors, block sync
    kit/                  your own fonts, pictures and saved pieces
    sanitize.ts           allowlist HTML cleaning for anything arriving by link
    images.ts             one pick/drop/paste path, downscaled before storage
    ai/                   askAI seam, local + OpenRouter providers, analyses
    ai/openrouter/        models, tools, prompt — the document as function calls
    db/                   Supabase adapter, with a local store behind the same API
    db/sync.ts            carrying work between browsers, and the rules it obeys
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

**Sharing is two links, and the difference is what the app opens.** *Can view*
gives a reader; *can help* gives the real editor in a live session — both
pointers on screen, changes flowing both ways. The document travels inside the
link's fragment, which browsers never send to a server, so nothing is uploaded
and a "view" link is a statement of intent rather than a lock: the recipient
holds every word either way, and the panel says so rather than drawing a
padlock it hasn't earned. Anything arriving by link is treated as hostile —
`lib/sanitize` rebuilds the markup from an allowlist and `decodeShare` rebuilds
the project field by field, because rendering a stranger's HTML on our origin
next to the recipient's localStorage is a stored-XSS hole.

**Shipping an update must not delete anybody's work.** There are two one-line
ways to do exactly that, and `lib/persistence/versioned.ts` closes both:
renaming a storage key orphans every workspace, and adding `version: 1` to a
`persist` config without a `migrate` makes zustand *discard* the stored payload
outright. So keys never change again — the `:v1` in them is just a name — and
versioning happens inside the payload. A version is the length of its
migration list, which makes it impossible to bump one and forget the step.
Three rules, all of them "keep the data": a payload from a *newer* version than
the running build is kept as-is, because rolling a deployment back must not
cost a day's work; a migration that throws stops where it broke instead of
losing the document; and a payload that isn't even valid JSON is copied to a
rescue key and treated as absent, so the app opens empty *with the bytes still
recoverable* rather than failing to start. Settings offers anything rescued
back as a file.

Browser storage still belongs to one exact web address, and nothing in a page
can read across that line. So a preview build or a new domain opens its own
empty workspace — the Library says so where someone would otherwise conclude
their work is gone, and points at the backup file, which is the one thing that
does cross.

**A live session reaches other people, and proves it before it says so.**
`/api/collab/[room]` is the relay: server-sent events down, a POST up, nothing
stored and nothing read. `lib/collab` picks the furthest-reaching transport
available — the relay, else `BroadcastChannel` (same browser only), else
Supabase Realtime when its environment variables and client library are both
present. Nothing claims a reach it hasn't demonstrated: the relay sends a probe
through the server and waits for it to come back, and if it doesn't, the
session downgrades and says exactly that on screen. A session that silently
can't reach the person you shared with is worse than one that admits it.

The relay's rooms live in one process's memory. A single long-running
server — `next start`, a container, a VPS — puts everyone in the same process
and it works. A platform that spreads requests across instances will put two
people in two processes that cannot see each other; that case reports itself
rather than looking like a session where nobody talks, and the fix is the
Supabase transport. Rooms are opened only for projects you actually shared,
because a browser allows about six connections per origin and a room per open
tab would eventually stop the app loading anything at all.

Sync is per-block last-writer-wins with a version stamp, not a CRDT: two people
in different sections never touch, two people in the same paragraph will
overwrite each other, and the block you have the caret in is never replaced
underneath you — a remote version waits for you to click away. That limitation
is named in `collab/types.ts` rather than discovered.

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

**The table is a real grid.** One editor mounted over the active cell instead
of ten thousand inputs — which is what buys virtualised rows (a 1,200-row
sheet keeps ~27 in the DOM), rectangle selection, spreadsheet keyboarding
(type-to-edit, Tab/Enter, ⌘C/⌘D/⌘A, paste that grows the table), typed columns
(currency, percent, date, checkbox, select), comparisons + IF + LOOKUP in the
formula grammar, multi-key sort, filters, colour rules and a frozen first
column. The strip above the grid is a row count until a cell is selected —
then it's the formula bar. No ribbon.

**The kit is your own things, usable everywhere.** Fonts you brought, pictures
you keep reaching for, and *pieces* — any block or slide saved and droppable
into any other project. Not called a Library: that word already means the list
of your projects, and two of them would make every sentence ambiguous.

Two decisions shape it. Using a piece **copies** it, deeply, with fresh ids —
a live reference is right for a chart reading a table in the same project and
wrong across projects, where what you want is a starting point, and where
deleting from the shelf must never gut an essay you handed in. And the heavy
parts live in **IndexedDB**, not localStorage: a single woff2 is 30–200 KB
against a 5–10 MB quota shared with every document, so two typefaces would push
somebody's thesis out of the browser. Only the description of each asset stays
in the ordinary store — and the backup file carries the bytes too, because a
backup that restored the *names* of your fonts would be the worst kind of
half-working.

Fonts are handed back to the browser on every load. `FontFace` registrations
don't survive a reload, so without that a document set in a face you imported
would quietly fall back after every refresh — which reads as the font having
been lost rather than merely not loaded yet.

**A block inside a document is the same program as the editor for it.** A
slides block used to be a second, much thinner implementation — no theme, no
layouts, no free-form layer, no pictures — and the only thing making it thinner
was that it had been written twice. `components/slides` now holds one deck: one
hook that owns the operations, one stage that draws and edits a slide, one row
of tools. The presenting editor adds a filmstrip, a `.pptx` import and Present
around it; the in-document block adds nothing and loses nothing.

**Slides carry a free-form layer.** Text, shapes and lines in percent
coordinates over the structured content, with snap guides, arrow-key nudge and
an inspector that exists only while something is selected. Fills are theme
roles rather than hex, so restyling the deck re-inks every shape — one-click
restyle stays safe by construction. Alignment, distribution and "balance this
slide" are pure functions in `lib/geometry.ts`, shared with the board.

**⌘F and ⌘K reach inside the work.** Find & replace walks text nodes through a
real parser (searching "div" can never rewrite a tag), takes a timeline
snapshot before any bulk rewrite, and keeps regex behind one disclosure. The
palette's search now also scans content — prose, table cells, slide text, code
— and shows the matching passage as evidence, jumping straight to the block.

**Right-click anything.** One context-menu implementation serves the Library,
the sidebar, the board, the block canvas and channels, so the same gesture
behaves identically everywhere and a new surface gets keyboard navigation,
edge-flipping and submenus for free. A project offers the same actions
wherever you meet it, because both surfaces build their menu from one
`projectMenu()`. Inside a text selection the browser's own menu wins — cut,
copy and look-up are the right actions there, and ours would replace them with
worse ones.

**Closed groups, described honestly.** A channel can be closed with a
passcode, stored as a SHA-256 digest so the code itself never lands in
storage. The UI then says exactly what that buys: *a passcode keeps this group
out of the way, not out of reach* — messages aren't encrypted, the check
happens in the browser, and anyone who can read the workspace data can read
the channel. Real access control belongs on the server behind the same
`ChatProvider` seam as everything else. A lock icon that implied more than
this would be worse than no lock at all.

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
the document directly.

Two providers sit behind that seam. `lib/ai/mock.ts` does no inference but
operates on your real content (least-squares forecasts, extractive summaries),
and it is what runs when no key is set — a working local assistant, not a
placeholder. `lib/ai/openrouter/` is the real one: the browser posts to
`/api/ai`, the route holds the key and streams back NDJSON frames, and the
document is exposed to the model as **tools** rather than as text to overwrite.
Every tool call is validated against the context the request carried before it
becomes a change, so a hallucinated block or row id is dropped rather than
previewed as if it were real. Models are configured as a *list*: a request
walks it until one answers, and a model that fails is demoted for a minute.

The app asks the server once, on load, whether a key is configured — a
server-only variable is invisible to the browser, and guessing would let
Settings claim a model it doesn't have.

**Sync is deliberately not a CRDT.** One project is one document and the newer
`updatedAt` wins — the laptop-then-phone case, not two people in the same
paragraph, which is what a *live session* is for and a different mechanism
entirely. What matters is the failure modes, and `db/sync.ts` is written around
three of them: a pull never deletes a project it has not seen before, a failed
pull cancels the push, and a deletion is a tombstone rather than an absence.
That last one is the important one — a row can go missing because a session
changed or a policy stopped matching, and treating "missing" as "deleted" would
take the local copy with it.

**Realtime is a seam too.** `RealtimeProvider` is modelled on a CRDT awareness
map, so a Yjs provider forwarding `awareness.getStates()` drops in behind
`setRealtimeProvider()` without touching a component. The shipped provider
simulates peers.

## Deploying

The repository's default branch is what production builds from; `vercel.json`
pins the framework and nothing else, because there is nothing else to pin.

```bash
npm run build && npm start   # exactly what production runs
```

Every environment variable is optional. With none of them set the app is
complete and honest: work lives in the browser, the AI is a local stub that
says so, checkout walks the whole flow and answers 501 rather than charging,
and view links carry their document inside the URL. Setting a group switches
that group on and changes nothing else.

### Environment

| Variable | Where | What it switches on |
|---|---|---|
| `OPENROUTER_API_KEY` | server | The real assistant. Without it, the local stub. |
| `OPENROUTER_MODELS` | server | Rotation order. Optional — there's a default list. |
| `OPENROUTER_APP_URL` | server | Attribution in OpenRouter's dashboard. Optional. |
| `NEXT_PUBLIC_SUPABASE_URL` | browser | Accounts, sync, and hosted live sessions. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser | Same pair — both or neither. |
| `SUPABASE_SERVICE_ROLE_KEY` | server | Only for jobs that must bypass RLS. Not needed to launch. |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | browser | Checkout. |
| `STRIPE_SECRET_KEY` | server | Checkout. |
| `STRIPE_WEBHOOK_SECRET` | server | Subscription webhooks. |

`NEXT_PUBLIC_` variables are compiled into the browser bundle and are public by
definition; everything else stays on the server. `OPENROUTER_API_KEY` is the
one people get wrong: the browser posts to `/api/ai` and the key never leaves
the server, so there is deliberately no public variant of it.

Supabase needs two one-time steps before the variables do anything: run
`supabase/schema.sql` against the project, and turn on anonymous sign-ins —
that is what lets the free plan keep work without a login.

Live sessions need one thing from the host: **a single long-running process.**
`next start`, a container or a VPS is enough, and needs no configuration at
all. On a platform that autoscales across instances — Vercel included — set the
two Supabase variables: the built-in relay keeps its rooms in memory, so two
people served by different instances would never meet. With Supabase
configured the session runs over Realtime instead, and without it the app says
so rather than pretending.

Two things to do before a real launch, both flagged in the code:

- **Bring the storefront visuals in-house.** `next.config.ts` still allows a
  CloudFront host for the three generated images. Download them into
  `public/visuals/`, point the slots at local paths, and delete the
  `remotePatterns` block — a landing page shouldn't depend on someone else's
  CDN.
- **Confirm the impact figures.** Anything still marked `"placeholder"` in
  `lib/impact/config.ts` renders with a visible *provisional* marker. Flip a
  `status` to `"confirmed"` once it is true and the markers disappear on their
  own.

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
| shift-drag | marquee-select on a board, or on a slide |
| Share | two links per project: *can view*, or *can help* — live, with cursors |
| Kit | fonts, pictures and saved pieces — insert with `/` or ⌘K |
| `⌘D` | duplicate the selected slide objects |

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind v4 · zustand · Tiptap ·
CodeMirror 6 · Recharts · dnd-kit
