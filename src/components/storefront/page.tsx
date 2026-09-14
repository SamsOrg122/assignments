/**
 * The parts every page behind the homepage is built from.
 *
 * The landing page and a guide want genuinely different things from the same
 * palette — one is looked at for four seconds, the other is read start to
 * finish — so these are the landing page's shapes at a third of the volume:
 * a head with a figure in it, panels made of paper, and colour arriving in
 * objects rather than behind the words.
 */

import Link from "next/link";
import { cn } from "@/lib/cn";

/** The measure. Same gutter as the landing page, so nothing steps sideways. */
export function Wrap({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("wrap", className)}>{children}</div>;
}

/**
 * The head of an inner page.
 *
 * `figure` is the thing that makes these pages feel like the same site as the
 * home page: a share, a price, a count, set at hero scale beside the title
 * rather than buried in the prose. A page with no such number leaves it out
 * and the head simply becomes a title and a lede — it should not be filled
 * with a decorative one.
 */
export function PageHead({
  eyebrow,
  title,
  lead,
  meta,
  figure,
  glow = ["var(--lilac)", "var(--orchid)"],
}: {
  eyebrow?: string;
  title: React.ReactNode;
  lead?: React.ReactNode;
  meta?: React.ReactNode;
  figure?: React.ReactNode;
  /** Two colours for the wash behind it, so each page has its own weather. */
  glow?: [string, string];
}) {
  return (
    <div className="phead">
      <div className="phead__glow" aria-hidden="true">
        <span style={{ width: 620, height: 420, right: "-6%", top: "-34%", background: glow[0] }} />
        <span style={{ width: 520, height: 400, right: "22%", top: "-16%", background: glow[1] }} />
      </div>
      <Wrap>
        <div className="phead__in">
          <div>
            {eyebrow ? (
              <span className="eyebrow glass">
                <i />
                {eyebrow}
              </span>
            ) : null}
            <h1 className={eyebrow ? "mt-6" : undefined}>{title}</h1>
            {meta ? <p className="phead__meta">{meta}</p> : null}
          </div>
          <div>
            {figure ? <div className="phead__fig mb-5">{figure}</div> : null}
            {lead ? <p className="phead__lead">{lead}</p> : null}
          </div>
        </div>
      </Wrap>
    </div>
  );
}

/** A section of an inner page: a heading on the left, its standfirst right. */
export function PSection({
  id,
  title,
  lead,
  children,
  className,
}: {
  id?: string;
  title?: React.ReactNode;
  lead?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cn("psection scroll-mt-28", className)}>
      <Wrap>
        {title ? (
          <div className="psection__head">
            <h2>{title}</h2>
            {lead ? <p>{lead}</p> : null}
          </div>
        ) : null}
        {children}
      </Wrap>
    </section>
  );
}

/** A sheet of paper lying on the page. */
export function Panel({
  children,
  className,
  ink = false,
  tight = false,
}: {
  children: React.ReactNode;
  className?: string;
  /** The one section on the page that matters more than the others. */
  ink?: boolean;
  tight?: boolean;
}) {
  return (
    <div
      className={cn(
        "panelcard",
        ink && "panelcard--ink",
        tight && "panelcard--tight",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * A figure that is an intention rather than a fact.
 *
 * Amber, never coral: coral is this site's "press this", and a caveat that
 * looks like a call to action is worse than no caveat at all.
 */
export function Provisional({ children = "provisional" }: { children?: React.ReactNode }) {
  return <span className="provisional">{children}</span>;
}

/** A card in an index grid, with a colour bar so a grid reads as a spectrum. */
export function IndexCard({
  href,
  bar,
  title,
  children,
  more = "Read",
}: {
  href: string;
  bar: string;
  title: React.ReactNode;
  children: React.ReactNode;
  more?: string;
}) {
  return (
    <Link href={href} className="indexcard">
      <span className="indexcard__bar" style={{ background: bar }} aria-hidden="true" />
      <h3>{title}</h3>
      <p>{children}</p>
      <span className="indexcard__more">{more} →</span>
    </Link>
  );
}

/** The six colours the index grids cycle through, in palette order. */
export const BARS = [
  "var(--orchid)",
  "var(--tangerine)",
  "var(--citrus)",
  "var(--mint)",
  "var(--sky)",
  "var(--lilac)",
];

/**
 * A hub's index, as a grid across the whole page.
 *
 * The guides and comparison hubs used to list their children inside the
 * reading measure, which turns a choice between four things into a column you
 * scroll past. An index is a grid.
 *
 * Each card ends on the one sentence that guide settles, because a hub
 * listing four titles and four summaries makes the reader open all four to
 * find out whether any of them is about their problem.
 */
export function HubGrid({
  title,
  lead,
  items,
}: {
  title: React.ReactNode;
  lead?: React.ReactNode;
  items: Array<{ href: string; title: React.ReactNode; body: React.ReactNode; more?: string }>;
}) {
  return (
    <PSection title={title} lead={lead}>
      <div className={items.length === 4 ? "cardgrid cardgrid--2" : "cardgrid"}>
        {items.map((item, i) => (
          <IndexCard
            key={item.href}
            href={item.href}
            bar={BARS[i % BARS.length]}
            title={item.title}
            more={item.more}
          >
            {item.body}
          </IndexCard>
        ))}
      </div>
    </PSection>
  );
}
