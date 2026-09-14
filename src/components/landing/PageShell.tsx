/**
 * The frame every storefront page that isn't the landing page sits in.
 *
 * One shell rather than four near-identical layouts: a title in the display
 * serif, a standfirst in Geist, a hairline, then the content in a single
 * readable column. These pages are documents, not landing pages — the job is
 * to be read start to finish, so nothing here competes with the words.
 */

import Link from "next/link";
// The storefront's own nav and footer: one of each for the whole site, so an
// inner page and the landing page are visibly the same place.
import { Nav } from "@/components/storefront/Chrome";
import { Footer } from "@/components/storefront/Footer";
import { PageHead, PSection } from "@/components/storefront/page";
import { Rail } from "@/components/storefront/Rail";
import { Icon } from "@/components/ui/Icon";

export function PageShell({
  eyebrow,
  title,
  lead,
  children,
  updated,
  lang,
  glow,
  after,
  rail = true,
}: {
  eyebrow?: string;
  title: string;
  lead?: React.ReactNode;
  children: React.ReactNode;
  /** When the page last said something different. Omitted where it can't. */
  updated?: string;
  /**
   * The language of *this page's words*, when it isn't the site default.
   *
   * The honest fix for a problem we can't fix properly yet. `<html lang>` is
   * written by the boot script in `src/lib/i18n`, from the reader's stored
   * interface preference — which is the right source for the interface and
   * the wrong one for a document. A Dutch reader with the app in English
   * opening `/nl/gidsen/formules` gets Dutch prose announced in an English
   * voice; an English reader with the app in Dutch gets the reverse.
   *
   * `lang` on `<main>` overrides the ancestor for everything inside it, which
   * is exactly what the attribute is for. So the page's own words are labelled
   * correctly and the Nav and Footer — which really do follow the interface
   * preference, because their text is translated by it — are left alone
   * outside `<main>`.
   *
   * What this does not fix: the `<html lang>` attribute itself still says
   * whatever the reader's preference says. Fixing that means reading the
   * locale on the server, which means giving up static rendering for the whole
   * app — the trade `src/lib/i18n/index.ts` already weighed and declined. For
   * search engines the load is carried by `alternates.languages` in
   * `pageMetadata`, which is what Google actually reads for language
   * targeting; `lang` here is for the screen reader, and the screen reader
   * honours the nearest ancestor.
   */
  lang?: "en" | "nl";
  /** Two colours for the wash behind the head, so each page has its weather. */
  glow?: [string, string];
  /**
   * A full-width block below the prose.
   *
   * The hub pages — guides, comparisons — are indexes, and an index is a grid
   * of things to choose between rather than a list inside a reading measure.
   * This is where that grid goes: outside the 68-character column, across the
   * whole page, where it can be four cards wide.
   */
  after?: React.ReactNode;
  /**
   * The rail beside the prose. On by default, off where it would repeat the
   * page.
   *
   * `/download` is the case: its whole job is a download button, and a second
   * identical one floating next to it in a card reads as a page arguing with
   * itself. A rail earns its place next to a guide, where the reader is doing
   * something else and the browser is the aside; on a page that is already
   * the ask, it is noise.
   */
  rail?: boolean;
}) {
  return (
    <>
      <Nav />
      <main lang={lang}>
        {/*
          * The head, in the storefront's own voice.
          *
          * What this replaced was a title, a standfirst and a hairline in a
          * narrow left column with the right half of the screen empty — a
          * document template written before there was a design to put it in.
          * `PageHead` gives it the same shapes the home page uses at a
          * quieter setting, and a wash in the corner so a guide reached from
          * a search result is visibly the same site.
          */}
        <PageHead
          eyebrow={eyebrow}
          title={title}
          lead={lead}
          meta={updated ? `Last changed ${updated}` : undefined}
          glow={glow}
        />

        <PSection className="pb-4">
          {/*
            * 68 characters, still — and a rail beside it.
            *
            * A paragraph is read one line at a time and the eye loses the
            * start of the next line somewhere past seventy-five characters,
            * so the measure does not move. What changed is the half of the
            * page that measure used to leave empty: see `.longform` in
            * globals.css for why it holds the browser rather than nothing.
            */}
          <div className={rail ? "longform" : "longform longform--solo"}>
            <div>{children}</div>
            {rail ? <Rail /> : null}
          </div>
        </PSection>

        {after}

        <PSection className="pb-24">
          <p className="border-t border-line pt-6 text-[13.5px]">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-fg-muted transition-colors hover:text-fg"
            >
              <Icon name="chevron-left" size={11} />
              Back to the homepage
            </Link>
          </p>
        </PSection>
      </main>
      <Footer />
    </>
  );
}

/* ── Building blocks for these pages ────────────────────── */

export function H2({
  id,
  children,
}: {
  /** Set when the footer or another page links straight to this section. */
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <h2
      id={id}
      className="mt-14 mb-3 scroll-mt-28 text-[clamp(23px,2.8vw,30px)] font-medium tracking-[-0.025em] text-fg first:mt-0"
    >
      {children}
    </h2>
  );
}

/**
 * The step under `H2`. One size above body and a weight heavier — the site has
 * one typeface now, so the levels are carried by size and weight rather than
 * by changing face, which at this scale only ever reads as a slightly wrong
 * `H2`.
 *
 * It lives here next to `H2` rather than in `LongForm.tsx` so there is one
 * place a heading level is defined; `LongForm` re-exports it so a long-form
 * page can take everything it needs from one import.
 */
export function H3({
  id,
  children,
}: {
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <h3
      id={id}
      className="mt-9 mb-2 scroll-mt-28 text-[17px] font-medium tracking-[-0.01em] text-fg"
    >
      {children}
    </h3>
  );
}

export function P({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3.5 text-[16.5px] leading-[1.6] text-fg-muted text-pretty">
      {children}
    </p>
  );
}

export function List({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="mt-4 space-y-2">
      {items.map((item, i) => (
        <li
          key={i}
          className="relative pl-6 text-[16.5px] leading-[1.6] text-fg-muted"
        >
          {/* A short coral rule rather than a bullet. One mark, used on every
              list on the site, in the one accent this design has. */}
          <span
            aria-hidden="true"
            className="absolute top-[0.72em] left-0 h-[2px] w-3 rounded-[1px] bg-[var(--coral)]"
          />
          {item}
        </li>
      ))}
    </ul>
  );
}

/**
 * A page, or a section of one, that can't be written truthfully yet.
 *
 * The alternative is worse in both directions: a dead link says the company
 * forgot, and invented content says something that isn't so. This says exactly
 * what is missing and what would fill it, which is the only honest third
 * option.
 */
export function NotYet({
  what,
  needs,
}: {
  what: string;
  needs: React.ReactNode;
}) {
  return (
    <div className="panelcard mt-7">
      <p className="panelcard__head flex items-center gap-2.5">
        <span aria-hidden="true" className="size-2 rounded-full bg-[#b47814]" />
        {what}
      </p>
      <p className="mt-2.5 text-[15.5px] leading-[1.55] text-fg-muted">{needs}</p>
    </div>
  );
}
