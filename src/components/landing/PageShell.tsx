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
}: {
  eyebrow?: string;
  title: string;
  lead?: React.ReactNode;
  children: React.ReactNode;
  /** When the page last said something different. Omitted where it can't. */
  updated?: string;
}) {
  return (
    <>
      <Nav />
      <main>
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
