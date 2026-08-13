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
} from "@/lib/seo";

const SLUG = "/guides" as const;

export const metadata = pageMetadata(SLUG);

const TOC: TocItem[] = [
  { id: "what-a-guide-is", label: "What a guide is for here" },
  { id: "checked", label: "Written against something that ran" },
  { id: "the-guides", label: "The four guides" },
  { id: "whether-not-how", label: "If the question is whether, not how" },
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
 * The line each card ends on: the one thing that guide settles.
 *
 * A hub listing four titles and four summaries makes the reader open all four
 * to find out whether any of them is about their problem. Each of these guides
 * turns on a single sentence, so that sentence is here.
 */
function Verdict({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 border-l border-line-strong pl-3.5 text-[13.5px] leading-relaxed text-fg-muted text-pretty">
      {children}
    </p>
  );
}

/** Inline code. `children` is a string prop, so quotes need no escaping. */
function C({ children }: { children: string }) {
  return <code className="font-mono text-[13.5px] text-fg">{children}</code>;
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
    slug: "/guides/write-a-thesis",
    anchor: "How to write a thesis, step by step",
    body: (
      <>
        Nine steps that each end in something another person can read, a chapter
        outline with a word goal per section, and twenty weeks laid out week by
        week. The last section is about handing the thing to a supervisor who
        wants Word with tracked changes, which is where most of the practical
        trouble actually is.
      </>
    ),
    verdict: (
      <>
        <strong className="font-medium text-fg">What it settles:</strong> four
        settings — citation style, notes, a contents block, cross-references —
        cost ten minutes in week 1 or a weekend in week 19, and your first
        complete draft belongs in week 15 rather than week 19.
      </>
    ),
  },
  {
    slug: "/guides/pitch-deck",
    anchor: "How to build a pitch deck",
    body: (
      <>
        Twelve slides with one job each, in an order that is a proof chain
        rather than a convention: every slide answers the objection the one
        before it just raised. Then the mechanics — which sentence is printed
        and which stays in your mouth, the numbers investors ask about first,
        and rehearsing with a clock on a second screen.
      </>
    ),
    verdict: (
      <>
        <strong className="font-medium text-fg">What it settles:</strong> a
        slide that answers no objection is not a short slide, it is a slide to
        cut — and the competition slide that works is the one naming where you
        lose.
      </>
    ),
  },
  {
    slug: "/guides/spreadsheet-formulas",
    anchor: "20 spreadsheet formulas with examples",
    body: (
      <>
        SUM, SUMIF, COUNTIF, IF, VLOOKUP, XLOOKUP, INDEX, MATCH, TEXT, the date
        functions, PMT, NPV and CORREL, each with a formula that was executed
        against one small two-table project and the answer it gave back
        underneath it. The last section is the nine functions that are absent on
        purpose, with the reason for each.
      </>
    ),
    verdict: (
      <>
        <strong className="font-medium text-fg">What it settles:</strong> row 1
        of an address is the first row of <em>data</em>, so eight orders are{" "}
        <C>E1:E8</C> and not <C>E2:E9</C> — and three functions behave
        differently from Excel, one of which returns a wrong number rather than
        an error.
      </>
    ),
  },
  {
    slug: "/guides/work-offline",
    anchor: "How to keep working offline",
    body: (
      <>
        Offline is rarely a plane. It is a train through a tunnel or campus wifi
        that authenticates you and then forwards nothing. This sets out what
        Google Docs, Microsoft 365, Notion and Tougather each do about it, what
        a backup file actually contains, and what browser storage cannot
        promise.
      </>
    ),
    verdict: (
      <>
        <strong className="font-medium text-fg">What it settles:</strong> in
        Google Docs and Notion, offline is a cached copy of something on a
        server, arranged before the connection went. Here the browser holds the
        original — and there is nothing on a server to fall back on.
      </>
    ),
  },
];

export default function GuidesHubPage() {
  const entry = page(SLUG);
  const nl = counterparts(SLUG).nl;

  return (
    <PageShell
      eyebrow="Guides"
      title={entry.h1}
      lead="Four pieces of work that go wrong in the same few places: a thesis, a pitch deck, a spreadsheet, and a day without a connection. These guides are about the mechanics of finishing them rather than about motivation, and none of them needs you to buy anything."
    >
      <JsonLd data={[breadcrumbJsonLd(SLUG), pageJsonLd(SLUG)]} />
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
        A thesis fails on the four settings nobody made in week 1. A deck fails
        on slides that answer no objection. A spreadsheet fails on an address
        off by one row. A day offline fails on a setting somebody needed the
        network to switch on. Each guide is about one of those, in that order.
      </Takeaway>

      <Contents slug={SLUG} items={TOC} />

      <H2 id="what-a-guide-is">What a guide is for here</H2>
      <P>
        A guide answers how do I do this. Whether to change tools is a different
        question with its own pages, and mixing the two produces a tutorial you
        cannot trust and a comparison you cannot follow. So nothing on these
        four pages argues that you should switch to anything; where a limit is
        relevant it is named, and{" "}
        <A href="/compare">
          compare Tougather with your current tools
        </A>{" "}
        is where that argument lives instead.
      </P>
      <P>
        That constraint decides what goes in. A thesis guide that assumes a
        particular editor is useless to the person whose university hands them
        Word, so the thesis guide is about numbering, cross-references, citation
        styles and the state your supervisor needs the file in — things that are
        true in any tool and expensive to fix late in any tool. The offline
        guide covers Google Docs, Microsoft 365 and Notion before it says a word
        about this one, because for most readers the answer is about the tool
        they already have open.
      </P>

      <H2 id="checked">Written against something that ran</H2>
      <P>
        The formulas guide is the clearest case. Every one of its twenty
        examples was executed against one small project of two tables, and the
        line printed under each formula is what the engine gave back — including
        the example that comes back wrong. There are 167 functions here, and
        nine are absent by design rather than missing: <C>RAND</C>,{" "}
        <C>RANDBETWEEN</C>, <C>UNIQUE</C>, <C>SORT</C>, <C>FILTER</C>,{" "}
        <C>TRANSPOSE</C>, <C>INDIRECT</C>, <C>OFFSET</C> and macros. Typing one
        gets a sentence explaining why rather than <C>#NAME?</C>.
      </P>
      <P>
        The same rule applies where a guide touches the product. Citations come
        in four styles — APA 7, MLA 9, Chicago and Harvard — and a source parsed
        from a DOI or a BibTeX string flags the fields it inferred as uncertain,
        because the resolver never touches the network. A contents page is
        derived on every render and never stored, so it cannot disagree with the
        document. Page numbers go into the Word export and do not survive a
        browser print, because CSS margin boxes are unimplemented in every
        shipping engine. A guide is a bad place to find that out afterwards.
      </P>
      <P>
        Nothing here is gated. The free plan has no login and no account, so
        every step in these guides can be followed without paying — which is
        just as well, since no one can pay yet: every Stripe price ID in the
        billing code is still null. A guide that only works after a purchase is
        an advertisement with steps in it.
      </P>

      <H2 id="the-guides">The four guides</H2>
      <P>
        Each card ends with the one thing that guide settles — the sentence you
        would want to have read even if you never opened the rest of it.
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

      <H2 id="whether-not-how">If the question is whether, not how</H2>
      <P>
        Someone reading the offline guide on a train is usually asking a
        narrower question than someone deciding what their team should use next
        year. The second question is answered in{" "}
        <A href="/compare">every comparison in one place</A>: Microsoft 365,
        Google Workspace, Notion and Excel, each with a table where several rows
        are losses, and each ending in a tool somebody should keep.
      </P>

      <CallToAction href="/library" label="Start writing">
        No login, nothing to install, nothing to cancel. Open a project, follow
        one of these guides in it, and stop when it stops being useful.
      </CallToAction>
    </PageShell>
  );
}
