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

const SLUG = "/compare/excel" as const;

export const metadata = pageMetadata(SLUG);

const CONTENTS: TocItem[] = [
  { id: "where-excel-wins", label: "Where Excel is better" },
  { id: "where-this-wins", label: "Where this one wins" },
  { id: "side-by-side", label: "Side by side" },
  { id: "files", label: "What crosses when you open a file" },
  { id: "keep-excel", label: "Who should keep Excel" },
  { id: "faq", label: "Questions people ask first" },
];

const FAQS: FaqItem[] = [
  {
    question: "Does Tougather support VLOOKUP and XLOOKUP?",
    answer:
      "Both, along with INDEX, MATCH, XMATCH, HLOOKUP, SUMIF, SUMIFS, COUNTIF, COUNTIFS, IFERROR and IFNA — 167 functions in all, 11 of them finance and 15 statistics. Nine names are refused on purpose and say why when you type them: RAND, RANDBETWEEN, UNIQUE, SORT, FILTER, TRANSPOSE, INDIRECT, OFFSET and VBA.",
  },
  {
    question: "Will my .xlsx file look the same after importing it?",
    answer:
      "No. The import reads cell values, plus the date formats out of styles.xml so date serials come back as dates. It does not read formulas, conditional formatting, charts, pivot definitions or macros. A cell holding =B2*C2 arrives as the number it last computed to, so open a copy and check before deleting the original.",
  },
  {
    question: "How large a spreadsheet can Tougather handle?",
    answer:
      "Fifty thousand rows was measured comfortable: 3.4 MB stored, 0.56 seconds to open, 118 milliseconds from keystroke to screen. At a hundred thousand the workspace is 6.8 MB and the browser refuses the write, and a bar across the app says so. Excel does just over a million rows a sheet.",
  },
  {
    question: "Can I keep using Excel alongside Tougather?",
    answer:
      "Yes, and for some work you should. Export any table to .xlsx or CSV when you need something only Excel does. One caveat: a formula column is written out as the numbers it computed, so what you hand over is values rather than a live model.",
  },
];

const COLUMNS = ["", "Excel", "Tougather"];

const ROWS = [
  ["Functions", "More, and more keep arriving", "167 in one merged library"],
  ["Macros and VBA", "A whole scripting runtime", "None. Nothing here runs them"],
  [
    "Spilling arrays",
    "UNIQUE, SORT, FILTER, TRANSPOSE",
    "No spill model. Use a pivot, or SUMIFS",
  ],
  [
    "Volatile functions",
    "Recalculate on their own",
    "None. NOW is read when the sheet computes",
  ],
  ["INDIRECT and OFFSET", "Both", "Neither. INDEX with a range covers most uses"],
  [
    "Rows in one sheet",
    "Just over a million",
    "50,000 measured comfortable; 100,000 refused",
  ],
  ["Formulas inside .xlsx", "Round-trip intact", "Values only, in both directions"],
  [
    "Pivot tables",
    "Slicers, external sources, snapshots",
    "7 aggregates, 5 date buckets, re-derived every render",
  ],
  [
    "One formula for a column",
    "Filled down, one copy per row",
    "A rule on the column; the per-cell form works too",
  ],
  [
    "Across sheets",
    "Sheet!A1, inside one workbook file",
    "Costs!B2:B40 and [Costs]![Amount], no separate file",
  ],
  ["A failing cell", "Validation blocks the entry", "The value is kept and marked"],
  [
    "Price",
    "Part of Microsoft 365, licensed per person",
    "€0, €14 a month, or €24 a seat",
  ],
];

export default function CompareExcelPage() {
  const entry = page(SLUG);
  const nl = counterparts(SLUG).nl;

  return (
    <PageShell
      eyebrow="Compare"
      title={entry.h1}
      lead="Excel is the deepest spreadsheet there is. This is 167 functions in a browser tab, inside a document. Here is where that gap is real — measured rather than estimated — and the shorter list of places the trade runs the other way."
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
        If you build financial models, keep Excel. Models run on scenario
        switches, dynamic arrays and a sheet that recalculates itself, and none
        of that machinery is here. This replaces the other spreadsheet: the
        table that belongs inside a document, whose numbers end up in a chart, a
        paragraph and a slide that stop agreeing.
      </Takeaway>

      <Contents slug={SLUG} items={CONTENTS} />

      <H2 id="where-excel-wins">Where Excel is better</H2>
      <P>
        A comparison with no losses in it is an advertisement. Every line below
        was read out of the code.
      </P>

      <H3>Nine functions, refused by name</H3>
      <P>
        The library is 167 functions merged from two files. Nine names are
        deliberately absent, and typing one gets the reason rather than a bare
        <code>#NAME?</code> — in the column formula editor before you run it,
        and in the error itself when you type one into a cell. RAND and RANDBETWEEN: a cell that changes on
        every render cannot be compared with what it said a second ago. UNIQUE,
        SORT, FILTER and TRANSPOSE: each spills into cells you did not select,
        and there is no spill model here — the grid has no notion of one formula
        owning a rectangle. INDIRECT and OFFSET: both build a reference out of
        text while the sheet runs, blinding the cycle guard to dependencies
        before it evaluates them.
      </P>
      <P>
        There is no volatile-function model either, which is a larger absence
        than a list of nine names looks. NOW is implemented, but read once when
        the sheet computes rather than ticking. Nothing here recalculates on a
        clock.
      </P>

      <H3>Macros and VBA</H3>
      <P>
        There are no macros. The reason is one line in the code: what a macro
        usually automates — repeat this over every row — is what a formula
        column already is. That is sound for the common case and covers nothing
        else. A button that rebuilds a report, an add-in that calls an internal
        system, a userform somebody in finance wrote years ago: real work Excel
        does, and nothing here runs it. If the file ends in <code>.xlsm</code>,
        this is not where it goes.
      </P>

      <H3>Fifty thousand rows, and what happens past that</H3>
      <P>
        The ceiling was measured with a script, not estimated. Fifty thousand
        rows is 3.4 MB stored, opens in 0.56 seconds, and puts a keystroke on
        screen in 118 milliseconds. At a hundred thousand the workspace is 6.8 MB
        and the browser refuses the write outright: the storage it gives a page
        is full.
      </P>
      <P>
        Which thing broke matters. Rendering and scrolling are comfortable at
        fifty thousand, and the address parser takes three column letters and
        seven row digits, so addressing was never the limit. Storage is — the
        price of work that lives in your own browser. A refused write raises a
        bar across the app saying the work on screen is no longer being saved.
        Excel does just over a million rows a sheet.
      </P>

      <H3>Formulas do not survive the file</H3>
      <P>
        This one costs people most and is easiest to miss. The .xlsx import reads
        cell values, and the date formats out of <code>styles.xml</code> so date
        serials come back as dates. It does not read the formula element at all.
        Export runs the same way: a formula column is written out as the numbers
        it computed. So <code>=B2*C2</code> goes in as 4200 and comes back out as
        4200, and the workbook you hand a colleague is values, not a live model.
      </P>

      <H3>Financial models</H3>
      <P>
        Plainly: somebody building a financial model keeps Excel. A
        three-statement model is scenario switches, a recalculation loop,
        dynamic arrays and add-ins, and it gets checked by people who open it in
        Excel and expect the formulas to still be there. The eleven finance
        functions here — PMT, FV, PV, NPER, RATE, NPV, IRR, SLN, SYD, EFFECT and
        NOMINAL — will do a loan schedule. They will not do a model.
      </P>

      <H2 id="where-this-wins">Where this one wins</H2>

      <H3>A formula is a rule about a column</H3>
      <P>
        In Excel a column of formulas is a thousand copies of one idea, and the
        interesting bugs live in the four rows where somebody edited a copy. Here
        the column carries the formula and every row computes it against its own
        values. The per-cell form works too — type <code>=B2*C2</code> into a
        cell and it evaluates — and where both exist the column wins, because a
        rule any single cell can override is not a rule. Fill still behaves:{" "}
        <code>=B$2*$C2</code> dragged anywhere keeps the halves you pinned,
        rewritten over your own source text so spacing and capitalisation
        survive.
      </P>

      <H3>Every table is a sheet</H3>
      <P>
        There is no separate workbook file: every table in a project is already
        addressable as a sheet by its title. <code>Costs!B2:B40</code> and{" "}
        <code>[Costs]![Amount]</code> both work, and two tables sharing a title
        get numbered rather than resolved by a coin flip. A formula column may
        reference another; a cell asked for while it is already computing returns{" "}
        <code>#CYCLE!</code> rather than hanging the tab.
      </P>

      <H3>Pivots that cannot go stale</H3>
      <P>
        A pivot here is a table block carrying a spec, re-derived from its source
        every render. Seven aggregates, five date buckets — day, week, month,
        quarter, year — and optional totals. Because it is a table, sorting,
        charts and .docx and .xlsx export already work on it. The trade: no
        slicers, no external sources, no snapshot you can freeze.
      </P>
      <P>
        Column validation goes the other way from Excel&apos;s. Required, number,
        date, email, url, bounds, length, uniqueness and an arbitrary formula
        over the row all exist, but a failing cell is kept and marked rather than
        refused — a rule that throws away typing loses work on the day the rule
        is wrong.
      </P>

      <H2 id="side-by-side">Side by side</H2>
      <P>
        Eight of these twelve rows go to Excel, which is the honest shape of a
        spreadsheet comparison against the spreadsheet. The rest of the suite is
        in{" "}
        <Link
          href="/compare/microsoft-365"
          className="text-fg-muted underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg"
        >
          the full Microsoft 365 comparison
        </Link>
        , and{" "}
        <Link
          href="/compare/google-workspace"
          className="text-fg-muted underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg"
        >
          how Google Sheets compares
        </Link>{" "}
        is the closer fight.
      </P>
      <Table
        caption="Excel and Tougather on the twelve things a spreadsheet user checks first."
        columns={COLUMNS}
        rows={ROWS}
        minWidth={640}
      />

      <H2 id="files">What crosses when you open a file</H2>
      <P>
        CSV is the better road in: the parser sniffs the delimiter across comma,
        semicolon, tab and pipe, and handles quoted fields, doubled quotes, CRLF
        and a byte-order mark. Going out, sheet names are sanitised the way Excel
        demands — five forbidden characters replaced, 31 characters maximum, no
        two differing only in case. What comes back is a real .xlsx, but not your
        original workbook. Function names are identical on both sides, so{" "}
        <Link
          href="/guides/spreadsheet-formulas"
          className="text-fg-muted underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg"
        >
          the 20 formulas you&apos;ll actually use
        </Link>{" "}
        apply either way.
      </P>

      <H2 id="keep-excel">Who should keep Excel</H2>
      <P>
        Keep Excel if a workbook runs macros, if you work past fifty thousand
        rows, if you build models, if you depend on dynamic arrays or INDIRECT,
        or if the file goes to somebody who will open it in Excel and expect the
        formulas to be there. None of that is a gap being quietly closed; it
        follows from a spreadsheet that lives in a document, in your browser.
      </P>
      <P>
        This is for the other spreadsheet — the budget, the results table, the
        survey answers: numbers belonging to a document rather than a workbook,
        where the real cost is three copies that stop agreeing in March. A chart
        holds the id of the table it reads from, which is the whole reason the
        sheet sits in the document instead of beside it.{" "}
        <Link
          href="/compare"
          className="text-fg-muted underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg"
        >
          All our tool comparisons
        </Link>{" "}
        has the rest of the set.
      </P>

      <H2 id="faq">Questions people ask first</H2>
      <FAQ items={FAQS} />

      <CallToAction href="/library" label="Open a sheet">
        No login, nothing to cancel. Paste in a CSV you already have, type{" "}
        <code>=B2*C2</code> into a cell, and see whether the 167 covers what you
        actually reach for.
      </CallToAction>

      <RelatedPages slug={SLUG} />
    </PageShell>
  );
}
