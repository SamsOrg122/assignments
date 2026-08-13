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

const SLUG = "/compare/notion" as const;

export const metadata = pageMetadata(SLUG);

const TOC: TocItem[] = [
  { id: "where-notion-wins", label: "Where Notion wins" },
  { id: "formulas", label: "A formula engine, not formula properties" },
  { id: "slides", label: "Slides, and a second screen" },
  { id: "paper", label: "A page that prints" },
  { id: "no-account", label: "No account, no server" },
  { id: "side-by-side", label: "Side by side" },
  { id: "who-should-stay", label: "Who should stay on Notion" },
  { id: "faq", label: "Questions people ask" },
];

const FAQS: FaqItem[] = [
  {
    question: "Does Tougather have databases like Notion?",
    answer:
      "No, plainly. A table here is a spreadsheet table with eight column types — text, number, currency, percent, date, checkbox, select and formula — plus sort, filters, conditional formatting and validation. There is no relation property, no rollup, and no second view of the same rows as a board or a calendar. If linked databases are why you opened Notion, nothing on this page makes up for that.",
  },
  {
    question: "Can I write real spreadsheet formulas in Tougather?",
    answer:
      "Yes. 167 functions in one library, covering maths, aggregates, logic, conditional aggregates, lookup, text, dates, type predicates, finance and statistics. You get A1 ranges with dollar-pinned refs that survive a fill, per-cell formulas alongside column rules, cross-table references such as Costs!B2:B40, named ranges and Excel's error codes. Nine functions are absent on purpose: RAND, RANDBETWEEN, UNIQUE, SORT, FILTER, TRANSPOSE, INDIRECT, OFFSET and VBA.",
  },
  {
    question: "Can Tougather present a deck, and is there a presenter view?",
    answer:
      "Yes. Decks have a slide master, builds by bullet or by object, and read and write .pptx with speaker notes. Presenter view is a second window with your notes, a clock and the slide coming next, and the audience window stays the authority on position. The limit: it runs over BroadcastChannel, so it is two windows of the same browser on one machine, not a phone driving a laptop.",
  },
  {
    question: "Does Tougather work offline?",
    answer:
      "Yes, with nothing to switch on first. The work is in this browser's local storage to begin with, so the only thing that ever needed a network was the app itself, and a service worker serves navigations network-first with a cached shell behind them. Notion has offline support too: recently visited pages are available automatically and anything else can be marked Available offline in advance \u2014 but what you never opened and never marked will not open.",
  },
  {
    question: "Can I import my Notion pages?",
    answer:
      "Partly, and less than you would like. There is no Markdown or HTML importer, so an exported Notion page does not arrive as a page. A database exported as CSV does import as a table, with the delimiter sniffed across comma, semicolon, tab and pipe. Relations and rollups have nothing here to land in, so plan on rebuilding them.",
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

export default function NotionComparisonPage() {
  return (
    <PageShell
      eyebrow="Compare"
      title={page(SLUG).h1}
      lead="Notion is the closest neighbour in shape: one workspace, blocks rather than files, a page instead of a folder. Because the shapes are alike, the differences are narrow — so this page states them precisely, in both directions."
    >
      <JsonLd
        data={[breadcrumbJsonLd(SLUG), pageJsonLd(SLUG), faqJsonLd(FAQS)]}
      />
      <Breadcrumbs slug={SLUG} />

      <p className="mb-8 text-[12.5px] text-fg-subtle">
        <Link
          href="/nl/vergelijk/notion"
          hrefLang="nl"
          lang="nl"
          className="text-fg-muted underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg"
        >
          Deze pagina in het Nederlands
        </Link>
      </p>

      <Contents slug={SLUG} items={TOC} />

      <Takeaway title="The short version">
        Notion wins on databases, relations and rollups, on a template gallery
        years deep, and on sharing an IT department already understands.
        Tougather wins on a formula engine with A1 addressing and cross-table
        references, slides with a presenter view, a page that prints and exports
        to Word, and work that opens with no account at all.
      </Takeaway>

      <H2 id="where-notion-wins">Where Notion wins</H2>
      <P>
        Starting with the losses, because a comparison without any is an advert.
      </P>

      <H3 id="databases">Databases, relations and rollups</H3>
      <P>
        This is the real one. A Notion relation joins two databases, a rollup
        reads a value back across the join, and the same rows appear as a table,
        a board, a calendar or a gallery. None of that is here. A table in
        Tougather is a spreadsheet table: eight column types — text, number,
        currency, percent, date, checkbox, select and formula — with sort,
        filters, conditional formatting and per-column validation, and one view,
        the grid. Kanban exists, but as a board template of stickies, not as a
        second view of your rows. The nearest thing to a relation is a formula
        reaching into another table, which is worse at what relations are good
        at: following a link from one record to another and back.
      </P>

      <H3 id="templates">A template gallery years deep</H3>
      <P>
        Notion&apos;s templates are thousands of pages of other people&apos;s
        work, and for some readers that is the product. Tougather ships six
        project templates and six board templates, plus what you save out of
        your own projects. Six is not a gallery.
      </P>

      <H3 id="sharing">Sharing that is already approved</H3>
      <P>
        Notion shares per person, per group and per guest, and publishes a page
        to the web. Tougather shares per link, and the document travels inside
        the URL fragment — the part after the <code>#</code> that browsers never
        send to a server. That makes a link genuinely private and genuinely
        unrevokable at once: whoever holds it holds the document. There is an
        admin surface, but it runs only against a real database, and with none
        configured every call returns a setup notice.
      </P>

      <H3 id="apps">Native apps and a public API</H3>
      <P>
        Notion has desktop and mobile apps and an API a whole integration
        industry sits on. Here there is an installable PWA and no native build —
        no React Native, Capacitor, Expo, Electron or Tauri in{" "}
        <code>package.json</code>. The four API routes cover AI, checkout, the
        collaboration relay and config; none lets another program read a
        project.
      </P>

      <H2 id="formulas">A formula engine, not formula properties</H2>
      <P>
        A Notion formula is an expression over one row&apos;s properties.
        Useful, and not a spreadsheet: there is no cell to point at, so no{" "}
        <code>B2</code>, no rectangle, and no way to say &ldquo;this column,
        forty rows down, in the other table&rdquo; unless a relation is already
        there.
      </P>
      <P>
        Here it is a grid with 167 functions in one library — maths, aggregates,
        logic, conditional aggregates, lookup, text, dates, type predicates,
        finance, statistics. Addressing is A1, and a fill preserves what you
        pinned: <code>=B$2*$C2</code> dragged anywhere keeps both halves,
        rewritten over your source text so spacing and capitalisation survive.
        Every table in a project is also a sheet, so <code>Costs!B2:B40</code>{" "}
        and <code>[Costs]![Amount]</code> reach across tables in the same
        document. A cell asked for while it is still computing returns{" "}
        <code>#CYCLE!</code> instead of hanging the tab.
      </P>
      <P>
        Nine functions are absent on purpose, each answering with its reason rather
        than a bare <code>#NAME?</code>: <code>RAND</code>, <code>RANDBETWEEN</code>,{" "}
        <code>UNIQUE</code>, <code>SORT</code>, <code>FILTER</code>,{" "}
        <code>TRANSPOSE</code>, <code>INDIRECT</code>, <code>OFFSET</code> and
        VBA. Four need a spill model this does not have, two would build
        references at run time and blind the cycle guard, and macros are refused
        because repeating something over every row is what a formula column
        already is. If a spreadsheet is most of what you want,{" "}
        <A href="/compare/excel">if it&apos;s mainly a spreadsheet you need</A>{" "}
        is the closer comparison.
      </P>

      <H2 id="slides">Slides, and a second screen</H2>
      <P>
        Notion has no slide editor. People build decks out of pages and present
        them full screen, or they leave for Google Slides. Here a deck is a
        block in the same project as the document and the table, with a master
        carrying logo, footer, slide numbers and background to every slide that
        does not opt out. Builds reveal by bullet, by object, by both or not at
        all — the whole animation model, because anything more is something you
        operate while also talking.
      </P>
      <P>
        Presenter view is a second window with your notes, a clock you start and
        reset, and the slide coming next. The audience window stays the
        authority on position and the presenter window only sends requests, so
        the two cannot disagree. Know the limit first: it runs over{" "}
        <code>BroadcastChannel</code>, so it is two windows of the same browser
        on one machine, not a phone driving a laptop. Decks read and write .pptx
        with speaker notes, though an import drops theme, images, positioning
        and animations rather than half-copying them. For what belongs on the
        slides,{" "}
        <A href="/guides/pitch-deck">
          building a deck when your tool has no slides
        </A>{" "}
        has the outline.
      </P>

      <H2 id="paper">A page that prints</H2>
      <P>
        A Notion page is a web page: it is as long as it is, and paper happens
        to it afterwards. A thesis or a client report is page-shaped first,
        usually stated as &ldquo;A4, 2.5 cm margins, page number bottom
        right&rdquo;. So there is a page setup here: A4, Letter or Legal,
        portrait or landscape, margins in millimetres, page numbers in the
        footer or header. Half of that works in a browser print, and the code
        says which half. Size, orientation and margins ride on{" "}
        <code>@page</code>; headers, footers and page numbers do not work in a
        browser print at all, because CSS margin boxes are unimplemented in
        every shipping engine. They go into the Word export instead of being a
        setting that silently does nothing.
      </P>
      <P>
        That export is real OOXML: footnotes Word lays out on the page,{" "}
        <code>w:ins</code> and <code>w:del</code> tracked changes it can review,
        a header with a page field, a table-of-contents field. Reading .docx
        goes the other way and brings tracked changes in as proposals you accept
        or reject. Around it sit numbered footnotes, a contents list derived
        rather than stored, and citations in APA 7, MLA 9, Chicago and Harvard.
        The gaps are nearby: PDF export is <code>window.print()</code> into a
        clean popup rather than a generated file, equations reach Word as LaTeX
        rather than OMML, and PDF import does not exist.
      </P>

      <H2 id="no-account">No account, no server</H2>
      <P>
        Notion is an account first. Here the free plan has no login: you open
        the app and the work goes into this browser&apos;s local storage. Nobody
        can read it, including us, because there is nowhere to read it from —
        and that same sentence is the risk, because nothing is backed up and
        clearing your browser data deletes it.
      </P>
      <P>
        Three things push back: the app asks the browser for persistent storage,
        it estimates the room left, and it exports one backup file holding every
        store plus the fonts and pictures in IndexedDB. The ceiling is measured
        rather than guessed — 50,000 rows is 3.4 MB and opens in 0.56 s, and
        100,000 rows is refused because browser storage is full. Offline follows
        from all this rather than being bolted on;{" "}
        <A href="/guides/work-offline">Notion&apos;s offline limits, explained</A>{" "}
        sets both side by side.
      </P>

      <H2 id="side-by-side">Side by side</H2>
      <Table
        caption="Notion and Tougather, row by row. Several rows are losses."
        columns={["", "Notion", "Tougather"]}
        minWidth={660}
        rows={[
          [
            "Databases and relations",
            "Relations, rollups, and the same rows as a board or calendar.",
            "None. A spreadsheet grid, eight column types, one view.",
          ],
          [
            "Templates",
            "A public gallery years deep.",
            "Six project templates, six board templates, plus what you save.",
          ],
          [
            "Sharing",
            "Per person, group and guest, plus a public web page.",
            "Per link, carried in the URL fragment, which browsers never send to a server.",
          ],
          [
            "Apps and integrations",
            "Desktop and mobile apps, and a public API.",
            "An installable PWA. Nothing native, no public API.",
          ],
          [
            "Formulas",
            "Expressions over one row's properties.",
            "167 functions, A1 ranges, pinning that survives a fill, cross-table refs.",
          ],
          [
            "Slides",
            "No slide editor.",
            "Decks with a master and builds, .pptx both ways, presenter view.",
          ],
          [
            "Word files",
            "Exports PDF, HTML, Markdown and CSV.",
            ".docx both ways, with footnotes and tracked changes.",
          ],
          [
            "Printing on paper",
            "Export a PDF and hope.",
            "A4/Letter/Legal, margins in mm. Page numbers are Word-only.",
          ],
          [
            "Account required",
            "Yes, to open anything.",
            "No. The free plan has no login.",
          ],
          [
            "How much it holds",
            "Server-side, so size is Notion's problem.",
            "50,000 rows measured comfortable. 100,000 refused — storage full.",
          ],
        ]}
      />

      <H2 id="who-should-stay">Who should stay on Notion</H2>
      <P>The cases where switching would cost you something real:</P>
      <List
        items={[
          "Your workspace is built on linked databases. Relations and rollups have no equivalent here.",
          "You read the same rows as a board and a calendar. There is one view, and it is the grid.",
          "Gallery templates are how you start every project.",
          "An IT department has to approve the tool, or people outside your team need access per person.",
          "You depend on the API, on native mobile, or on tools that sync into Notion.",
        ]}
      />
      <P>
        Where this fits is narrower: one document holding numbers you can
        compute, slides you can present and a page you can hand in, without an
        account and without a connection. If the question is broader than these
        two tools, we keep{" "}
        <A href="/compare">every comparison in one place</A>, including{" "}
        <A href="/compare/google-workspace">Google Workspace compared</A>.
      </P>

      <H2 id="faq">Questions people ask</H2>
      <FAQ items={FAQS} />

      <CallToAction href="/library" label="Start writing">
        No account, nothing to install. Put a table and a deck in the same
        document, and see whether the seams you worked around were necessary.
      </CallToAction>

      <RelatedPages slug={SLUG} />
    </PageShell>
  );
}
