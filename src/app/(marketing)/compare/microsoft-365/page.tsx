import Link from "next/link";
import { H2, P, PageShell } from "@/components/landing/PageShell";
import {
  Breadcrumbs,
  CallToAction,
  Contents,
  FAQ,
  H3,
  JsonLd,
  RelatedPages,
  Table,
  Takeaway,
  type TocItem,
} from "@/components/landing/LongForm";
import {
  type FaqItem,
  breadcrumbJsonLd,
  counterparts,
  faqJsonLd,
  page,
  pageJsonLd,
  pageMetadata,
} from "@/lib/seo";

const SLUG = "/compare/microsoft-365" as const;

export const metadata = pageMetadata(SLUG);

const CONTENTS: TocItem[] = [
  { id: "where-365-wins", label: "Where Microsoft 365 is better" },
  { id: "where-one-workspace-wins", label: "Where one workspace wins" },
  { id: "side-by-side", label: "Side by side" },
  { id: "price", label: "What each one costs" },
  { id: "do-not-switch", label: "Who should not switch" },
  { id: "faq", label: "Questions people ask first" },
];

const FAQS: FaqItem[] = [
  {
    question: "Can I open my Word and Excel files in Tougather?",
    answer:
      "Yes. A .docx import brings headings, lists, tables, footnotes and Word's tracked changes across, and those changes arrive as proposals you accept or reject. An .xlsx import brings values and date serials \u2014 a cell holding =B2*C2 arrives as the number it last computed to, not as a formula. Macros and VBA do not come across either, because there is nothing here to run them.",
  },
  {
    question: "Does Tougather replace Outlook and Teams?",
    answer:
      "No. It covers documents, spreadsheets, slides, an infinite board and chat, and hosts no email and no calendar. The chat model is real, but the transport that ships is simulated, so a team running on Teams should keep running on Teams.",
  },
  {
    question: "Is Tougather cheaper than Microsoft 365?",
    answer:
      "Free is €0 and needs no login. Pro is €14 a month and is not billed per seat. Team is €24 per seat per month: €1,440 a year at five seats, €5,760 at twenty. Microsoft 365 is licensed per person, so take their number and compare. One caveat: checkout is not wired up here yet, because every Stripe price ID is still null.",
  },
  {
    question:
      "Can I use Tougather if my university or employer requires Microsoft 365?",
    answer:
      "Usually, for your own drafting. The Word export carries footnotes, page numbers and Word's own tracked changes, so a supervisor can review it in Word. Two things to check first: equations go in as LaTeX source rather than as Word equation objects, and page numbers appear in the Word file but not in a browser print.",
  },
];

const COLUMNS = ["", "Microsoft 365", "Tougather"];

const ROWS = [
  [
    "Spreadsheet functions",
    "More, plus dynamic arrays and VBA",
    "167 in one library. No spill model, no macros",
  ],
  [
    "Rows in one sheet",
    "Just over a million",
    "50,000 measured comfortable; 100,000 refused",
  ],
  ["Email and calendar", "Outlook, hosted mail", "None. Keep your mailbox"],
  [
    "Chat and meetings",
    "Teams, with calls",
    "The model is real; the transport is simulated",
  ],
  [
    "Two people in one file",
    "Co-authoring in Word and Excel",
    "Per shared project, last-writer-wins per block",
  ],
  [
    "Admin, audit log, SSO",
    "Central administration, provisioning",
    "Admin needs a database; no SCIM",
  ],
  [
    "Without a connection",
    "Desktop apps, no browser needed",
    "Installable PWA, last known shell",
  ],
  [
    "Docs, sheets, slides, board",
    "Four apps, four files",
    "One project, nine block types, one copy of the data",
  ],
  [
    "Using it with no account",
    "A Microsoft account, every plan",
    "The free plan has no login",
  ],
  ["Word export", "Native", "Real OOXML; equations as LaTeX source"],
  ["PDF", "Writes a PDF file", "Prints through the browser dialog"],
  ["Price", "Per person, per month", "€0, €14 a month, or €24 a seat"],
];

export default function CompareMicrosoft365Page() {
  const entry = page(SLUG);
  const nl = counterparts(SLUG).nl;

  return (
    <PageShell
      eyebrow="Compare"
      title={entry.h1}
      lead="Microsoft 365 is four good applications and a mail server. This is one document model with no mail server in it. Here is every place that trade goes against us, and the places it goes the other way."
    >
      <JsonLd data={[breadcrumbJsonLd(SLUG), pageJsonLd(SLUG), faqJsonLd(FAQS)]} />
      <Breadcrumbs slug={SLUG} />

      <p className="-mt-4 mb-2 text-[12.5px] text-fg-subtle">
        <Link
          href={nl.slug}
          hrefLang="nl"
          lang="nl"
          className="text-fg-muted underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg"
        >
          Deze pagina in het Nederlands
        </Link>
      </p>

      <Takeaway title="The short answer">
        If Outlook, Teams or a macro-heavy workbook is load-bearing, stay where
        you are. Nothing here replaces those. If what you open all day is Word,
        Excel and PowerPoint, and the annoyance is one piece of work spread over
        three files that drift apart, this replaces that and nothing else.
      </Takeaway>

      <Contents slug={SLUG} items={CONTENTS} />

      <H2 id="where-365-wins">Where Microsoft 365 is better</H2>
      <P>
        A comparison with no losses in it is an advertisement. Each of these was
        checked against the code.
      </P>

      <H3>Excel, past a certain point</H3>
      <P>
        The spreadsheet has 167 functions in one merged library, eleven of them
        finance and fifteen statistics. Nine are absent on purpose. RAND and
        RANDBETWEEN, because a cell that changes on every render cannot be
        compared with what it said a second ago. UNIQUE, SORT, FILTER and
        TRANSPOSE, because each spills into cells you did not select and there
        is no spill model here. INDIRECT and OFFSET, because they assemble a
        reference out of text while the sheet runs, blinding the cycle guard.
        And VBA: there are no macros.
      </P>
      <P>
        The ceiling is measured, not estimated. At 50,000 rows a table opens in
        0.56 seconds and a keystroke lands in 118 milliseconds. At 100,000 the
        browser refuses the write — 6.8 MB is past what it holds — and a bar
        across the app says the work is no longer being saved. Excel does just
        over a million rows a sheet. For that one component, see{" "}
        <Link
          href="/compare/excel"
          className="text-fg-muted underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg"
        >
          spreadsheets specifically, versus Excel
        </Link>
        .
      </P>

      <H3>Outlook: mail and the calendar</H3>
      <P>
        No email, no calendar. Not a thin version, not a roadmap item. For most
        people that is the larger half of what Outlook is, and it is why our own
        about page says this is not a replacement for Microsoft 365. Price a
        switch as keeping your mail where it is.
      </P>

      <H3>Teams, and two people in one paragraph</H3>
      <P>
        Chat exists as a model: channels, DMs, threads, private channels behind
        a passcode. The transport shipped under it is simulated, with scripted
        peers. Live editing is real: a session opens for a project you shared,
        and prose merges character by character through a CRDT — two people in
        the same paragraph at the same second both keep their words, and both
        screens end up identical. A dropped message repairs itself within a
        couple of seconds rather than leaving the two of you quietly apart.
      </P>
      <P>
        Two limits worth having in writing. Boards, spreadsheets and slides are
        still synced per item, newest wins — the merge is on prose. And the
        merge state is built when a document opens rather than stored, so it
        survives a disconnect but not a reload: two people editing the same
        paragraph offline for a day, each reloading before they reconnect,
        still end up with the newer version rather than both.
      </P>

      <H3>Administration an IT department can sign off</H3>
      <P>
        Admin is real here — audit log, members, roles, retention, purge with a
        preview — and works against a configured database only. With none, every
        call returns a setup notice explaining why: an audit log of a browser is
        a log of one person&apos;s own actions, kept and deletable by that
        person. Single sign-on is a hand-off, not an implementation, and there
        is no SCIM. Provisioning two thousand students describes
        Microsoft&apos;s product, not this one.
      </P>

      <H3>Desktop applications</H3>
      <P>
        Word and Excel open a file from your disk with no network involved. Here
        there is an installable PWA: navigations are network-first, so offline
        you get the last known shell, and anything under /api is never cached,
        so one account&apos;s AI answer cannot be replayed to whoever opens the
        browser next. No native build exists. Both sides are in{" "}
        <Link
          href="/guides/work-offline"
          className="text-fg-muted underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg"
        >
          keeping documents editable offline
        </Link>
        .
      </P>

      <H2 id="where-one-workspace-wins">Where one workspace wins</H2>

      <H3>One document model instead of four files</H3>
      <P>
        A project is not a file. It opens as one canvas of blocks, in nine
        kinds: text, table, chart, slides, code, image, bibliography, contents
        and form. A chart holds the id of the table it reads from, so the two
        are one piece of data seen twice, not a spreadsheet and a picture of a
        spreadsheet that stopped agreeing in March. The contents page is derived
        on every render and never stored. Footnotes number themselves in
        document order. Figure and table captions run as two sequences and
        renumber when you insert one in the middle.
      </P>

      <H3>One subscription, not a seat for everyone who opens a file</H3>
      <P>
        Microsoft 365 is licensed per person. Pro here is €14 a month and is not
        billed per seat. What it buys is the AI allowance — 3,000 credits a
        month and then metered, against the free plan&apos;s 200. Projects,
        boards, sources, citations, version history and Word and PowerPoint
        import all work on the free plan today. Team is €24 a seat, 6,000
        credits pooled. An invariant in the
        config keeps that honest — a plan&apos;s allowance is worth less than
        the plan, so seats can never be a cheaper way to buy credits.
      </P>

      <H3>It opens with no account</H3>
      <P>
        The free plan has no login. Your workspace lives in the browser, which
        is the whole promise and the whole risk: browsers evict best-effort
        storage under pressure without warning. So the app asks for persistent
        storage, says how much room is left before it matters, and exports
        everything — fonts and pictures in IndexedDB included — to one file you
        can restore anywhere. A view link puts the document in the URL fragment,
        which is never sent to a server.
      </P>

      <H3>Real .docx, .xlsx and .pptx, in and out</H3>
      <P>
        Import reads .docx including footnotes and w:ins/w:del tracked changes,
        which arrive as proposals you accept or reject one at a time. It reads
        .xlsx and .pptx, and CSV with quoted fields, CRLF, a BOM and delimiter
        sniffing across comma, semicolon, tab and pipe. Export writes real OOXML
        rather than Word-flavoured HTML with a .doc extension: footnotes at the
        foot of the page, tracked changes reviewable in Word, a header and
        footer with a PAGE field, a TOC field. One gap on the way in: PowerPoint
        import drops theme, images, positioning and animations and keeps text,
        bullets and speaker notes, because a half-copy of a layout looks broken.
      </P>

      <H2 id="side-by-side">Side by side</H2>
      <P>
        Six of these twelve rows go to Microsoft. The same exercise against
        Google is in{" "}
        <Link
          href="/compare/google-workspace"
          className="text-fg-muted underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg"
        >
          the same comparison against Google Workspace
        </Link>
        .
      </P>
      <Table
        caption="Microsoft 365 and Tougather on the twelve things people check first."
        columns={COLUMNS}
        rows={ROWS}
        minWidth={640}
      />

      <H2 id="price">What each one costs</H2>
      <P>
        Microsoft&apos;s price depends on the plan and the country, so take it
        from their page. This side is fixed. Free is €0 and includes 200 AI
        credits a month, which stop rather than becoming an invoice. Pro is €14
        a month. Team is €24 a seat, so five seats is €1,440 a year and twenty
        is €5,760. Metered AI is €3 per 1,000 credits, marked provisional and
        rendered with a visible marker until usage data sets it.
      </P>
      <P>
        And what a comparison page ought to admit: you cannot pay us yet. Every
        Stripe price ID is null, on purpose — an invented one would look
        configured and fail at the counter. The free plan is what runs today.
      </P>

      <H2 id="do-not-switch">Who should not switch</H2>
      <P>
        Stay on Microsoft 365 if your workbook runs macros, if you work past
        fifty thousand rows, if two of you drag the same board around at once,
        if your institution needs SSO, or if Outlook is the reason the licence
        exists. Those are consequences of keeping your work in your own browser,
        not gaps being quietly closed.
      </P>
      <P>
        Who this is for: a student whose thesis numbers, chapters and defence
        deck keep drifting apart, and a four-person company paying five licences
        to write one proposal.{" "}
        <Link
          href="/compare"
          className="text-fg-muted underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg"
        >
          All our tool comparisons
        </Link>{" "}
        has the full set, and{" "}
        <Link
          href="/guides/spreadsheet-formulas"
          className="text-fg-muted underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg"
        >
          the formulas you&apos;d use in either tool
        </Link>{" "}
        work the same on both sides of that table.
      </P>

      <H2 id="faq">Questions people ask first</H2>
      <FAQ items={FAQS} />

      <CallToAction href="/library" label="Start writing">
        No login, nothing to cancel. Open a project, paste in a .docx and an
        .xlsx you already have, and see whether the seams are still there.
      </CallToAction>

      <RelatedPages slug={SLUG} />
    </PageShell>
  );
}
