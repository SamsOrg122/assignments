# What to build next, and why in this order

Three bets. Each one is written against what the code does today, not against
what it feels like it does — so every section starts with what already exists,
because half of these are further along than they look and one of them is
further behind.

The rule the whole storefront runs on applies here too: **nothing gets claimed
on a page until the code does it.** Each bet therefore ends with what the
marketing may say once it lands, and what has to be *un*said until then.

## The order, and the argument for it

Ranked by how much each one matters, it goes: live collaboration, then import,
then the share loop. That is not the order to build them in.

1. **Bring your Office in** — highest value per week of work. It removes the
   objection that stops most people before they evaluate anything.
2. **The link that comes back** — smallest of the three by some distance, and
   most of it already exists. It turns every shared document into an advert.
3. **Two people in one paragraph** — the biggest, and the one that decides
   whether a company can standardise on this. It is third because it changes
   how a document is stored, and while it is landing it would block the other
   two.

Doing the cheap loop before the expensive rewrite also means that if the third
one takes twice as long as planned — and it will — the first two are already
earning.

---

## 1. Bring your Office in — **done**

Landed. Drag a folder anywhere onto the Library, or pick files or a folder from
the New menu; the folders are mirrored, every file is either a project or is
named with a reason, and running out of storage is distinguished from a file
that could not be read. The front page says so now, which it could not before.

Found while building it: the XML scanner behind the `.xlsx` reader treated a
self-closing `<sheet/>` as an opening tag and then abandoned the rest of the
document — so every workbook, including ones this app had written itself,
arrived as "no sheets with anything in them". Fixed, with a round trip on it.

Still open, and deliberately: `.doc`, `.xls` and `.ppt` are refused rather than
converted, Apple's formats likewise. A dropped folder is a desktop gesture —
the file pickers are what a phone gets. The section below is what was planned,
kept because the reasoning still applies to the two bets that follow.

**What existed.** Real readers for all three formats, and real writers back out:
`lib/docx`, `lib/pptx`, the sheet's xlsx path. A `.docx` opens into a document,
an `.xlsx` or `.csv` into a spreadsheet tab, a `.pptx` into a deck. None of this
is a stub.

**What's missing is the doorway, not the machinery.** Every import lives *inside*
a project you already created: you make a document, then import into it. Nobody
switching from Office has one file. They have a folder, and today there is no way
to start from it.

**The work.**

1. A drop target on the Library that takes many files at once, routes each by
   extension to the reader that handles it, and creates a project of the right
   kind named from the filename.
2. A folder drop — `webkitGetAsEntry` on the drag, `webkitdirectory` on the
   picker — that walks the tree and mirrors the folders as Library folders.
   Folders already exist; this is a mapping, not a feature.
3. A report at the end: what came in, what didn't, and why. An import that
   silently drops three files out of forty is worse than one that refuses,
   because the person only discovers it in the week they need chapter four.
4. Parsing off the main thread, or in batches with visible progress. Forty
   `.docx` files parsed synchronously will freeze the tab, and a frozen tab
   during the very first thing somebody does with the product is the whole
   first impression.

**Known hazards.** Legacy `.doc` and `.xls` are a different format entirely and
must be refused by name rather than failing as corrupt. Password-protected files
the same. Storage quota is real and already has an alarm (`StorageAlarm`); a
bulk import is exactly what will trip it, so the report has to distinguish "this
file was unreadable" from "you ran out of room at file 31".

**Done when** dragging a folder of twenty-five mixed files produces twenty-five
openable projects in matching folders, and anything skipped is named on screen
with a reason.

**Proved by** a fixture folder committed to the repo and a browser run that
drops it, counts what arrives, and asserts the report matches what was skipped.

**Then the storefront may say** "bring your whole Office folder". Today it says
files come in one at a time, which is what happens.

---

## 2. The link that comes back — **done**

Landed. "Can comment" is the fourth share mode: it opens the reader, not the
editor, with a rail in the margin of every paragraph. The commenter types a
name once, it is kept in their own browser, and it travels with the note so it
arrives from a person rather than from "Guest".

The part that was actually missing turned out to be storage, not interface. A
note left through a link lived in the reader's browser, and the relay forwards
bytes between two people who are both present and keeps nothing — so unless
the author happened to be in the same live session at the same second, the note
was simply gone. There is now a note box beside the relay: capped, expiring
after a day, read by the Library on open and merged onto the paragraphs the
notes were left on.

**Its limit, which the interface repeats rather than hides:** that box is one
server process's memory. A restart, a redeploy, or a platform that spreads
requests across instances loses whatever is waiting, and a note that fails to
send says so on the spot with the words still in the box to copy. It closes the
gap between "you were both online at the same second" and "you opened it the
same day". It is not a database and nothing may call it one.

Still open, deliberately: comments are on documents — a comment link to a deck
or a board opens as a reader and says so. And there is no reply, no resolve and
no notification beyond the Library bar.

**What existed — more than it seemed.** Share links carry three permissions, they
expire, they can be revoked, and a recipient with a suggest or edit link gets the
*real* editor rather than a viewer: `ViewerClient` hands off to `GuestEditor`,
which mounts the same `WritingEditor`, the same canvas, the same block comments.
Somebody with no account can already comment on a paragraph.

**What's missing is the round trip.**

- **There is no "can comment".** The modes are view, suggest and edit. View is
  read-only; suggest lets them rewrite the text. The mode most people actually
  want to send — read it, mark it up, don't touch it — is the one that isn't
  there.
- **Nothing comes back to the owner.** Comments land in the shared project
  state, and if the owner isn't in the session at that moment, nothing on the
  Library card, and nothing anywhere else, says three comments are waiting.
- **A guest is anonymous.** They are "Guest" until they type a name, and the
  comment carries no identity worth replying to.

**The work.** Add the fourth permission and gate the editor on it. Capture a
guest's name once, at the door, and attach it to what they leave. Surface
returning work where the owner will see it — a count on the project card and a
line in the Library.

**Done when** a "can comment" link sent to somebody with no account produces
comments the owner sees flagged on the project card without having been in the
room.

**Proved by** a two-context browser run: one leaves comments through the link,
the other opens the Library cold and finds them.

**Then the storefront may say** that sharing needs no licence at the other end —
which is precisely where Office is weakest and where we currently say nothing.

---

## 3. Two people in one paragraph

**What exists.** The networking is done, and it is not a toy. `lib/collab`
picks between a server-sent-events relay (`/api/collab/[room]`), a
`BroadcastChannel` fallback and Supabase Realtime, and it proves the round trip
with a probe before it will claim reach. Presence, cursors and per-block patches
all work.

**What's missing is the merge.** Sync is per block and last-writer-wins. Two
people in different sections never collide. Two people in the same paragraph at
the same second: one of them loses their sentence, silently. The comparison page
says this in those words, and it stays there until this is fixed.

**The decision to make first.** A text block is an HTML string today; a CRDT
needs a sequence with stable identity. Two routes:

- **Adopt Yjs.** A dependency, a well-tested merge, awareness for cursors, and
  offline convergence by design.
- **Hand-roll an RGA.** No dependency, full control, and a fortnight of work
  that will be subtly wrong for a year.

**Take Yjs.** This is not the place to be clever. The interesting problems here
are the migration and the persistence, not the merge algorithm.

**The work.**

1. A `Y.Doc` per project, with text blocks as `Y.XmlFragment`. Read the existing
   shape, seed the document, and dual-write for one release so that every
   project already sitting in somebody's browser keeps opening.
2. The transport carries Yjs updates instead of whole blocks. The existing
   `patch` message becomes the carrier — base64 over the relay, binary over
   Supabase.
3. Persistence stores the update log, so a tab that was offline for an hour
   merges on reconnect instead of clobbering.
4. Cursors move to Yjs awareness, replacing the current cursor messages.

**Scope discipline.** Documents only. The board and the sheet are a map CRDT
rather than a sequence one, they are far easier, and they should follow rather
than ride along — a migration touching three data models at once is how a
release slips a month.

**Done when** two browsers typing into the same paragraph for a minute converge
to identical text, and converge again after one of them is disconnected for
thirty seconds mid-sentence.

**Proved by** a two-context browser run that types into one paragraph from both
sides, plus a fuzz test that applies random interleaved edits and asserts both
documents match.

**Then** the compare page's "the same paragraph at the same second does" comes
out, "work together" can be said without a caveat, and the Team plan is
defensible for the first time.

---

## What we are deliberately not building

**An inbox.** An email address lives at a school or a company. Nobody moves one,
so a mail client here would compete with Outlook on the single thing people
cannot switch — and pay for it in deliverability, spam handling, storage, abuse
and IMAP sync, none of which produces anything visible for somebody writing a
thesis.

Nobody switches *for* mail. They refuse to switch *despite* it. That makes the
job "don't take anyone's mail away", which is solved by not competing.

The useful part of the need is already built: **compose from your work**
(`lib/email/compose.ts`), which drafts the message and hands it to whatever the
person already uses. That is the whole of the mail story, on purpose.

---

## How anything here gets called finished

Same as everything else in this repo: `tsc` clean, `eslint --max-warnings=0`
clean, the build prerendering every page, and a browser suite that exercises the
real thing rather than a mock of it. A bet is not done when it works on the
happy path — it is done when the failure it introduces has a message that says
what happened.
