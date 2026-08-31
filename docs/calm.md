# The calm pass — one type scale, one spacing scale, one container rule

Status: specification. Implement directly from this. Nothing here removes a control, a link,
a fact, a route or a word. `/more` must still read true line for line when this lands; check it.

Measured against the tree at `src/`, 2026-08-31:
1,530 inline `text-[Npx]` classes across **30 distinct values**; 455 `border border-line`;
231 `font-mono`; 86 `label-mono`; 14 `uppercase`; 110 `bg-accent` fills.
`src/app/globals.css` is 1,996 lines and defines `--color-*`, `--radius-*`, `--font-*`,
`--ease-*`, `--ui-row-y/gap/bar-h`, `--sidebar-w` — and **no `--text-*` and no `--space-*`**.
That absence is why every component invents its own numbers. It is the root cause, not a symptom.

---

## 1. THE RULE

**Rank is carried by type — size, weight and ink moving together — and a box is drawn only
around something you can type into, pick up, or that floats above the page.**

Everything below follows from that sentence. Two corollaries you will need constantly:

**Size never travels alone.** Eleven sizes crammed between 9.5px and 14.5px shipped as *one*
perceptual level, because half a pixel is not a rank. Four sizes where each step is also a step
in weight and ink are four levels. Weight rides inside the type token so it cannot be forgotten;
colour stays a separate utility so it can always be overridden.

**A rule is not a border.** One line with one edge separates two different kinds of thing that
follow each other. Four lines claim a region and say "this is separate". Rules are cheap and
occasionally right. Borders are expensive and almost never right.

### Why type, and not a softer box

We measured why there are 455 borders. `--color-surface` #282a2d on `--color-canvas` #202124 is
a **1.12:1** luminance step in dark and **1.03:1** in light. A panel is invisible as tone, so
every grouping that wanted to exist had to draw a 1px line to exist at all. The lines are not the
disease; they are a splint on a hierarchy that type refused to carry.

So "tint instead of outline" is not available to us — the tint does not exist. And it means the
boxes that survive keep a real 1px line rather than a fill. Full ramp, both themes:

| pair | dark | light |
|---|---|---|
| surface on canvas | 1.12:1 | 1.03:1 |
| surface-2 on canvas | 1.24:1 | 1.08:1 |
| surface-3 on canvas | 1.54:1 | 1.20:1 |

None of them clear 3:1. **Therefore no fill may ever be the sole carrier of a state.** The
shipped light-mode pressed segment on `/due` is `bg-surface-2` at 1.08:1 — effectively invisible,
with `aria-pressed` doing all the work. That bug already exists; it is what happens when a fill
is asked to mean something on this palette.

---

## 2. The type scale

Four steps, added to the existing `@theme` block in `src/app/globals.css`, beside `--color-*` and
`--radius-*`. Tailwind 4.3.3 (verified installed) generates `text-title` / `text-object` /
`text-body` / `text-meta` from the `--text-*` namespace and honours the
`--line-height`, `--letter-spacing` and `--font-weight` modifiers, so **one class sets size,
leading, tracking and weight together.** That is the mechanism that makes "size never travels
alone" enforceable rather than a habit.

```css
@theme {
  /* ── Type ──────────────────────────────────────────────────────────────
     Four steps, and the gap between them IS the hierarchy. There used to be
     thirty inline sizes, eleven of them inside a 5px band, six of them half a
     pixel from a neighbour. No reader perceives half a pixel as rank, but
     every component still had to decide about it — which is why there was no
     scale.

     Weight is baked into the token on purpose. A 15px step next to a 13px one
     is a 15% difference, which on its own is the exact wobble we are removing;
     it only reads as a level because 15 is always 500 and 13 is always 400.
     Bake it in and it cannot be forgotten. Colour is deliberately NOT in here
     — see the note on .label-mono below.
     ──────────────────────────────────────────────────────────────────────── */

  --text-title: clamp(24px, 1.6vw + 14px, 30px);
  --text-title--line-height: 1.15;
  --text-title--letter-spacing: -0.02em;
  --text-title--font-weight: 500;

  --text-object: 15px;
  --text-object--line-height: 1.3;
  --text-object--letter-spacing: -0.01em;
  --text-object--font-weight: 500;

  --text-body: 13px;
  --text-body--line-height: 1.55;
  --text-body--font-weight: 400;

  --text-meta: 11px;
  --text-meta--line-height: 1.3;
  --text-meta--font-weight: 400;
}
```

| token | renders | weight | default colour | the ONE thing it is for |
|---|---|---|---|---|
| `text-title` | 24px → 30px | 500 | `text-fg` | The page's own name. **Exactly one per screen**, on the `<h1>`. Nothing else on the screen comes within 13px of it. The clamp is why no heading needs an `sm:` variant. |
| `text-object` | 15px | 500 | `text-fg` | The name of a thing: a library card's name, a settings section heading, a chat author, a dialog title. **Never navigation.** |
| `text-body` | 13px | 400 | `text-fg-muted`, or `text-fg` when it *is* the answer | Sentences, hints, row titles, message bodies, every control label, every nav row. |
| `text-meta` | 11px | 400 | `text-fg-subtle` | Facts attached to a thing: dates, times, counts, kinds, courses, states, group labels, chip counts. |

Ratios 2× / 1.15× / 1.18×.

### The three greys get jobs, not moods

Size says what kind of text it is. Colour says how much it is the point. They are independent,
and each gets one sentence, in a comment beside the tokens:

- `text-fg` — **the subject.** What you came to read, or what is current.
- `text-fg-muted` — **supporting prose.** Hints, descriptions, the sentence under a title, inactive nav rows.
- `text-fg-subtle` — **machine facts.** Dates, counts, kinds, times, courses, group labels.

Today those are assigned by feel, and the proof is that the ratio inverts between pages: settings
renders roughly 90 muted / 75 subtle / 65 fg, `/due` renders 40 subtle / 21 muted / 22 fg. Same
three tokens, opposite distributions, because no rule existed. **Target on a list screen is about
1 : 2 : 6 (fg : muted : subtle).**

Contrast is untouched: fg-muted 6.5:1 and fg-subtle 5.2:1 on canvas, as globals.css already
records. Nothing gets quieter. Things get sorted.

### Delete `.label-mono`

`globals.css:123` sets `font-size: 11px` **and** `color: var(--color-fg-muted)` inside
`@layer utilities`. At equal (0,1,0) specificity it beats Tailwind's own utilities on source
order, because the custom block comes after the framework's in the same layer. So
`class="label-mono text-warn"` computes `rgb(184,189,196)`, and so does `label-mono text-fg`.

`/due` passes `tone: 'late' | 'now' | 'calm'` to every one of its 11 day headings
(`src/app/(app)/due/page.tsx:440-450`). **That prop is dead code.** "overdue", "today" and
"saturday 5 september" all render the same grey. The one distinction the page exists to draw is
not being drawn.

The class is also misnamed: it sets no `font-family` at all. It has been lying to every developer
who reached for it, at 86 call sites.

So the rule is not taste, it is the bug's root cause: **a type token never carries a colour.**
Delete `.label-mono`. Codemod its 86 call sites to `text-meta text-fg-subtle`. Move the comment
above it ("uppercase mono everywhere read like generated captions rather than UI") up to sit
above the type scale, because it is the reason mono is rationed in §6 and it is right.

### What happens to the 30 retired sizes

Scope: **the app** — `src/app/(app)/**`, `src/app/signin`, `src/app/offline`, `src/app/f`,
`src/app/join`, and everything in `src/components/**` except `landing/`, `pricing/` and the
document-content classes. Carve-outs are listed in §9 and they are narrow.

| retired | becomes | note |
|---|---|---|
| 40, 34, 32, 30, 28, 26, 24, 22, 20, 19 | `text-title` where it is the page's `<h1>`; otherwise `text-object` | In the app these are `/community` (32/26/19), `/library` (26/24/19), `/kit` (22), signin (34/30) |
| 17, 16, 15.5, 15, 14.5, 14 | `text-object` | |
| 13.5, 13, 12.5, 12 | `text-body` | 12.5 and 12 go **up**, not down. They are prose and button copy; sending them to 11 would make control labels into metadata, which is the failure we are fixing |
| 11.5, 11 | `text-meta` | |
| 10.5, 10, 9.5, 9, 8.5 | `text-meta` | **Nothing in the app ships below 11px.** 9.5px as a shipping text size is the one genuine a11y liability in the current build and a scale removes it as a side effect |
| 8, 7.5, 6 | exempt — see §9 | Only inside scaled document previews |

Avatar initials are currently mono at 8.5px / 9px / 9.5px in four separate places. They go sans
`text-meta`. Where the circle is smaller than 24px, grow the circle rather than shrink the text:
`Sidebar.tsx:642` goes `size-[18px]` → `size-[22px]`, which changes nothing else because the row
is already ~30px tall.

---

## 3. The spacing scale

```css
@theme {
  /* ── Space ─────────────────────────────────────────────────────────────
     Six steps on a 4px base. `<main>` on /due alone rendered 8 distinct
     padding shorthands and 7 distinct gap values; /library used mb-7, mb-6,
     mb-5, mb-4, mb-3, gap-3, gap-2.5, gap-2 and gap-1.5. Every one of those
     was a component inventing a number because this file offered none.
     ──────────────────────────────────────────────────────────────────────── */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 16px;
  --space-4: 24px;
  --space-5: 40px;
  --space-6: 72px;
}
```

Tailwind v4 does **not** auto-generate utilities from arbitrary token names, so these are
referenced with the custom-property arbitrary-value shorthand: `gap-(--space-3)`,
`mt-(--space-5)`, `mb-(--space-6)`, `pl-(--space-4)`.

| step | where |
|---|---|
| `--space-1` 4px | inside one thing — a glyph to its label, a name to the fact under it |
| `--space-2` 8px | between peers in one list or grid — card to card, chip to chip, on top of the density row padding |
| `--space-3` 16px | a heading to the content it heads; two adjacent blocks inside one section |
| `--space-4` 24px | a group label to the first section under it |
| `--space-5` 40px | one section to the next |
| `--space-6` 72px | a new region of the page begins — under the `<h1>`, and between groups |

Two rules decide every gap you have not been told about:

1. **The gap above a heading is at least twice the gap below it.** That single ratio is what makes
   a heading belong to what follows rather than float between two blocks. You cannot mistake which
   side of a 10:1 gap something is on.
2. **A gap of `--space-5` or larger replaces a rule. Never both.** If two blocks are 40px apart
   they do not also get a hairline; if they need a hairline they were not 40px apart. This is what
   retires the 11 `border-b` day headings on `/due` and the 5 `border-b pb-2` group rules on
   `/settings` without losing any grouping.

Worked example, `/settings`, which satisfies both:

```
h1                                 → 72px (space-6)
group label (11px)                 → 24px (space-4)
section heading (15px)             →  4px (space-1)
section hint (13px)                → 16px (space-3)
section body
   ... last row                    → 40px (space-5)  next section heading
   ... last section of group       → 72px (space-6)  next group label
```

40 ≥ 2×16 ✓. 72 ≥ 2×24 ✓. And 40 ≥ `--space-5`, so the section rule goes.

**Boundary with density, so two systems do not fight.** `--ui-row-y`, `--ui-gap` and `--ui-bar-h`
already exist and are driven by the density preference (globals.css:299-307). **Density scales
rows; the space scale scales sections. They never touch.** Somebody on Compact gets tighter rows
and the *same* 72px under the page title — compact is about how much fits in a list, not about
whether the page has a top.

### Radius

Only three kinds of thing keep a border, so only three radii are reachable:
`--radius-sm` (6px) an input, `--radius-md` (8px) an object, `--radius-lg` (12px) a floating
layer. `--radius-xs` (4px) survives for the `:focus-visible` ring and for the one faint chip in
§5. Five radii render simultaneously on `/library` today; this makes that arithmetically
impossible. State the rule in tokens, never in pixels — `data-radius="sharp"` and `"soft"`
rescale all four, and a pixel literal would not follow.

---

## 4. The container rule

Put this as a comment beside the tokens in globals.css, in the house style, because a rule nobody
can recite is a rule nobody applies.

**A border means one of exactly three things:**

1. **An input.** A text field, a textarea, a search box. The border is the affordance, not
   decoration — it is the shape your text goes inside, and without it a field is
   indistinguishable from a heading.
2. **An object you pick up, open or move as a whole.** It has its own name, and its own address
   or its own ⋯ menu. A library card. A file attachment. **A row in a list is not this** — it
   already has the list to belong to, which is why `/due` carries 22 rows with zero row borders
   and is the calmest thing in the product.
3. **A layer floating above the page.** A menu, a popover, a dialog, a toast. Here the border is
   doing physics — it says "this is not part of the page underneath" — and it carries the shadow.

**And nothing bordered inside something bordered.** That one clause removes the ⌘K keycap from
inside the search field, the 32×32 icon tile and the kind pill from inside every library card,
the send button from inside the composer, and the icon tile from inside the chat attachment card.

### The test for a new component

Three questions, in order. Stop at the first yes.

1. Does somebody put text into it, or throw a file into it? → border, `--radius-sm`.
2. Does it have its own name **and** its own address or its own ⋯ menu — is it a *thing* rather
   than a *region*? → border, `--radius-md`.
3. Is it painted over content it is not part of? → border + shadow, `--radius-lg`.

Otherwise: **no border, no fill.** It gets a heading at `text-meta` and `--space-5` of air. That
is what "these things are related" looks like now.

### Where a rule is allowed

A rule is one line with one edge. Three places, and nowhere else:

- **Under a table head**, separating the header row from the rows.
- **A page's floor or ceiling** — the boundary between the content and permanent furniture the
  content scrolls past. `/library`'s shelf. `/due`'s doors bar.
- **A split between two independently scrolling regions** — the sidebar, the rooms rail, the
  thread panel. This one is shell structure and does not count against the budget.

**Maximum two rules per screen** outside the third case. A sticky heading does not qualify: what
stops content showing through a sticky heading is its `bg-canvas`, not its border.

### The one escape hatch, written down so it is not invented later

**Where controls abut each other with no room for space between them, a fill may replace the
border. Never both.** Reaction pills on `/chat`, attachment chips in the composer. A fill in this
position is shape, not state — and per §5 it may still never be the *only* carrier of a state.

---

## 5. Colour

No new colours. The existing tokens are correct and none of their contrast floors are lowered
anywhere in this document.

**`bg-accent` filled: exactly one per screen, and it answers "what do I press to start
something".**

- `/library` — `NewProjectButton`. The page's own source argues at length and correctly that this
  must have exactly one answer. Twelve lines further down `KeepPrompt` renders "See the options"
  as a second filled accent 82px away. That one goes. So do the two in the empty states and the
  no-team panel (`library/page.tsx:248`, `:434`) — the New button is on screen in the header at
  all times, so it is already the answer.
- `/due` — none.
- `/chat` — the send button, and only when there is something to send. Which is already right.
- `/settings` — **none.** The Account section currently renders "Create an account" filled and
  "Stay on this device" bordered, immediately under a hint that reads *"Neither one is a trial
  version of the other."* The UI is arguing with its own copy. Both become the same
  `bg-surface-2 text-fg font-medium` action shape.

**The one written exception: a count of things you have not seen.** Chat unread badges and the
sidebar's nav badges stay `bg-accent`-filled regardless of the per-screen budget. They are not
controls and they are not competing with the primary action — they are the only thing on the
screen saying "something happened while you were away", and that is the one per-object attribute
this product actually has. Digits go sans `text-meta`; grow the pill to `min-h-[16px] px-1.5`.

**`text-accent` as text:** links only, and only where position does not already say it is a link.
`DesktopNotes`' "All notes" is not one of those — it sits at the end of a row of words.

**`text-warn`: lateness only, and it must reach the heading.** Budget: **at most three warn
strings plus the heading that owns them, per screen.** Deleting the `color:` line from
`.label-mono` (§2) is what brings "overdue" up in warn and "today" up in fg for free. It is the
cheapest change in the repository and the largest single gain for somebody scanning `/due`.

**No fill is ever the sole carrier of a state.** A fill used as reinforcement must be paired with
ink and weight. Measured floors are in §1; none of surface, surface-2 or surface-3 clears 3:1 in
both themes, so this is not a preference.

**Colour as identity is allowed in exactly one place:** the six accent swatches in
`/settings#appearance`, where colour *is* the subject. 20px squares, the name beneath at
`text-meta`, no pill, no border.

### Where this contradicts the reference image, and why

The reference gives every card exactly one coloured pill — the priority. **We do not, and our
cards get zero.** On a board the coloured pill is priority, and priority is what that product is
about. Our library cards have no urgency attribute; the only thing colour could encode is *kind*,
and a saturated kind pill is the uppercase mono badge again with more ink in it. We read the
reference's rule as **"colour has exactly one job per screen"**, and the pill-per-card is a
consequence of that board's subject, not the principle. On our screens the one saturated thing is
what is **wrong or late**, never a per-object attribute. Copying the literal version would re-add
the badge this whole document is removing.

We also drop the reference's active-row border in the sidebar and rails: a fill *and* a border is
two signals for one state, and per §1 the fill is the one that cannot carry it alone — so the
carrier is ink and weight, and the fill stays only as reinforcement.

---

## 6. The monospace rule

**The monospace face is for text that is not language.** A key cap; a hostname, path or URL; a
config identifier you would paste into an env file verbatim; a model id; a row id.

This is not a new opinion. globals.css already states it. The judgement was made and then not
applied to the badges, the counts, the dates, the initials or the sort row.

**Survivors, exhaustively — about 20 of the 231 uses:**

- `.kbd` (globals.css:130). ⌘K in the sidebar and in `/library`'s search, and the seven shortcut
  keycaps in `/settings#shortcuts`. A key cap is literally a glyph on a physical key.
- `ProviderRow`'s `value`: `openrouter`, `supabase`, `web-speech`, `mock`, `local`. Literal config
  strings. Keeps the face, **loses its bordered pill.**
- `ConnectionPanel`'s URL, and the AI section's model ids (`settings/page.tsx` rotation `<ol>`).
- `AdminSections`' member and provider ids.
- `<code>` inside prose: `OPENROUTER_API_KEY`, `supabase/schema.sql`.

**Everything else goes sans at `text-meta`.** That is 41 mono runs on `/library` → 1; 38 of 94
text nodes on `/chat` → 1; every timestamp, avatar initial, unread digit, reaction count,
`(edited)`, `sending…`, `3 replies`, `2 members`, and the rooms rail's whole English sentence
"6 rooms · 15 messages · 1 archived · community", currently set in 10px mono.

`ProviderRow`'s `detail` goes sans: `"askAI(prompt, context) — streaming, accept/reject"` is
prose *about* an interface, not something you paste.

**All 14 `uppercase` uses go.** Sentence case throughout, which is what `/due`'s `dayLabel`
comment already argues for and what globals.css already says.

---

## 7. Per screen

### 7.1 `/library` — `src/app/(app)/library/page.tsx` (736 lines) + `src/components/library/*`

Measured today at 1280×900: the top edge of the library grid sits at **y=937**. The first screen
of the page called "Your work" contains none of the work. Above it: 639px of chrome and 37 of the
page's 51 interactive controls.

**Header.** `page.tsx:208` `text-[24px] sm:text-[26px]` → `text-title`. Subtitle `:211`
`mt-1.5 text-[13px]` → `mt-(--space-1) text-body`. The header block's `mb-7` → `mb-(--space-6)`.

**PickUpWhere → the grid's first row.** I diffed the hrefs: the band renders `/p/p_thesis`,
`/p/p_board`, `/p/p_pitch`, `/p/p_orbit`, `/p/p_atlas` — byte-for-byte the same five in the same
order as the grid below, in a second card shape, with the same four facts at eight type sizes.
This is the loudest thing on the page and it is the work competing with itself.

So: **delete the card shape, keep the promise.** `PickUpWhere.tsx` renders nothing of its own;
`"pick up where you left off"` becomes a `text-meta` label above the grid, and the default sort
stays `recent`. Four of the thirteen font sizes leave with it (14.5/13 for names, 10.5/10 for
summaries).

The component's own comment says the band sorts independently because *"this band means one thing
and has to keep meaning it while somebody types in the box underneath"* — which is correct, and
is why the label is now **conditional: shown only while the grid is in its default state**
(sort = recent, no query, no kind filter, no folder). The moment somebody types, filters or
re-sorts, the label goes and the grid is just the grid. Nothing is hidden — the six most recent
are still the first six under the default order — and the label stops claiming something untrue
rather than claiming it falsely from a separate list. Rewrite that comment to say this.

**KeepPrompt** (`src/components/account/KeepPrompt.tsx`). The wide variant loses
`rounded-md border border-line bg-surface px-3.5 py-3`, the `users` icon, and both button shapes.
It becomes one `text-body` sentence directly under the subtitle, with "See the options" and
"Keep it here" as inline underlined text links. It still comes first, is still asked once, both
doors keep their words and their addresses, `keepOnDevice` is unchanged — and the 74px flex column
that makes it **304px tall on a 390px phone** stops existing, because a sentence wraps and a flex
row with two buttons does not. `KeepPromptCompact` loses its border and fill too and gets
`--space-5` above and below; its `bg-accent` link becomes a text link.

**DesktopNotes.** Section loses `mb-4 rounded-md border border-line bg-surface p-2.5` — that
removes the page's only depth-3 nest on its own. Heading "Notes" → `text-meta`.
`divide-y divide-line` → `grid gap-(--space-3)`. Note title 13.5px → `text-body text-fg`; preview
and datetime → `text-meta`. "All notes" loses `text-accent`, becomes `text-meta text-fg-muted`
underlined. The bare `Delete` button on each row **moves into a `RowMenuButton`** with Delete as
its one item — every other object on this page reaches its destructive action through the shared
⋯, and a note is the one row that never got it. One home per action is a rule this codebase
already paid for.

**DueSoon.** Section loses `rounded-md border border-line bg-surface p-2.5`; rows sit on the
canvas. "Due soon" → `text-meta`. "All of it" → `text-meta text-fg-muted`, underlined. The
`text-warn` on the due phrase stays and becomes the only warm ink on the page — it recedes and
gets more legible at the same time, because the box competing with it is gone.

**FolderRail wrapper** (`:297`) loses its box; gets a `text-meta` label and `--space-3`.

**The controls become ONE cluster.** This is the reference's point 3 and it is the one thing the
audit's proposals half-missed. Today there are three rows at three weights: a full-width bordered
search field, a scrolling row of bordered chips, and a sort group. Replace with **one row** at
≥640px: the search field on the left at `flex-1 max-w-[420px]`, then the kind words, then the
sort words, all on one baseline, all at `text-body`, `gap-(--space-2)` between, `--space-3` above
and below the whole cluster. Below 640px it wraps to two lines.

- Search field (`:335`) keeps its border — it is case 1. The `.kbd` "⌘K for anything" moves
  **outside** the field, to its right, still a `.kbd`. Nothing bordered inside something bordered.
- `FilterChip` (`:594`): drop `border px-2 py-1`; drop the `font-mono text-[9.5px]` count face.
  Active = `text-fg font-medium`, inactive = `text-fg-subtle hover:text-fg`, count as `text-meta`
  beside the word. **`aria-pressed` is already on all seven and is untouched — that is what makes
  de-boxing safe.**
- Sort (`:397`): drop `font-mono tracking-wide uppercase` and `bg-surface-2`. "Recent · Name ·
  Kind" in sentence-case sans at `text-body`, active in `text-fg font-medium`. `aria-pressed`
  untouched.

**`LibraryCard`** (`:536`). Keeps `rounded-lg border border-line` — case 2, and this is the one
concession the stance makes. Loses `bg-surface` (canvas beneath; hover becomes `bg-surface`,
which is feedback, not state). The `size-8 rounded-md border border-line bg-surface-2` icon tile
(`:543`) loses its border and fill and keeps the glyph. The `rounded-xs border uppercase font-mono
text-[9.5px]` kind pill (`:558`) is **deleted as a pill**, and kind, summary and date merge into
one `text-meta` line: `Thesis / Doc · 277 words · 4m ago`. Name → `text-object`. **Two sizes per
card instead of four; twenty boxes across ten cards become zero.**

**Empty states** (`:238`, `:412`) use `display text-[19px]` — the storefront serif, leaking into
the app. → `text-object` in the sans face. Their `bg-accent` buttons become text links.

**Shelf** — untouched except that `ITEM`'s `text-[12px]` → `text-body` and `Dot()` gets it
explicitly (today the `·` carries no size class, inherits 16px from the root, and is the largest
glyph on the calmest line of the page). Its `border-t` stays: it is the page's floor, and its own
comment explains why it never hides.

**Budget:** 38 bordered boxes in `<main>` → **6** (five cards + the search field). 13 computed
font sizes → **4**. 41 mono runs → **1**. Grid top edge y=937 → **under 400** at 1280×900.

---

### 7.2 `/due` — `src/app/(app)/due/page.tsx` (601 lines)

**Do this first, it is one line.** Delete `color: var(--color-fg-muted)` from `.label-mono`
(§2). The `Group` call site becomes
`cn("text-meta", tone === "late" ? "text-warn" : tone === "now" ? "text-fg font-medium" : "text-fg-subtle")`.
The `tone` prop comes alive and the page starts drawing the distinction it exists to draw.

**The `<h1>` leaves the bordered header bar** (`:295`). `<h1 className="text-title">What you owe</h1>`
on the page, `--space-6` below. The `stillOverdue` badge
(`rounded-xs bg-warn/12 px-1.5 py-0.5 text-[11px] text-warn`) is retired; the count moves into the
page's one fact line, in the same shape `/library` uses: `<p class="text-body">22 things. <span
class="text-warn">3 are late.</span></p>`. The overdue pile heading 40px below now carries warn
too, so the fact is stated twice in one ink instead of five times in three treatments. The header
bar's `border-b border-line` goes with it.

**Quick-add** (`:309`) keeps its border — case 1 — and moves onto its own line under the fact
line, full width up to 520px.

**Problems band** (`:401`) keeps `role="status"`, loses its `border-b`, becomes `text-body text-warn`.

**Practice strip** (`:411`) loses its `border-b`, becomes a `text-body` link row with `--space-3`
above and below.

**Day headings** (`Group`, `:440`): drop `border-b border-line`. Keep `sticky top-0 z-10
bg-canvas` — that fill is doing a job a border cannot. `py-1.5` → `pt-(--space-3) pb-(--space-2)`.
**Eleven rules gone.**

**The eight status ribbons** (`:554`) — the worst measurement in the audit. Each is 199px, fully
bordered, `ml-auto`-pinned, and the horizontal whitespace between a row's own title and the
control that acts on it measures **1032 to 1199px** at 1800 wide. The eye entering the page lands
on a column of grey boxes down the right edge, because that column is the only place with borders
in it.

The fix, and note what it deliberately does **not** do:

- Delete the wrapper `ml-auto flex rounded-xs border border-line p-0.5`.
- The three buttons move onto the row's **second line**, immediately after the lateness / course /
  document metadata — about 8px from the title instead of 1032px.
- **All three labels stay permanently visible.** "Not started", "In progress", "Handed in" render
  verbatim on all eight rows, exactly as today. Nothing goes dark, nothing moves behind a
  disclosure, and marking an essay handed in stays **one click**. An earlier draft of this
  proposed opening the control on click and it is rejected: the brief's hardest constraint is that
  nothing may be deleted, and 24 always-visible labels becoming zero-until-you-interact is
  deleting them with better manners.
- Each button: `text-meta rounded-xs px-1.5 py-0.5`. **Active = `bg-surface-2 text-fg
  font-medium`.** Inactive = `text-fg-subtle hover:text-fg`. `gap-(--space-1)` between.
  `role="group"`, `aria-label={`Move ${title}`}` and all three `aria-pressed` are untouched.
- The faint chip on the active segment is the one piece of ink that answers "is this a sentence or
  a switch" out of context. It is **not** the carrier — surface-2 is 1.24:1 dark and 1.08:1 light
  and cannot be — weight and ink are, and the chip reinforces. That pairing is what fixes the
  shipped light-mode bug rather than moving it.

**Do not put the status control in the 42px time column.** `:527` renders
`{dueClock(assignment) ?? ""}` there, and `lib/assignments/model.ts` returns a real clock for any
assignment with a `dueMinute` — the rows that most need the control are exactly the ones with
`23:59` already sitting in the slot.

**Do put the task checkbox there.** `:497` renders `<span className={TIME} />` — an always-empty
column on task rows, because tasks never have a clock. Moving the checkbox into it fixes the
ragged left edge: today assignments and events start their title at x=296 and tasks at x=317,
because the checkbox sits in the flex flow and pushes the title 21px right. Afterwards all three
kinds start at the same x and the page has one vertical the eye can run.

**Task lateness** moves from `ml-auto` (measured at x=1693) to under the title, the slot an
assignment already uses (x=296). Same string, same colour, same meaning, 1397px apart today.

**The checkbox is a real bug.** `className="accent-current"` resolves `accent-color` to
`currentColor`, which on the task label is `--color-fg` = `#16161a` in light. Chromium tints the
whole control, so an **unchecked** box renders as a solid near-black square that reads as already
ticked. → `accent-[var(--color-accent)]`.

**The 10px `Icon name="text"`** before a linked document name renders as a stray capital T and
reads as a typo in "T Golden Age essay". Drop it — the link colour already says it is a link.

**Door pills** (`:414`) → underlined words with their icons, `text-body text-fg-muted`, on the
same bar in the same place. Their permanence is right and unchanged; two bordered pills just read
as primary buttons for a journey that is deliberately secondary. The bar keeps its `border-t` —
that is the page's one rule, and it is a floor.

**Budget:** 11 fully-boxed elements → **1** (the quick-add). 14 full-width rules → **1**. 8 text
sizes → **4**. Row borders stay at **zero**, which is what makes this page the calmest thing we
ship.

---

### 7.3 `/chat` — `src/app/(app)/chat/[[...channelId]]/page.tsx` + `src/components/chat/*`

**The message body is the weakest thing on a screen that exists to read it:** 13.5px, no fill, no
border, and **1258px wide — 184 characters per line at 1800px**, about 2.5× a readable measure.

- `MessageList.tsx:192` → `text-body max-w-[68ch]`. Biggest legibility win in the audit; costs one
  class.
- `:153` author name `text-[12.5px] font-medium` → `text-object`.
- `:157` and `:131` timestamps `font-mono text-[9.5px]` / `[9px]` → `text-meta text-fg-subtle`, sans.
- `:137` avatar initials `font-mono text-[9.5px]` → `text-meta`, sans (the circle is `size-7` = 28px).
- `:162` `sending…` and `:195` `(edited)` → `text-meta`, sans.
- `:222` reaction pills: drop `border`. Inactive `bg-surface-2 text-fg-muted`, active
  `bg-accent-soft text-fg`. This is the §4 escape hatch — reactions abut each other with no room
  for space — and the fill is not alone, because the ink moves with it. Count `:229` → `text-meta` sans.
- `:332` attachment card keeps its border (case 2, an object you open); loses `bg-surface`. Its
  inner `size-7 rounded-sm border border-line` tile loses its border. `:342` `font-mono text-[9px]
  text-accent` and `:350` `font-mono text-[9.5px]` → `text-meta` sans, and the accent goes.
- `:321` dashed-border placeholder → `text-meta text-fg-subtle` on the canvas, no border.

**Composer** (`Composer.tsx`). `:166` `border-t border-line` and `:239` the input's own border are
two hairlines 10px apart doing one job, and they are drawn **twice** when a thread is open.
**Drop the strip's `border-t`; keep the input's.** That direction and not the reverse: an input
must look like an input, and the input is full-width so it is already the composer's edge. Give
the strip `p-(--space-3)`. `:306-309` send button loses `border border-line` in its inactive state
— it is inside a bordered box. Its filled-accent active state is the screen's one accent and stays.
`:212` attachment chips lose their border, keep `bg-surface-2`. `:173` mention popover keeps its
border (case 3); `:197` `font-mono text-[9.5px]` → sans.

**RoomsRail** (`RoomsRail.tsx`).
- The People/account card (`:~200-240`) is 219×232, has its own surface, a border, and the only
  filled accent in the content area — for a subject that is not the conversation. It becomes a
  `text-meta` label, two `text-body` sentences and two underlined text links at the rail's foot.
  `:232` `bg-accent` "Sign in" → a text link. On a 390px phone it stops pushing the rooms it sits
  under off the first screen.
- Rows `:379`, `:477`: active = `text-fg font-medium`, inactive = `text-fg-subtle`. Keep
  `bg-surface-2` on the active row **as reinforcement only** — it is 1.24:1 / 1.08:1 and may not
  be alone, and now it isn't. No border on the active row.
- `:364` archived count and `:395` inline mono → `text-meta` sans.
- `:424` footer "6 rooms · 15 messages · 1 archived · community" — a whole English sentence in
  10px mono → `text-meta` sans. Its `border-t` stays: the rail's floor.
- `:507` unread badge stays `bg-accent`; digits sans `text-meta`, pill `min-h-[16px] px-1.5`.

**Top bar** (`chat/[[...channelId]]/page.tsx`).
- `:140` the bordered mono "2 members" button **merges into the avatar stack**: the stack `:122`
  becomes the button, with `aria-label="2 members"` and the count beside it at `text-meta` sans,
  no border. Three objects and two borders become one.
- `:150` gear button loses `rounded-sm border border-line`; bare icon button.
- `:122` stack initials `font-mono text-[9px]` → `text-meta` sans.
- `:172` channel title `text-[13px] font-medium` → `text-object`; `:176` topic → `text-body`.

**Thread panel.** `:220` `aside` keeps its `border-l` — that is a split between two independently
scrolling regions, the third rule case. `:221` and `:236` `border-b` go. `:223`, `:237`
`font-mono text-[10px]` → `text-meta` sans.

**The sidebar's recent list is NOT made conditional.** It folds channels in by design
(`Sidebar.tsx:242`), which is right on `/library` and duplication on `/chat`. Suppressing them on
one page was proposed and is rejected: a list whose membership changes depending on which page you
are standing on is a control that lies, and this codebase has already paid for that lesson. See §10.

**Budget:** 22 bordered elements in the content area → **4** (composer input, attachment card,
mention popover, dialog). 38 of 94 mono text nodes → **1**. 11 sizes → **4**.

---

### 7.4 `/settings` — the hard case

Verified: **20 sections in 5 groups. 25 `<h2>` elements. Zero `<h1>`.** The largest text on the
longest page in the product is a 15px section heading. 62 boxes, 26 rules, 87 controls, 5,853px,
and no objects at all. The reference image is a board tool with one kind of object and it offers
no answer here, so this section is the one that has to invent one.

**The answer is not fewer controls. It is one vertical edge and a rail that knows where you are.**

**(1) Give it an `<h1>`.** `<h1 className="text-title">Settings</h1>`, `--space-6` below, then the
first group label. It is the single most visible change on the page.

**(2) Kill the empty gutter, and it is one class.** The container is
`mx-auto flex w-full max-w-[1000px] gap-10 px-5 py-10 sm:px-8`; the rail is `w-[172px] xl:flex`;
the content is `min-w-0 max-w-[760px] flex-1`. Below `xl` the rail is `hidden`, so the inner width
is 936px, the content caps at 760px and sits left — **176px of dead gutter on the right at every
width from 1279px down to about 830px**, which is most laptops. Two changes:

- Drop `max-w-[760px]` from the content column. Line length is already governed where it matters:
  `Section`'s hint has `max-w-[58ch]`, and per §2 prose blocks cap at 68ch. A settings row is a
  label gutter and a control, not a paragraph, and it does not want an arbitrary 760px wall.
- Show the rail from `lg` rather than `xl`: `hidden … lg:flex`. At 1024px that is
  960 − 200 − 40 = 720px of content, which is more than the 760 cap ever gave below xl anyway.

**(3) The rail — twenty undifferentiated links.** The desktop rail already renders the five group
labels from `RAIL`. **The mobile rail drops them entirely** and renders all 20 as bordered
`text-[11.5px]` pills in a scroller. That is the source of the complaint, and the data to fix it
is already in the array.

- Width `w-[172px]` → `w-[200px]`, so "Is your work in your account?" stops wrapping to three lines.
- Group labels: `text-meta text-fg-subtle`. **Drop the `/60` opacity** — an opacity on a token is a
  fourth grey nobody declared.
- Links: `text-[12px] text-fg-subtle hover:bg-surface` → `text-body text-fg-subtle
  hover:text-fg`. No hover fill.
- **The current section gets an indicator.** An `IntersectionObserver` over the 20 `<section id>`
  elements sets one current id; that link gets `text-fg font-medium` and `aria-current="true"`.
  No pill, no fill, no border. This is the reference's point 2 and it is the **only new capability
  in this document** — it is what 62 borders were failing to provide, which is "where am I in
  5,853 pixels". It is additive: with JS off the rail is exactly the plain anchors it is today,
  and find-in-page and `#connection` bookmarks keep working, which is the whole reason the rail is
  anchors and not tabs.
  Observer settings that actually work here: `rootMargin: "0px 0px -70% 0px"`, so "current" is the
  topmost section in the upper 30% of the viewport; and fall back to the last section when the
  scroller is at the bottom, or the four short admin sections never win.
- **Make it scrollable.** It is `sticky top-4 h-fit` with no overflow today; 20 links plus 5 group
  labels is roughly 600px and it runs off the bottom of a 900px laptop viewport. →
  `sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto no-scrollbar`.
- **The mobile rail gains the groups.** Plain `text-body` words, `gap-(--space-3)`, current one
  `text-fg font-medium` with a 1px accent underline, still horizontally scrolling — and the group
  labels rendered inline as `text-meta text-fg-subtle` words, exactly as the desktop rail does.
  The desktop rail 20 lines above already gets this right; the codebase was disagreeing with itself
  at two widths.

**(4) The label gutter — this is what replaces the boxes.** `Section.tsx`'s `Row`: `sm:w-[152px]`
→ `sm:w-[200px] sm:shrink-0`, gap `--space-4`. Every label starts at the same x and every control
at **x = 224** for the whole 5,853px. One vertical edge the eye can run is worth more than 62
borders; it is the settings equivalent of `/due`'s 42px time column, which is that page's only
real alignment.

For that to be true, **every direct child of a Section body is either a `<Row>` or is indented to
the control column.** Today about a third are not. Add to `Section.tsx`:

```tsx
/** A control with no label of its own, held to the same column as every other
    control on the page. Without this the gutter is broken by a third of the
    sections and the page has no vertical edge at all — which is the whole
    reason the boxes came out. */
export const Loose = ({ children }: { children: React.ReactNode }) => (
  <div className="sm:pl-[224px]">{children}</div>
);
```

Wrap: "Clear the offline cache", "Reset projects to the samples" and the mono paragraph under it,
"Reset appearance", the shortcuts `<ul>` and "Every shortcut", the desktop Download row and its
paragraph, and the AI rotation prose. `ProviderRow`'s `w-[68px]` name column becomes the same
200px gutter, or Providers is the one section whose labels start somewhere else.

**(5) `Section.tsx` loses both containers.**
- `rule` variant: delete `border-t border-line pt-4`; body becomes `flex flex-col gap-(--space-3)`.
- `card` variant: delete `rounded-md border border-line bg-surface p-3.5`.
- **Keep the `variant` prop** and rewrite its comment. The existing comment makes a real
  observation — *"a list of members under a bare rule reads as part of the page rather than as a
  thing with edges"* — and the answer is that a table is not a card. A well-set page has had
  tables without boxes for five hundred years: an `text-meta text-fg-subtle` header row, **one
  rule under the head and none anywhere else**, right-aligned numeric columns, `--space-2` row
  padding. It reads as an object because its columns align, not because it has a wall. That is a
  rule, not a border, and §4 permits exactly this. So `card` now means "this section is a table";
  the prop keeps the two call sites distinguishable and keeps the decision recorded where it was
  made.
- `mb-10` → `mb-(--space-5)`. Heading `text-[15px] font-medium` → `text-object`. Hint
  `mt-1 mb-4 text-[12.5px]` → `mt-(--space-1) mb-(--space-3) text-body`, keeping `max-w-[58ch]`.
- Re-measure `scroll-mt-24` after the `<h1>` lands; the mobile rail's height changes.

**(6) The five group `<h2>`s** (`page.tsx:272, 290, 302, 403, 689`): drop `border-b border-line
pb-2`; `mt-14 mb-4` → `mt-(--space-6) mb-(--space-4)`. Label at `text-meta text-fg-muted`; the
trailing explainer on a second line at `text-meta text-fg-subtle`, dropping its `/70` opacity.

**A deliberate inversion, because it looks like a mistake and is not:** a group heading is
`text-meta` at 11px while the section headings *under* it are `text-object` at 15px. The small one
is higher in the outline. That is correct — a group label names a region, it does not title
content — the sidebar already proves it works ("recent" at 11px above 13px rows), it is the
reference's point 9, and it means `/settings` needs no fifth type size for its second heading level.

**(7) `Segmented`** (5 uses: theme, corners, density, interface type, motion). Drop
`rounded-sm border border-line p-0.5`. Segments become `text-body` words with `gap-(--space-2)`;
active `rounded-xs bg-surface-2 px-2 py-0.5 text-fg font-medium`, inactive `text-fg-subtle
hover:text-fg`. **Identical to `/due`'s status control**, so the app has one segmented vocabulary
instead of two. Today's active uses `bg-surface-3` — 1.54:1 dark, 1.20:1 light — which is why the
weight and the ink have to be the carriers.

**(8) The six accent swatches** (`page.tsx:~424`) lose `border px-2 py-1` and the 10px dot. They
become 20px colour squares with the name beneath at `text-meta`. Selected: name in `text-fg
font-medium`, square gets a 2px inset ring in `--color-fg`. A selection ring on a coloured square
is not a container — it is the only way to say "this one" about a colour, and this is the one
section where colour is the subject.

**(9) The seven ✓/✕ marks** in `ConnectionPanel.tsx:74` (`size-5 rounded-full border font-mono
text-[10px]`) → bare glyphs, ✓ `text-fg-muted`, ✕ `text-danger`. The ✕ becomes the only saturated
ink in the section somebody opened to find it.

**(10) The ~14 bordered buttons split by what they do.** *An action that writes gets a shape; an
action that navigates gets a word.*

- **Writes** — `rounded-sm bg-surface-2 px-2.5 py-1.5 text-body font-medium text-fg`, no border;
  destructive in `text-danger`: Clear the offline cache · Reset projects to the samples · Reset
  appearance · Check again (ConnectionPanel) · Sync now / Export a backup file / Restore from a
  file (SafeKeeping) · Add (Dictionary) · Delete my account (EraseAccount) · the two AccountPanel
  buttons, which per §5 now share one shape.
- **Navigates** — underlined word, `text-body text-fg-muted hover:text-fg`: Every shortcut · What
  the plans cost · macOS / Windows / Linux · All releases.

**(11) `ProviderRow`**: `value` keeps `font-mono`, loses `rounded-xs border border-line px-1.5
py-0.5`. `detail` → `text-meta` sans. **(12) `AdminSections`**: the `rounded-xs border border-line
px-1.5 py-0.5 text-[10.5px]` role and count pills → plain `text-meta text-fg-subtle`; mono survives
only on ids. **(13) `Dictionary`** and the retention number field keep their input borders
(case 1); `Dictionary:61`'s word chips lose theirs and keep `bg-surface-2`.

**Budget:** 62 boxes → **4** (the two inputs, plus any popover). 26 rules → **1** (the member
table head). 9 sizes → **4**. 40 mono nodes → provider values and ids only. And the page gains a
title, a live position indicator and a vertical edge it did not have.

---

## 8. Enforcement

Agreement is not enforcement, and this repository already knows that: it has two node scripts that
check decisions a compiler cannot see. Two more, and a workflow that actually runs on the web app.

**The gap to close first.** `.github/workflows/desktop.yml` is the only workflow, and it is
path-filtered to `desktop/**`. **Nothing in CI runs today on a change to `src/`.** Not the lint,
not the typecheck, not the two existing scripts. Fixing that is a precondition for everything else
in this section.

### `scripts/design-scale.mjs` — a ratchet, not a ban

Reads `git ls-files 'src/**/*.tsx'`, counts five things per file, and fails if any count goes **up**
against a baseline committed beside it as `scripts/design-scale.baseline.json`:

1. `text-\[[0-9.]+px\]` — inline font sizes.
2. `font-mono` outside the allowlist in §6.
3. `uppercase`.
4. `label-mono` (must reach 0 and stay there).
5. `border border-line` and `border-[bt] border-line`.

A ratchet rather than a ban is the whole point. 1,530 inline sizes cannot be migrated in one commit
without blocking every other PR for a fortnight, and a rule that blocks everything gets turned off.
A per-file baseline that can only decrease means the migration lands file by file and can never
regress. Write that reasoning into the script's header comment, in the house style, the way
`no-case-collisions.mjs` explains itself.

The script also hard-fails, with no baseline and no exemption, on:
- any `text-[Npx]` under 11px outside the carve-out list in §9;
- any `.label-mono` occurrence at all, once the codemod has landed;
- any `--text-*` or `--space-*` value declared outside `src/app/globals.css`.

ESLint is the wrong tool here: the class strings are composed through `cn()` and a lint rule would
have to understand Tailwind to see them. A grep over `git ls-files` is what this repo already does
twice, and it is enough.

### `scripts/contrast-floors.mjs`

Parses the `@theme` block and the `:root[data-theme="light"]` block out of `globals.css`, computes
WCAG ratios, and fails if:
- `fg-muted` on canvas drops below **6.5:1** in either theme, or `fg-subtle` below **5.2:1** — the
  numbers globals.css already claims in its own comment, now checked;
- `fg` on `accent` (the filled-button pair) drops below **4.5:1** in either theme.

And it **prints, without failing**, the surface / surface-2 / surface-3 on canvas ratios in both
themes. Those numbers are the reason §1 says no fill may carry a state alone. If somebody retunes
the ramp so that surface-2 clears 3:1, this document's reasoning changes and the next person
should see that in the CI log rather than rediscover it from a screenshot.

It cannot see JSX, so it does not try. Its job is the tokens.

### `.github/workflows/web.yml`

```yaml
on:
  push: { paths: ["src/**", "scripts/**", "package.json", ".github/workflows/web.yml"] }
  pull_request: { paths: ["src/**", "scripts/**", "package.json", ".github/workflows/web.yml"] }
```

Steps: `npm ci`, `npm run lint`, `npx tsc --noEmit`, `node scripts/no-case-collisions.mjs`,
`node scripts/design-scale.mjs`, `node scripts/contrast-floors.mjs`.

### `package.json`

```json
"check": "node scripts/no-case-collisions.mjs && node scripts/design-scale.mjs && node scripts/contrast-floors.mjs"
```

### The comment that carries the rule

The container rule, the type roles, the three greys and the mono rule all go in `globals.css`
beside the tokens, as prose, in the house voice. A rule that lives only in a review comment is a
rule that lasts one quarter. The file is already the place where this codebase argues with itself
about why grey and not black, and this belongs beside that.

---

## 9. Deliberately not changed

Do not undo these. Each one was decided already, with a reason, and several have the reason
written in the source.

- **`/library`'s shelf.** Its top rule stays, its four plain words stay, it never hides. Its own
  comment explains that it is the floor that makes every band above it safe to disappear. Only the
  `·` separators and `ITEM`'s size change.
- **Bands that hide when they have nothing to say** — ReturnedNotes, DesktopNotes, DueSoon,
  PickUpWhere below two projects, KeepPrompt once answered. Made safe by a shelf that never hides.
  No redesign trades this for a permanent empty slot.
- **One menu.** `RowMenuButton` + `projectMenu` + `useProjectActions`. Rename, Move to, Labels,
  all five exports and Delete keep exactly one home. `/library` had already done the hard part of
  the founder's brief; what was left was presentation.
- **`/library`'s layout reasoning** — the 1400px cap, the grid above 1024 and the single column
  below, and the note that extra width should buy columns rather than line length.
- **`/due`'s shape** — one column, one order, top to bottom. No columns, no view switcher, no
  filter chips, no sort control, no density toggle. **And 22 rows with zero row borders**, which
  is the calmest thing we ship and the model for everything else.
- **`/due`'s hold-in-place behaviour** and `stillOverdue` counting what is still owed rather than
  what is still on screen. Both documented, both right, neither visual.
- **`/due`'s `dayLabel`**, lowercase throughout, and its comment about "today" and "friday 29
  august" reading as the same kind of thing.
- **Empty states.** One or two sentences of plain, concrete English, no illustration, no card.
  `/due`'s is the calmest thing in the product; the populated pages are being made to aspire to it.
- **Every route, control, link, fact and word.** All 51 controls on `/library` and all 87 on
  `/settings` survive, in the same place, at the same address. `/more` is the written index of the
  product; re-read it after this lands and confirm every line is still true.
- **All accessibility work**, which is real and deliberate: the global `:focus-visible` 2px accent
  outline at 2px offset with rings suppressed for mouse users; `aria-current="page"`; every
  `aria-pressed` (all seven library chips, all three sort buttons, all 24 status segments, all five
  Segmented controls); `role="group"` with accessible names; `role="status"` + `aria-live` on
  ImportZone, SaveWarning and the sync-problem line; `sr-only` labels. **Receding the chips and the
  segments visually is only safe because `aria-pressed` is already there — keep it.** The heading
  outline improves: `/settings` gains the `<h1>` it never had.
- **Colour tokens.** No new colours. `data-accent`, `data-theme`, `data-radius`, `data-font` and
  `data-motion` all stay exactly as they are, and every rule in this document is stated in tokens
  so the preferences keep working.
- **Document content type.** `.prose-canvas` and its `--prose-size` / `--prose-family` /
  `--prose-leading` variables, the editors, `present/`. A document's own type is the user's, not
  the UI's, and the type scale must never reach into it.
- **The storefront.** `src/components/landing/**`, `src/components/pricing/**`,
  `src/app/(marketing)/**`, `.display`, `.headline`, `.glass`, `.hero-*`. Different job,
  deliberately larger, and globals.css already says so. The app must not *import* the storefront's
  faces — which `/library`'s two empty states currently do with `.display`, and that is the one
  storefront leak this document fixes.
- **Miniatures.** Text inside a scaled preview of a document — `DeckStylePanel` slide thumbnails
  at 6px and 9px, the board `Minimap`, `LookPanel`'s swatch labels — is a *picture of a document*
  at 1/nth scale, not UI type. Exempt from the 11px floor. It must never be the only carrier of a
  fact, and the exemption is a named list in `design-scale.mjs`, not a general escape.
- **`--ui-row-y`, `--ui-gap`, `--ui-bar-h`, `--sidebar-w`.** Density scales rows; the space scale
  scales sections; they never touch.
- **`.kbd`.** It is the one mono class that is right about what it is for.

---

## 10. The honest weak spot

**The screen this serves worst is `/settings`, and specifically Appearance and Providers.** They
are dense fields of controls with no objects in them. Strip the borders and you have roughly forty
words and glyphs on an open field with nothing to say which word is a control and which is a
label — "Comfortable Compact" can read as prose rather than as a two-position switch. The 200px
gutter fixes the *rows*: label left, control right, one edge down 5,853px. It does not fix the
inside of a row.

The mitigation is the one faint chip on the active position plus weight and ink, and that is the
minimum that answers "sentence or switch" out of context. **It is thinner than the border it
replaces, and it is the first thing to look at in review.** If it does not read, the answer is to
raise the chip's contrast — not to put the wrapper back, which is the ribbon returning one control
at a time.

**Second: the fill we lean on is weak by measurement.** surface-2 is 1.24:1 on canvas in dark and
1.08:1 in light; surface-3 is 1.54:1 and 1.20:1. None clears 3:1. Every state in this document is
carried by ink and weight *first* for exactly that reason. But if somebody retunes the ramp, or
adds a sixth Segmented and reaches for the chip alone, the chip is doing no work and nobody will
notice — because `aria-pressed` will keep the screen reader correct while the screen is wrong. That
is precisely how the shipped light-mode segment got to 1.08:1 in the first place. It is what
`contrast-floors.mjs` exists to print.

**Third: `/library`'s grid is the case the stance loses.** In a three-column grid, horizontal
neighbours share no rule and no baseline, so a borderless card genuinely dissolves — you cannot
tell whether "Untitled deck / 2 slides" and the name to its right are one item or two. That is why
the card is case 2 of the container rule rather than an exception smuggled in, and the reference
boxes its own cards for the same reason. **If the grid ever goes to one column, the border should
go with it** — `/due` proves that, with 22 rows and no row borders. Watch that nobody adding a
fourth column also adds a fifth border inside the card.

**Fourth: the duplication this pass does not solve.** The sidebar's recent list and `/chat`'s
rooms rail show the same six rooms, 250px apart, both at the same size. Suppressing channels from
the sidebar on `/chat` was proposed and is rejected — a list whose membership changes depending on
which page you are standing on is a control that lies, and that is the exact lesson this codebase
paid for when it cut ten sidebar rows to five. The duplication stays, quieter: both are `text-body`
now, only the active one is in full ink, and the unread pills are the only accent. If it still
reads as noise afterwards, the answer is to change what the sidebar's recent list is *for*, not to
make it conditional.

**Fifth, and the reason to be nervous about `/library`:** the conditional "pick up where you left
off" label. Somebody who searches while intending to go back to yesterday's document loses the
label and has to clear the box. That is one click on the ✕ that is already in the field, and it is
the price of not rendering the same five projects twice at eight type sizes. If it turns out people
search *from* the arrival state more often than they arrive, revisit this one first.

### What to measure afterwards

Re-run the same measurements the audit ran, at 1800×1050, 1280×900 and 390×844, in both themes:

| | today | target |
|---|---|---|
| `/library` distinct computed sizes in `<main>` | 13 | 4 |
| `/library` fully-bordered elements in `<main>` | 38 | 6 |
| `/library` monospace text nodes | 41 | 1 |
| `/library` y of the first library card at 1280×900 | 937 | under 400 |
| `/due` fully-boxed elements | 11 | 1 |
| `/due` full-width rules | 14 | 1 |
| `/chat` mono nodes / total text nodes | 38 / 94 | 1 / ~94 |
| `/chat` message line length at 1800 | 184 chars | ≤ 68 chars |
| `/settings` boxes | 62 | 4 |
| `/settings` rules | 26 | 1 |
| app-wide inline `text-[Npx]` | 1,530 | 0 |
| app-wide `font-mono` | 231 | ~20 |
| app-wide `uppercase` | 14 | 0 |

**The prize, stated so nobody mistakes what this is:** none of the above removes a control, a link,
a fact, a route or a word. What changes is that about eight things on each screen are allowed to be
louder than the other forty-three — and the eight are the ones you opened the page for. On
`/library`, the names of five documents. On `/due`, what is late. On `/chat`, what was said. On
`/settings`, where you are.

Word's problem was never that it had too many features. It was that it drew a box around all of them.

---

## 11. What it actually measured, afterwards

Written after the pass rather than before it, so the numbers below are results and not targets. The
app-wide figures are `scripts/design-scale.mjs`'s own counters, run over the same file set before and
after; the per-screen figures are the DOM at 1800×1050, counting only elements that actually rendered
with a size.

**App-wide, in scope (the storefront excluded, as §9 says):**

| | before | after |
|---|---|---|
| inline `text-[Npx]` | 1,287 | 839 |
| `border border-line` / `border-t border-line` | 560 | 479 |
| `font-mono` | 202 | 152 |
| `uppercase` | 14 | 12 |
| sizes below 11px | 221 | 162 |
| `.label-mono` | 86 | 0 |

**Per screen, rendered:**

| | sizes | boxes | mono runs | accent fills |
|---|---|---|---|---|
| `/library` | 4 — 30, 15, 13, 11 | 3 | 0 | 1 |
| `/due` | 2 — 30, 13 | 2 | 0 | 0 |
| `/chat` | 3 — 15, 13, 11 | 14 | 0 | 1 |
| `/settings` | 5 — 30, 15, 13, 11, and 10 on seven keycaps | 22 | 12 | 1 |
| `/more` | 3 — 15, 13, 11 | 6 | 0 | 0 |

Every size on every one of those screens now comes out of `--text-*`. The exceptions are named
rather than rounded away: `/settings` renders 10px on the seven `<kbd>` keycaps in Shortcuts, which
are keys and not prose, and its twelve remaining monospace runs are a file path, a model name and
three provider identifiers — exactly what §6 says the face is for.

### Where it fell short, and why that is written here

`/settings` was targeted at 4 boxes and holds 22. Fifteen of those are things §4 permits on sight —
two text inputs, six buttons, seven keycaps. The rest are the two account `Choice` cards and the
avatar row, which are objects you pick up, plus the seven small state rings in Connection. The
figure will not reach 4 without deciding that a filled button may lose its edge, and that is a
different argument from this one.

The app-wide inline-size count is still 839. That is the ratchet working as designed rather than
failing: §8 is explicit that twelve hundred sizes cannot migrate in one commit, and what this pass
owes is that the five screens somebody actually looks at read from one scale and that no file can
ever go back up. Both are true and both are checked.

One number moved that was not on anybody's list. `--color-fg-subtle` in the light theme was
`#71717c`, which measures 4.66:1 on the light canvas — half a point below the 5.2:1 the top of
`globals.css` has promised since the tokens were written, on the ink §2 hands every date, count and
group label on a list screen. It is now `#696974`, 5.24:1, and `scripts/contrast-floors.mjs` fails
the build if it drifts again. Nothing in this pass got quieter; one thing that was quieter than it
claimed got fixed.
