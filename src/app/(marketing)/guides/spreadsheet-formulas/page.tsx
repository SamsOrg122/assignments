import Link from "next/link";
import {
  Breadcrumbs,
  CallToAction,
  Contents,
  FAQ,
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

const SLUG = "/guides/spreadsheet-formulas" as const;

export const metadata = pageMetadata(SLUG);

const TOC: TocItem[] = [
  { id: "the-sheet", label: "The sheet these examples run against" },
  { id: "sum", label: "SUM and AVERAGE" },
  { id: "sumif", label: "SUMIF and SUMIFS" },
  { id: "countif", label: "COUNTIF and COUNTIFS" },
  { id: "if", label: "IF, IFS and IFERROR" },
  { id: "vlookup", label: "VLOOKUP and XLOOKUP" },
  { id: "index-match", label: "INDEX and MATCH" },
  { id: "text", label: "TEXT" },
  { id: "dates", label: "The date functions" },
  { id: "pmt-npv", label: "PMT and NPV" },
  { id: "correl", label: "CORREL" },
  { id: "absent", label: "What is not here, and why" },
  { id: "faq", label: "Questions people ask" },
];

const FAQS: FaqItem[] = [
  {
    question: "What's the difference between VLOOKUP and XLOOKUP?",
    answer:
      "XLOOKUP takes the column you search and the column you want back as two separate arguments, so nothing counts positions and an inserted column breaks nothing. Its fourth argument is the value to show when there is no match. VLOOKUP counts columns inside one rectangle and can only look right. Here, both match exactly.",
  },
  {
    question: "Why does my formula show #REF! or #N/A?",
    answer:
      "#REF! means the address points outside the table, or names a table this project does not have. #N/A means a lookup ran and found nothing: wrap it in IFNA, or give XLOOKUP a fourth argument. There is also #CYCLE!, for a formula that ends up asking for itself.",
  },
  {
    question: "How do I add up only some of the rows?",
    answer:
      "SUMIF for one condition, SUMIFS for several. Watch the order, because it flips: SUMIF takes the range you add last, SUMIFS takes it first. Criteria are plain strings and work on dates too, so >=2026-03-01 against a date column adds March onwards.",
  },
  {
    question: "Do Excel formulas work in Tougather?",
    answer:
      "Most of them. There are 167 functions, and nine are absent on purpose: RAND, RANDBETWEEN, UNIQUE, SORT, FILTER, TRANSPOSE, INDIRECT, OFFSET and macros. Three behave differently rather than being missing — VLOOKUP and MATCH always match exactly, INDEX takes one index rather than a row and a column, and TEXT covers decimals, thousands and percent only. Names are English, but a semicolon between arguments works as well as a comma.",
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

/** Inline code. `children` is a string prop, so quotes need no escaping. */
function C({ children }: { children: string }) {
  return <code className="font-mono text-[13.5px] text-fg">{children}</code>;
}

/**
 * One worked example: the formula, and what it actually returned.
 *
 * Both are string props rather than JSX text. Every formula here contains
 * quotation marks, and a string prop is JavaScript, so it carries them
 * literally instead of needing an entity that would be wrong to copy.
 */
function Fx({ code, is }: { code: string; is: string }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-md border border-line bg-surface px-3.5 py-3">
      <pre className="font-mono text-[12.5px] leading-relaxed text-fg">
        <code>{code}</code>
      </pre>
      <p className="mt-1.5 font-mono text-[12px] leading-relaxed text-fg-subtle">
        {is}
      </p>
    </div>
  );
}

export default function SpreadsheetFormulasGuidePage() {
  return (
    <PageShell
      eyebrow="Guide"
      title={page(SLUG).h1}
      lead="Twenty functions, each with an example that was run rather than imagined: the formula, and under it the answer the engine gave back. Three of them differ from Excel, and one of those three returns a wrong number rather than an error."
    >
      <JsonLd
        data={[breadcrumbJsonLd(SLUG), pageJsonLd(SLUG), faqJsonLd(FAQS)]}
      />
      <Breadcrumbs slug={SLUG} />

      <p className="mb-8 text-[12.5px] text-fg-subtle">
        <Link
          href="/nl/gidsen/formules"
          hrefLang="nl"
          lang="nl"
          className="text-fg-muted underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg"
        >
          Deze pagina in het Nederlands
        </Link>
      </p>

      <Contents slug={SLUG} items={TOC} />

      <Takeaway title="The short version">
        The rule that catches everybody: row 1 of an address is the first row of{" "}
        <em>data</em>, because a column&rsquo;s name belongs to the column
        rather than to a row. Eight orders are <C>E1:E8</C>, not <C>E2:E9</C>.
        See also <A href="/guides">the rest of our guides</A>.
      </Takeaway>

      <H2 id="the-sheet">The sheet these examples run against</H2>
      <P>
        One project, two tables. Every formula below was executed against
        exactly this data, and the line under each one is what came back —
        including the one that comes back wrong.
      </P>
      <Table
        caption="Orders. Eight rows, five columns, addressed A to E."
        columns={["Row", "Date", "Region", "Plan", "Seats", "Amount"]}
        minWidth={620}
        rows={[
          ["1", "2026-01-14", "NL", "Basic", "3", "120"],
          ["2", "2026-01-28", "BE", "Pro", "1", "240"],
          ["3", "2026-02-11", "NL", "Pro", "2", "480"],
          ["4", "2026-02-25", "DE", "Team", "4", "960"],
          ["5", "2026-03-09", "NL", "Basic", "5", "200"],
          ["6", "2026-03-23", "BE", "Team", "2", "480"],
          ["7", "2026-04-07", "NL", "Pro", "1", "240"],
          ["8", "2026-04-21", "DE", "Basic", "6", "240"],
        ]}
      />
      <Table
        caption="Plans. A second table in the same project, addressed as Plans."
        columns={["Row", "Plan", "Price", "Credits"]}
        minWidth={460}
        rows={[
          ["1", "Basic", "0", "200"],
          ["2", "Pro", "14", "3000"],
          ["3", "Team", "24", "6000"],
        ]}
      />
      <List
        items={[
          <>
            <strong className="font-medium text-fg">No header row.</strong> The
            column name is a property of the column, so <C>A1</C> is the first
            order and all eight are <C>A1:A8</C>.
          </>,
          <>
            <strong className="font-medium text-fg">
              A column reference means two things.
            </strong>{" "}
            In <C>[Amount] * 2</C> it is this row&rsquo;s cell; inside{" "}
            <C>SUM([Amount])</C> it is the whole column. Position decides: a
            function that folds asks for the range.
          </>,
          <>
            <strong className="font-medium text-fg">
              Every table is a sheet.
            </strong>{" "}
            <C>Plans!A1:C3</C> is a rectangle in the other table and{" "}
            <C>[Plans]![Price]</C> a whole column of it. Neither is a copy.
            Semicolons work as well as commas, so <C>SUM(E1:E8; D1:D8)</C>{" "}
            parses.
          </>,
        ]}
      />
      <P>
        Typed into a cell, each formula takes a leading <C>=</C>. Set on the
        column, where the same expression runs down every row, it does not.
      </P>

      <H2 id="sum">SUM and AVERAGE</H2>
      <P>
        Both skip blanks and skip text rather than failing on it, so a label
        sitting in a column of numbers costs nothing. An average over an empty
        range is <C>#DIV/0!</C> and not zero, which is the difference between
        nothing yet and nothing sold.
      </P>
      <Fx code={"SUM(E1:E8)"} is={"→ 2960"} />
      <Fx code={"SUM([Amount])"} is={"→ 2960 — the same eight cells, named"} />
      <Fx code={"AVERAGE(E1:E8)"} is={"→ 370"} />

      <H2 id="sumif">SUMIF and SUMIFS</H2>
      <P>
        <C>SUMIF</C> takes the range you test, the condition, then the range
        you actually add. Leave the third argument out and it adds what it
        tested.
      </P>
      <Fx code={'SUMIF(B1:B8, "NL", E1:E8)'} is={"→ 1040"} />
      <P>
        <C>SUMIFS</C> reverses that: the range you add comes <em>first</em>,
        then as many range-and-condition pairs as you like. The flip is the
        commonest reason a working <C>SUMIF</C> returns nonsense once it
        becomes a <C>SUMIFS</C>. Conditions are plain strings, and they compare
        dates as dates because dates are ISO text that sorts correctly.
      </P>
      <Fx
        code={'SUMIFS(E1:E8, B1:B8, "NL", C1:C8, "Pro")'}
        is={"→ 720 — the two Dutch Pro orders"}
      />
      <Fx
        code={'SUMIFS(E1:E8, A1:A8, ">=2026-03-01", B1:B8, "NL")'}
        is={"→ 440 — March onwards, Netherlands only"}
      />

      <H2 id="countif">COUNTIF and COUNTIFS</H2>
      <P>
        Same criteria language, counting instead of adding. <C>*</C> matches
        any run of characters and <C>?</C> exactly one, and case is ignored.{" "}
        <C>AVERAGEIF</C>, <C>MAXIFS</C> and <C>MINIFS</C> take the same shapes.
      </P>
      <Fx code={'COUNTIF(C1:C8, "Pro")'} is={"→ 3"} />
      <Fx code={'COUNTIF(C1:C8, "B*")'} is={"→ 3 — every plan starting with B"} />
      <Fx code={'COUNTIFS(B1:B8, "NL", E1:E8, ">200")'} is={"→ 2"} />

      <H2 id="if">IF, IFS and IFERROR</H2>
      <P>
        Arguments are lazy: a branch you do not take is never evaluated. That
        is what lets <C>IFERROR</C> catch a fault instead of the whole cell
        collapsing.
      </P>
      <Fx
        code={'IF([Region]="NL", [Amount]*21%, 0)'}
        is={"→ 100.8 on row 3 — a trailing % divides by a hundred"}
      />
      <P>
        <C>IFS</C> is a list of condition-and-answer pairs, first hit wins. End
        it with a literal <C>TRUE</C>; without one, a row matching nothing gets{" "}
        <C>#N/A</C> rather than a blank. <C>IFNA</C> is the narrower catch: it
        takes <C>#N/A</C> and lets <C>#DIV/0!</C> through.
      </P>
      <Fx
        code={'IFS([Amount]>=500, "large", [Amount]>=200, "medium", TRUE, "small")'}
        is={"→ large on row 4, small on row 1"}
      />
      <Fx
        code={'IFERROR(VLOOKUP("Gold", Plans!A1:C3, 2), 0)'}
        is={"→ 0 — there is no Gold plan"}
      />

      <H2 id="vlookup">VLOOKUP and XLOOKUP</H2>
      <P>
        <C>VLOOKUP</C> searches the first column of a rectangle and returns the
        n-th column of the matching row, counted from that rectangle&rsquo;s
        left edge.
      </P>
      <Fx
        code={"VLOOKUP([Plan], Plans!A1:C3, 2)"}
        is={"→ 14 on row 3 — the Pro price"}
      />
      <P>
        One difference to write down:{" "}
        <strong className="font-medium text-fg">
          the fourth argument is accepted and ignored, and the match is always
          exact.
        </strong>{" "}
        <C>VLOOKUP(&quot;Pro&quot;, Plans!A1:C3, 2, TRUE)</C> returns 14, not an
        approximate match, so the sorted-thresholds trick for banding a score
        does not band anything here. Use <C>IFS</C>.
      </P>
      <P>
        <C>XLOOKUP</C> takes the column to search and the column to return as
        two separate arguments, so nothing counts positions. Its fourth
        argument is the value to use when there is no match.
      </P>
      <Fx
        code={"XLOOKUP([Plan], Plans!A1:A3, Plans!B1:B3, 0)"}
        is={"→ 14 on row 3"}
      />
      <Fx
        code={'XLOOKUP("Gold", Plans!A1:A3, Plans!B1:B3, 0)'}
        is={"→ 0 — no match, no #N/A, no IFNA needed"}
      />
      <Table
        caption="Which to reach for. Each wins something."
        columns={["", "VLOOKUP", "XLOOKUP"]}
        minWidth={560}
        rows={[
          ["Returns a column left of the key", "No.", "Yes."],
          [
            "Survives an inserted column",
            "No — the index counts positions.",
            "Yes.",
          ],
          ["Built-in not-found value", "No. Wrap it in IFNA.", "Yes, fourth argument."],
          [
            "Several columns from one table",
            "One rectangle, change the index. Shorter.",
            "A new range pair each time. Longer.",
          ],
          ["Recognised by a colleague", "Everyone knows it.", "Newer."],
        ]}
      />

      <H2 id="index-match">INDEX and MATCH</H2>
      <P>
        <C>MATCH</C> gives the position of a value in a range and{" "}
        <C>INDEX</C> the value at a position. Together they do what{" "}
        <C>XLOOKUP</C> does, in the shape people wrote before it existed.
      </P>
      <Fx code={'MATCH("Team", Plans!A1:A3)'} is={"→ 3"} />
      <Fx
        code={'INDEX(Plans!C1:C3, MATCH("Pro", Plans!A1:A3))'}
        is={"→ 3000 — the credits on the Pro plan"}
      />
      <P>
        Here is the one example on this page that returns a plausible wrong
        number instead of an error. <C>INDEX</C> takes a single index over a
        range read row by row; Excel&rsquo;s two-dimensional form does not
        exist, so the third argument is dropped and the rectangle is flattened.
      </P>
      <Fx
        code={"INDEX(Plans!A1:C3, 2, 2)"}
        is={"→ 0 — not 14. Position 2 of the flattened rectangle."}
      />
      <P>
        Give <C>INDEX</C> one column and one position. <C>MATCH</C> likewise
        takes two arguments and always matches exactly, so a pasted{" "}
        <C>MATCH(x, range, 0)</C> is right and a pasted{" "}
        <C>MATCH(x, range, 1)</C> quietly stops being approximate.
      </P>

      <H2 id="text">TEXT</H2>
      <P>
        <C>TEXT</C> turns a number into a string, which is what you want when
        a number has to sit inside a sentence rather than in a cell.
      </P>
      <Fx code={'TEXT(SUM(E1:E8), "#,##0.00")'} is={"→ 2,960.00"} />
      <Fx code={'TEXT(0.1234, "0.0%")'} is={"→ 12.3%"} />
      <P>
        The pattern covers three things: decimals, from the zeros after the
        point; thousands grouping, from a comma between digit placeholders; and
        percent. No date patterns, no currency symbols, no colours. It also
        formats in English convention wherever you are, so the output is{" "}
        <C>2,960.00</C> and never <C>2.960,00</C>.
      </P>

      <H2 id="dates">The date functions</H2>
      <P>
        Dates are ISO strings — <C>2026-01-14</C> — because that is what a date
        column stores, it sorts correctly as text, and a round trip through
        JSON cannot move it a day. An ambiguous date is refused rather than
        guessed: <C>DATEVALUE(&quot;14/01/2026&quot;)</C> gives <C>#VALUE!</C>{" "}
        and says why, since being wrong by a month is worse than saying so.
      </P>
      <Table
        caption="Run against Orders above. A1 is 2026-01-14, A8 is 2026-04-21."
        columns={["Formula", "Result"]}
        minWidth={520}
        rows={[
          ["DAYS(A8, A1)", "97 calendar days"],
          ["NETWORKDAYS(A1, A8)", "70 working days, weekends removed"],
          [
            'NETWORKDAYS("2026-01-01", "2026-01-31", "2026-01-01")',
            "21 — the third argument is holidays",
          ],
          ["WORKDAY(A1, 10)", "2026-01-28"],
          ["EOMONTH(A1, 0)", "2026-01-31 — and it clamps, so 31 Jan plus a month is 2026-02-28"],
          ["EDATE(A1, 3)", "2026-04-14"],
          ['DATEDIF(A1, A8, "M")', "3 whole months. D, M or Y only"],
          ["ISOWEEKNUM(A1)", "3 — the week number payroll means"],
          ["YEAR(A1)", "2026. MONTH and DAY work the same way"],
          ["TODAY()", "Read when the sheet computes, not a ticking clock"],
        ]}
      />

      <H2 id="pmt-npv">PMT and NPV</H2>
      <P>
        <C>PMT</C> is the payment on a loan. The rate is per period rather than
        per year, so 6% a year paid monthly is <C>0.06/12</C>, and the answer is
        negative because it is money leaving. A fifth argument of 1 means paid
        in advance.
      </P>
      <Fx
        code={"ROUND(PMT(0.06/12, 60, 12000), 2)"}
        is={"→ -231.99 a month on 12,000 over five years; -230.84 paid in advance"}
      />
      <P>
        <C>NPV</C> discounts a series of cash flows, and{" "}
        <strong className="font-medium text-fg">
          the first flow you pass is discounted by one period
        </strong>
        , so money spent today belongs outside it. Getting that wrong
        discounts an investment by an extra period and flatters every project
        you evaluate. Eleven finance functions in all, including <C>FV</C>,{" "}
        <C>PV</C>, <C>NPER</C>, <C>RATE</C> and <C>IRR</C>.
      </P>
      <Fx
        code={"ROUND(NPV(0.1, 3000, 4200, 6800) - 10000, 2)"}
        is={"→ 1307.29 — the 10,000 spent today sits outside"}
      />

      <H2 id="correl">CORREL</H2>
      <P>
        <C>CORREL</C> gives the correlation between two ranges, from -1 to 1.
        It needs at least two pairs, trims the longer range to the shorter, and
        returns <C>#DIV/0!</C> when either range never changes.{" "}
        <C>SLOPE</C>, <C>INTERCEPT</C>, <C>FORECAST</C> and <C>RSQ</C> take the
        same pair.
      </P>
      <Fx
        code={"ROUND(CORREL(D1:D8, E1:E8), 3)"}
        is={"→ 0.046 — seats and revenue barely move together"}
      />
      <Fx
        code={"ROUND(CORREL(Plans!B1:B3, Plans!C1:C3), 3)"}
        is={"→ 0.993 — price and included credits move almost as one"}
      />
      <P>
        The first number is useful precisely because it is boring: here the
        seat count explains almost nothing about the amount, because the plan
        sets the price. One formula, and a chart you never have to explain.
      </P>

      <H2 id="absent">What is not here, and why</H2>
      <P>
        There are 167 functions. Nine are absent on purpose, and you are told
        which: the column formula editor says so before you run anything, and a
        name typed into a cell comes back with the reason rather than a bare{" "}
        <C>#NAME?</C> — being told something was left out reads differently
        from suspecting a typo.
      </P>
      <Table
        caption="Where Excel does something this engine will not. Excel wins every row."
        columns={["Excel", "Here", "Why"]}
        minWidth={640}
        rows={[
          [
            "RAND, RANDBETWEEN",
            "Absent.",
            "A cell that changes every render cannot be compared with what it said a second ago.",
          ],
          [
            "UNIQUE, SORT, FILTER, TRANSPOSE",
            "Absent.",
            "They write into cells you never selected. That needs a spill model, and half of one is worse than none.",
          ],
          [
            "INDIRECT, OFFSET",
            "Absent.",
            "They build a reference out of text while running, so the cycle guard could not see the dependencies first.",
          ],
          [
            "Macros and VBA",
            "Absent.",
            "What a macro automates — repeat this over every row — is what a formula column already is.",
          ],
          [
            "INDEX with a row and a column",
            "One index only.",
            "Not stated. You get the wrong cell rather than an error.",
          ],
          [
            "Approximate VLOOKUP and MATCH",
            "Always exact.",
            "Not stated. The extra argument is ignored.",
          ],
          [
            "TEXT with dates, currency and colours",
            "Decimals, thousands, percent.",
            "Anything more needs a full formatter.",
          ],
          [
            "A million rows a sheet",
            "About 50,000 comfortably.",
            "At 100,000 browser storage refuses the write.",
          ],
        ]}
      />
      <P>
        Names are English only, so <C>SOM</C> returns <C>#NAME?</C> even though
        the semicolon a Dutch Excel puts between arguments is fine. A formula
        column may reference another; a cell asked for while already computing
        returns <C>#CYCLE!</C> rather than hanging the tab, and that guard is
        only honest because <C>INDIRECT</C> is absent. The full head-to-head is
        on{" "}
        <A href="/compare/excel">how this compares with Excel</A>, and there is{" "}
        <A href="/guides/write-a-thesis">
          using these in a thesis results chapter
        </A>{" "}
        and <A href="/guides/pitch-deck">the numbers behind a pitch deck</A>.
      </P>

      <H2 id="faq">Questions people ask</H2>
      <FAQ items={FAQS} />

      <CallToAction href="/library" label="Open a spreadsheet">
        Paste a CSV or an .xlsx file, put one of these on the column rather
        than in a cell, and the same expression runs down every row. That is
        what a macro would otherwise have been for.
      </CallToAction>

      <RelatedPages slug={SLUG} />
    </PageShell>
  );
}
