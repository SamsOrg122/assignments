/**
 * The frame every storefront page that isn't the landing page sits in.
 *
 * One shell rather than four near-identical layouts: a title in the display
 * serif, a standfirst in Geist, a hairline, then the content in a single
 * readable column. These pages are documents, not landing pages — the job is
 * to be read start to finish, so nothing here competes with the words.
 */

import Link from "next/link";
import { Nav } from "./Nav";
import { Footer } from "./Footer";
import { Section } from "./primitives";
import { Icon } from "@/components/ui/Icon";

export function PageShell({
  eyebrow,
  title,
  lead,
  children,
  updated,
  lang,
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
}) {
  return (
    <>
      <Nav />
      <main lang={lang}>
        <Section className="pt-16 pb-10 sm:pt-24 sm:pb-14">
          {eyebrow && (
            <p className="mb-4 text-[12.5px] text-fg-subtle">{eyebrow}</p>
          )}
          <h1 className="headline max-w-[18ch] text-[clamp(34px,5.6vw,60px)]">
            {title}
          </h1>
          {lead && (
            <p className="mt-5 max-w-[58ch] text-[clamp(15px,1.7vw,18px)] leading-relaxed text-fg-muted text-pretty">
              {lead}
            </p>
          )}
          {updated && (
            <p className="mt-6 font-mono text-[11px] text-fg-subtle">
              Last changed {updated}
            </p>
          )}
        </Section>

        <div className="mx-auto h-px w-full max-w-[1240px] bg-line" />

        <Section className="py-12 sm:py-16">
          <div className="max-w-[68ch]">{children}</div>

          <p className="mt-16 border-t border-line pt-6 text-[13px] text-fg-subtle">
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-fg-muted transition-colors hover:text-fg"
            >
              <Icon name="chevron-left" size={11} />
              Back to the homepage
            </Link>
          </p>
        </Section>
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
      className="display mt-12 mb-3 scroll-mt-24 text-[clamp(21px,2.6vw,27px)] text-fg first:mt-0"
    >
      {children}
    </h2>
  );
}

/**
 * The step under `H2`. Sans rather than the display serif, and one size above
 * body — a second serif tier at this scale reads as a slightly wrong `H2`
 * rather than as a subordinate heading.
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
      className="mt-8 mb-2 scroll-mt-24 text-[15.5px] font-medium text-fg"
    >
      {children}
    </h3>
  );
}

export function P({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 text-[15px] leading-relaxed text-fg-muted text-pretty">
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
          className="relative pl-5 text-[15px] leading-relaxed text-fg-muted"
        >
          <span
            aria-hidden="true"
            className="absolute top-[0.62em] left-0 size-1.5 rounded-[1px] border border-fg-subtle"
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
    <div className="mt-6 rounded-md border border-warn/30 bg-warn/[0.06] p-4">
      <p className="flex items-center gap-2 text-[13px] font-medium text-warn">
        <span aria-hidden="true" className="size-1.5 rounded-full bg-warn" />
        {what}
      </p>
      <p className="mt-2 text-[13.5px] leading-relaxed text-fg-muted">{needs}</p>
    </div>
  );
}
