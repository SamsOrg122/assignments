import Link from "next/link";
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
import { H2, List, P, PageShell } from "@/components/landing/PageShell";
import {
  type FaqItem,
  breadcrumbJsonLd,
  faqJsonLd,
  page,
  pageJsonLd,
  pageMetadata,
} from "@/lib/seo";

const SLUG = "/compare/google-workspace" as const;

export const metadata = pageMetadata(SLUG);

const TOC: TocItem[] = [
  { id: "where-google-wins", label: "Where Google Workspace wins" },
  { id: "collaboration", label: "What collaboration means here, exactly" },
  { id: "differences", label: "Four things that work differently" },
  { id: "side-by-side", label: "Side by side" },
  { id: "who-should-stay", label: "Who should stay on Google" },
  { id: "faq", label: "Questions people ask" },
];

const FAQS: FaqItem[] = [
  {
    question: "Can two people edit the same document at the same time?",
    answer:
      "Yes, with one limit worth knowing first. A live session carries presence, other people's cursors and changes sent as changes rather than whole-document snapshots. But sync is per block and last writer wins, not a CRDT: two people typing in the same paragraph at the same second overwrite each other. Different sections never collide. Google Docs merges at the character level and has no such limit.",
  },
  {
    question: "Where is my data stored?",
    answer:
      "In this browser. Every project, board, message and setting sits in local storage on the device you wrote it on, and the free plan has no login. That cuts both ways: nobody can read your work, including us, because there is nowhere to read it from — and nothing is backed up, so clearing your browser data deletes it. A database is something a deployment configures; it is not on by default.",
  },
  {
    question: "Can I import my Google Docs and Sheets?",
    answer:
      "Not directly. Export from Google as .docx, .xlsx or .csv first: all three are read, including headings, lists, tables, footnotes and Word's tracked changes, which arrive as proposed changes you accept or reject. Slides exported as .pptx bring titles, bullets and speaker notes; theme, images, positioning and animations are dropped rather than half-copied. Apps Script does not transfer, and PDFs are not read at all.",
  },
  {
    question: "Does Tougather include email like Gmail?",
    answer:
      "No. There is no email and no calendar — not a thinner version, nothing at all. If Gmail and Calendar are the main reason you pay for Google Workspace, Tougather replaces the four apps you make things in and leaves your mailbox where it is.",
  },
  {
    question: "Is there a free plan?",
    answer:
      "Yes. Free is €0 with 200 AI credits a month, which stop rather than quietly billing you; Pro is €14 a month with 3,000 credits, Team €24 a seat with 6,000 pooled. One caveat better heard from us than discovered: nothing can be charged today, because every Stripe price ID in the billing code is still empty.",
  },
];

/** The repository's inline link, so a body link matches every other one. */
function A({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="text-fg-muted underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg"
    >
      {children}
    </Link>
  );
}

export default function GoogleWorkspaceComparisonPage() {
  return (
    <PageShell
      eyebrow="Compare"
      title={page(SLUG).h1}
      lead="Google Docs, Sheets and Slides are very good at one thing in particular: several people in one file at the same time. This page says where that is still the reason to stay, and where a workspace needing no account and no connection is the better trade."
    >
      <JsonLd
        data={[breadcrumbJsonLd(SLUG), pageJsonLd(SLUG), faqJsonLd(FAQS)]}
      />
      <Breadcrumbs slug={SLUG} />

      <p className="mb-8 text-[12.5px] text-fg-subtle">
        <Link
          href="/nl/vergelijk/google-workspace"
          hrefLang="nl"
          lang="nl"
          className="text-fg-muted underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg"
        >
          Deze pagina in het Nederlands
        </Link>
      </p>

      <Contents slug={SLUG} items={TOC} />

      <Takeaway title="The short version">
        Google wins on live co-editing, on Gmail and Calendar, and on sharing
        every colleague has already used. Tougather wins on one project instead
        of four files, no login, files that leave in the format they arrived in,
        and an editor that opens without a network.
      </Takeaway>

      <H2 id="where-google-wins">Where Google Workspace wins</H2>
      <P>
        Starting with the losses, because a comparison without any is an advert.
      </P>

      <H3 id="co-editing">Live co-editing</H3>
      <P>
        Google Docs merges edits character by character; ten people can sit in
        one paragraph and nobody overwrites anybody. Tougather has a live
        session — presence, other people&apos;s cursors, changes sent as changes
        rather than snapshots — but sync is per block and last writer wins. It
        is not a CRDT: two people typing in one paragraph at the same second
        overwrite each other. Different sections never touch.
      </P>

      <H3 id="mail-and-calendar">Gmail and Calendar</H3>
      <P>
        There is no email here and no calendar. Not a thinner version — none.
        For most people that is the larger half of what they open Google for.
      </P>

      <H3 id="sharing">Sharing everybody already understands</H3>
      <P>
        Google shares per person, per group and per domain, with an admin
        console behind it. Tougather shares per link. There is an admin surface —
        audit log, members, roles, retention, purge with a preview — but it runs
        only against a real database, and with none configured every call
        returns a setup notice: an audit log of one browser is a diary,
        deletable by the person it logs.
      </P>

      <H2 id="collaboration">What collaboration means here, exactly</H2>
      <P>
        Worth being exact, because &ldquo;real-time collaboration&rdquo; can
        mean four different things. A session runs over a relay: server-sent
        events down, an ordinary POST up. It stores nothing and forgets a room
        when its last participant leaves. What travels is presence, cursor
        positions and the blocks you changed.
      </P>
      <P>
        It opens only for a project you have explicitly shared. A session holds
        an open event stream while the project is on screen, and a browser
        allows about six connections to one origin — a room per open project
        would stop the app loading anything after the sixth tab.
      </P>
      <P>
        Where it breaks is written down too. The relay&apos;s rooms live in one
        process&apos;s memory, so a serverless or autoscaled deployment puts two
        people in two processes that cannot see each other. The client proves
        the round trip with a probe before claiming to be live; if that fails,
        the session drops to BroadcastChannel — other windows of the same
        browser — and reports the downgrade.
      </P>
      <P>
        The asynchronous half is stronger. Comments anchor to a block rather
        than a character range, because a comment pinned to an offset lands on
        the wrong sentence the first time somebody edits above it. Suggestions
        are accepted or rejected across blocks nobody has opened.
      </P>

      <H2 id="differences">Four things that work differently</H2>

      <H3 id="no-account">No account</H3>
      <P>
        The free plan has no login. Nothing to sign up for and nothing to
        verify: you open the app and the work goes into this browser&apos;s
        local storage. The counterweight is a backup file that carries every
        store plus the fonts and pictures kept in IndexedDB, restorable in any
        browser.
      </P>

      <H3 id="offline">Offline is a state, not a fallback</H3>
      <P>
        In Google Docs, offline is a setting you had to switch on before the
        connection went: Chrome or Edge, the extension, each file marked in
        advance. Here the work is local to begin with, so the only thing that
        ever needed a network was the app itself. The service worker handles
        that: navigations network-first with a cached shell behind them, hashed
        assets cache-first, and <code>/api/…</code> never cached at all, so a
        row fetched for one account is not replayed to the next person on that
        browser. See also{" "}
        <A href="/guides/work-offline">how offline mode works in Google Docs</A>
        .
      </P>

      <H3 id="one-project">One project instead of four files</H3>
      <P>
        A thesis in Google Workspace is a Doc, a Sheet, a Slides file and
        whatever whiteboard you settled on — four files that drift apart the
        moment you copy a number between them. Here they are blocks in one
        project, and a chart reads from its table by id, so there is one copy of
        the data. Every table is also a sheet, so <code>Costs!B2:B40</code> and{" "}
        <code>[Costs]![Amount]</code> address other tables in the same project.
        A pivot re-derives from its source on every render and is itself a table
        block, so charts, sorting and export work on it for free.
      </P>

      <H3 id="file-formats">Files leave in the format they arrived in</H3>
      <P>
        Word files are real OOXML both ways: footnotes Word lays out on the
        page, <code>w:ins</code> and <code>w:del</code> tracked changes it can
        review, a header with a page field, a table-of-contents field.
        Spreadsheets read and write .xlsx with sheet-name sanitising and date
        serials; CSV handles quoted fields, CRLF, a BOM and delimiter sniffing
        across comma, semicolon, tab and pipe. Decks read and write .pptx with
        speaker notes.
      </P>
      <P>
        The gaps sit in the same place. PDF export is{" "}
        <code>window.print()</code> into a clean popup rather than a generated
        file, and page numbers do not survive it: CSS margin boxes are
        unimplemented in every shipping engine, so they go into the Word export
        instead. PDF import does not exist at all.
      </P>

      <H2 id="side-by-side">Side by side</H2>
      <Table
        caption="Google Workspace and Tougather, row by row. Several rows are losses."
        columns={["", "Google Workspace", "Tougather"]}
        minWidth={640}
        rows={[
          [
            "Two people in one paragraph",
            "Merged character by character.",
            "Overwrites. Per block, last writer wins; different sections never collide.",
          ],
          [
            "Email and calendar",
            "Gmail and Calendar.",
            "None at all. Keep the mailbox you have.",
          ],
          [
            "Sharing",
            "Per person, group and domain, with an admin console.",
            "Per link. The document rides in the URL fragment, which browsers never send to a server.",
          ],
          [
            "Account required",
            "A Google account, for everyone involved.",
            "None. The free plan has no login.",
          ],
          [
            "Offline",
            "Chrome or Edge, the offline extension, files marked in advance.",
            "The app opens from cache; the work was already local.",
          ],
          [
            "Spreadsheet functions",
            "More than we have, plus Apps Script for the rest.",
            "167 in one library. No macros, no spill; 9 absences named with a reason.",
          ],
          [
            "Sheet size",
            "Server-side, so a big sheet is Google's problem, not your laptop's.",
            "50,000 rows measured comfortable. 100,000 refused — browser storage full.",
          ],
          [
            "Files in and out",
            "Exports .docx, .xlsx, .pptx and PDF; Drive opens PDFs.",
            ".docx, .xlsx, .csv, .pptx both ways, plus .html and .md out. PDF in is unsupported.",
          ],
          [
            "Admin, audit log, SSO",
            "Admin console, audit log, device management, single sign-on.",
            "Needs a database; SSO hands off to the providers a deployment names.",
          ],
        ]}
      />

      <H2 id="who-should-stay">Who should stay on Google</H2>
      <P>The cases where switching would cost you something real:</P>
      <List
        items={[
          "Two of you routinely write into the same paragraph at once. Nothing here compensates for that.",
          "Gmail and Calendar are the centre of your day — you would keep paying Google anyway.",
          "An IT department has to approve it. Without a database there is no organisation-wide administration to show them.",
          "Your sheets run past fifty thousand rows. A hundred thousand is refused outright, and paging rows individually is a different storage model, not a setting.",
          "You depend on Apps Script, or on reading PDFs where they sit.",
        ]}
      />
      <P>
        Where it fits is narrower: one person, or a small group who mostly work
        in different sections of the same thing. If the question is broader than
        this one tool, we keep{" "}
        <A href="/compare">every comparison in one place</A>, including{" "}
        <A href="/compare/microsoft-365">how Microsoft 365 compares</A> and{" "}
        <A href="/compare/notion">Notion compared</A>.
      </P>

      <H2 id="faq">Questions people ask</H2>
      <FAQ items={FAQS} />

      <CallToAction href="/library" label="Start writing">
        No account, nothing to install. Open a project, paste a table in, and
        see whether one place beats four.
      </CallToAction>

      <RelatedPages slug={SLUG} />
    </PageShell>
  );
}
