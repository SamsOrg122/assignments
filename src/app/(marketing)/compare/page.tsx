import Link from "next/link";
import { H2, P, PageShell } from "@/components/landing/PageShell";
import {
  Breadcrumbs,
  CallToAction,
  Contents,
  H3,
  JsonLd,
  Takeaway,
  type TocItem,
} from "@/components/landing/LongForm";
import {
  type Slug,
  breadcrumbJsonLd,
  counterparts,
  page,
  pageJsonLd,
  pageMetadata,
  softwareApplicationJsonLd,
} from "@/lib/seo";

const SLUG = "/compare" as const;

export const metadata = pageMetadata(SLUG);

const TOC: TocItem[] = [
  { id: "what-these-are", label: "What these four pages are" },
  { id: "the-trade", label: "The trade, stated once" },
  { id: "comparisons", label: "The four comparisons" },
  { id: "how-not-whether", label: "If the question is how, not whether" },
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

/**
 * The line each card ends on.
 *
 * A hub that lists four pages without saying what any of them concluded makes
 * the reader open all four to find out. Every page in this cluster ends by
 * telling somebody to keep the tool they already have, so that sentence is the
 * one worth lifting up here.
 */
function Verdict({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 border-l border-line-strong pl-3.5 text-[13.5px] leading-relaxed text-fg-muted text-pretty">
      {children}
    </p>
  );
}

/** Bold the tool being kept, so the four verdicts are scannable as a set. */
function Keep({ children }: { children: React.ReactNode }) {
  return <strong className="font-medium text-fg">{children}</strong>;
}

interface Card {
  slug: Slug;
  /** Anchor text from the strategist's link map. Doubles as the card title. */
  anchor: string;
  body: React.ReactNode;
  verdict: React.ReactNode;
}

const CARDS: Card[] = [
  {
    slug: "/compare/microsoft-365",
    anchor: "Tougather vs Microsoft 365",
    body: (
      <>
        The whole suite, including the half of it that has no counterpart here.
        It prices both sides at five and twenty seats, and it is exact about
        what a Word file loses on the way out: equations arrive as LaTeX source
        rather than Word equation objects, and page numbers are in the .docx but
        not in a browser print.
      </>
    ),
    verdict: (
      <>
        <Keep>Keep Microsoft 365</Keep> if Outlook, Teams or a workbook full of
        macros is load-bearing — six of that page&apos;s twelve rows go to
        Microsoft. What can move is the part you make things in, not the mail
        server.
      </>
    ),
  },
  {
    slug: "/compare/google-workspace",
    anchor: "Tougather vs Google Workspace",
    body: (
      <>
        The closest fight, and the one about collaboration. It defines what a
        live session here actually is — presence, other people&apos;s cursors,
        changes sent as changes rather than snapshots — and then names the limit
        in the same breath, because &ldquo;real-time collaboration&rdquo; can
        mean four different things.
      </>
    ),
    verdict: (
      <>
        <Keep>Keep Google Workspace</Keep> if Gmail and Calendar are the centre
        of your day, or if a document has to be open to a dozen people at once.
        Prose here merges character by character as Google&apos;s does; what
        Google has and this does not is the scale around it.
      </>
    ),
  },
  {
    slug: "/compare/notion",
    anchor: "Tougather vs Notion",
    body: (
      <>
        The same shape with different insides: one workspace, blocks rather than
        files, a page rather than a folder. Because the shapes are alike the
        differences are narrow, so the page states them precisely — databases
        and rollups on one side, a formula engine, slides and a page that prints
        on the other.
      </>
    ),
    verdict: (
      <>
        <Keep>Keep Notion</Keep> if your workspace runs on linked databases, or
        if you read the same rows as a board and a calendar. There is no
        relation property here and no rollup, and there is exactly one view: the
        grid.
      </>
    ),
  },
  {
    slug: "/compare/excel",
    anchor: "Tougather vs Excel",
    body: (
      <>
        One component rather than a suite: 167 functions against the deepest
        spreadsheet there is, what survives a .xlsx on the way in, and the row
        count at which the browser refuses to save. It is the least flattering
        page of the four, which is why it is the most useful one.
      </>
    ),
    verdict: (
      <>
        <Keep>Keep Excel</Keep> if you build financial models, run macros, or
        work past fifty thousand rows — eight of that page&apos;s twelve rows go
        to Excel. What moves is the other spreadsheet: the table that belongs
        inside a document.
      </>
    ),
  },
];

export default function CompareHubPage() {
  const entry = page(SLUG);
  const nl = counterparts(SLUG).nl;

  return (
    <PageShell
      eyebrow="Compare"
      title={entry.h1}
      lead="Four pages, four tools, and the same rule on every one of them: it opens with where the other tool is better. This page is what the four have in common — the trade you are actually being offered, and which of them to read first."
    >
      <JsonLd
        data={[
          breadcrumbJsonLd(SLUG),
          pageJsonLd(SLUG),
          softwareApplicationJsonLd(),
        ]}
      />
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

      <Takeaway title="The short version">
        Every page here ends by telling somebody to keep what they have.
        Microsoft 365 if Outlook or Teams is load-bearing. Google Workspace if
        Gmail is the centre of your day. Notion if your work
        runs on linked databases. Excel if you build models. What is left after
        those four exclusions is the case this was built for: one document with
        the numbers, the slides and the writing inside it.
      </Takeaway>

      <Contents slug={SLUG} items={TOC} />

      <H2 id="what-these-are">What these four pages are</H2>
      <P>
        Each one answers a single question — should I switch — and then stops.
        How to actually do a thing is the job of{" "}
        <A href="/guides">our step-by-step guides</A>, and a comparison that
        turns into a tutorial is answering a question nobody asked on that page.
        So there is no formula lesson here and no deck outline; there are links
        to both.
      </P>
      <P>
        They were written by reading the code rather than the marketing site,
        and it shows in the shape of the numbers. The spreadsheet library was
        counted at runtime, not estimated: 167 functions, of which nine are
        absent on purpose and say why when you type them. The storage ceiling
        was measured with a script — fifty thousand rows is 3.4 MB and opens in
        0.56 seconds; a hundred thousand is 6.8 MB and the browser refuses the
        write. Where something could not be checked, it is not on the page.
      </P>
      <P>
        Each page also carries a table in which several rows are losses. Six of
        the twelve rows on the Microsoft 365 page go to Microsoft; eight of the
        twelve on the Excel page go to Excel. That is the honest shape of a
        comparison written by the smaller product, and a page that came out any
        other way would be an advertisement with a table in it.
      </P>

      <H2 id="the-trade">The trade, stated once</H2>
      <P>
        The gain is the same in all four comparisons. A project is not four
        files, it is one canvas of blocks in nine kinds — text, table, chart,
        slides, code, image, bibliography, contents and form. A chart holds the
        id of the table it reads from, so the two are one piece of data seen
        twice rather than a spreadsheet and a picture of a spreadsheet that
        stopped agreeing in March. Footnotes number themselves in document
        order, the contents page is derived on every render and never stored,
        and figure and table captions run as two sequences that renumber when
        you insert one in the middle.
      </P>
      <P>
        The cost is also the same in all four, so it may as well be here rather
        than four times over. There is no email and no calendar — none, not a
        thinner version. Prose merges through a CRDT, but boards, spreadsheets
        and slides are still synced per item with the newest winning, and the
        merge state is rebuilt when a document opens rather than stored — so it
        survives a disconnect and not a reload. Administration runs only against a configured
        database, single sign-on is a hand-off to whatever providers a
        deployment names, and there is no SCIM. The spreadsheet has no macros
        and no spill model. PDF export is the browser print dialog rather than a
        generated file, and PDF import does not exist at all. Chat&apos;s model
        is real — channels, DMs, threads, passcodes — but the transport that
        ships under it is simulated.
      </P>
      <P>
        Prices are fixed and worth having in front of you before you open any of
        the four. Free is €0, has no login, and includes 200 AI credits a month
        that stop rather than becoming an invoice. Pro is €14 a month and is not
        billed per seat. Team is €24 a seat, which is €1,440 a year at five
        seats and €5,760 at twenty. One thing better heard here than at the
        counter: nothing can be charged today, because every Stripe price ID in
        the billing code is still null.
      </P>

      <H2 id="comparisons">The four comparisons</H2>
      <P>
        In the order most people read them. Each card ends with what that page
        concludes, which in every case is a tool somebody should keep.
      </P>
      <ul className="mt-2 divide-y divide-line border-t border-line">
        {CARDS.map((card) => (
          <li key={card.slug} className="pb-6">
            <H3>
              <Link
                href={card.slug}
                className="transition-colors hover:text-fg-muted"
              >
                {card.anchor}
              </Link>
            </H3>
            <P>{card.body}</P>
            <Verdict>{card.verdict}</Verdict>
          </li>
        ))}
      </ul>

      <H2 id="how-not-whether">If the question is how, not whether</H2>
      <P>
        A comparison is the wrong page for someone who has already decided.{" "}
        <A href="/guides">Our step-by-step guides</A> take the other half: a
        thesis from topic to final draft, a twelve-slide deck, twenty formulas
        with the answer each one returned, and what genuinely still works when
        the connection drops. They name the same limits these pages do, because
        it is the same product underneath.
      </P>

      <CallToAction href="/library" label="Open a project">
        No login and nothing to cancel — the free plan has no account at all.
        Paste in a .docx and an .xlsx you already have, and see which of the
        four comparisons you were reading was about you.
      </CallToAction>
    </PageShell>
  );
}
