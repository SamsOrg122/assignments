/**
 * The pieces a long article needs that a short document page doesn't.
 *
 * `PageShell` gives a page its frame, its `<h1>` and a readable column, and
 * that is enough for `/about`. A three-thousand-word comparison needs more:
 * somewhere to jump from, a table it can put a real comparison in, an FAQ, and
 * a way out at the end. This file is those pieces and nothing else — it
 * composes `PageShell`'s parts rather than replacing them, so there is still
 * one shell and one set of headings.
 *
 * Everything that links anywhere reads from `src/lib/seo.ts`. A page author
 * writes prose; the breadcrumbs, the related block and the structured data all
 * come from the registry, so they cannot describe a page that no longer exists
 * or a title that has since been rewritten.
 */

import Link from "next/link";
import {
  type FaqItem,
  type JsonLdObject,
  type Slug,
  breadcrumbTrail,
  page,
  relatedTo,
} from "@/lib/seo";
import { CTA } from "./primitives";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

/* Re-exported so a long-form page imports one module. The heading itself is
   defined in PageShell.tsx, next to H2, because that is where heading levels
   live. */
export { H3 } from "./PageShell";

/**
 * The handful of words this file renders that aren't the author's.
 *
 * Deliberately *not* in `src/lib/i18n/dictionary.ts`. That dictionary switches
 * with the reader's stored interface preference, which is right for a button
 * and wrong here: on `/nl/gidsen/formules` the contents heading must say "Op
 * deze pagina" whether or not the reader has ever touched the language
 * setting. These follow the URL, so they follow the registry.
 */
const WORDS = {
  en: {
    breadcrumb: "Breadcrumb",
    contents: "On this page",
    related: "Related",
  },
  nl: {
    breadcrumb: "Kruimelpad",
    contents: "Op deze pagina",
    related: "Verder lezen",
  },
} as const;

/* ── Structured data ────────────────────────────────────── */

/**
 * JSON-LD, as a native `<script>`.
 *
 * `next/script` is for loading and executing JavaScript; this is data, so the
 * Next guide says a plain tag is the right choice and this follows it. The
 * `<` replacement is not decoration — `JSON.stringify` does not escape it, and
 * a `</script>` inside any string in the payload would close this tag and
 * start executing whatever came after. Nothing in the registry is
 * user-supplied today; the escape is what keeps that from mattering later.
 *
 * Pass an array to emit several graphs — breadcrumb, page, FAQ — as separate
 * tags, which is what crawlers expect.
 */
export function JsonLd({ data }: { data: JsonLdObject | JsonLdObject[] }) {
  const items = Array.isArray(data) ? data : [data];
  return (
    <>
      {items.map((item, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(item).replace(/</g, "\\u003c"),
          }}
        />
      ))}
    </>
  );
}

/* ── Navigation within the page ─────────────────────────── */

/**
 * Home → hub → here. Sits at the top of the body, above the first `H2`.
 *
 * The visible trail and `breadcrumbJsonLd` are the same array from the same
 * function, so the markup can't claim a path the reader isn't looking at.
 */
export function Breadcrumbs({ slug }: { slug: Slug }) {
  const words = WORDS[page(slug).lang];
  const crumbs = breadcrumbTrail(slug);

  return (
    <nav aria-label={words.breadcrumb} className="mb-8 text-[12.5px]">
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
        {crumbs.map((crumb, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li key={crumb.href} className="flex items-center gap-x-1.5">
              {i > 0 && <Icon name="chevron-right" size={10} className="text-fg-subtle" />}
              {last ? (
                <span aria-current="page" className="text-fg-subtle">
                  {crumb.name}
                </span>
              ) : (
                <Link
                  href={crumb.href}
                  className="text-fg-muted transition-colors hover:text-fg"
                >
                  {crumb.name}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export interface TocItem {
  /** Must match the `id` passed to an `H2` on the page. */
  id: string;
  label: string;
}

/**
 * The table of contents.
 *
 * Plain `<a href="#id">` rather than `next/link`: a hash on the current page
 * is the one navigation the browser already does perfectly, and routing it
 * through the router buys nothing. `H2` carries `scroll-mt-24`, so a jumped-to
 * heading clears the sticky nav on arrival.
 */
export function Contents({
  slug,
  items,
  title,
}: {
  slug: Slug;
  items: readonly TocItem[];
  /** Override only if the registry's language is not the right label. */
  title?: string;
}) {
  if (items.length === 0) return null;
  const words = WORDS[page(slug).lang];
  const headingId = "contents-heading";

  return (
    <nav
      aria-labelledby={headingId}
      className="mt-8 rounded-md border border-line bg-surface p-4"
    >
      <h2 id={headingId} className="label-mono text-fg-subtle">
        {title ?? words.contents}
      </h2>
      <ol className="mt-3 space-y-1.5">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              className="text-[13.5px] leading-relaxed text-fg-muted transition-colors hover:text-fg"
            >
              {item.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/* ── The comparison table ───────────────────────────────── */

/** `Formulas and functions` → `formulas-and-functions`. */
function anchorId(text: string): string {
  const slug = text
    .normalize("NFD")
    // Strip the combining marks NFD just split off, so a Dutch heading
    // with a diaeresis still produces a plain ASCII id.
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "table";
}

/**
 * A comparison table: semantic, captioned, and scrollable on a narrow screen.
 *
 * The accessibility rule this repo already writes down in `TableBlock.tsx` —
 * *the scroll container is not the table* — applies here in the other
 * direction. A `<div class="overflow-x-auto">` wrapped round a table is a
 * generic box: it takes focus away from nothing, announces nothing, and on a
 * phone it is a region a keyboard cannot scroll. So the wrapper gets
 * `role="region"`, a `tabIndex` and a label pointing at the table's own
 * `<caption>` — and the table keeps every one of its own roles, because
 * nothing was put *on* the table or between it and its rows.
 *
 * The caption is required rather than optional. A table that cannot be
 * described in a line is usually two tables.
 *
 * First cell of each row is a `<th scope="row">`: in a comparison the left
 * column is what the row is *about*, and a screen reader reading a cell out of
 * context needs it to say "Offline editing — partial" rather than "partial".
 *
 * `minWidth` keeps columns from crushing before the scroll kicks in. It is an
 * inline style because Tailwind's arbitrary values are static and this is a
 * prop. `PageShell` holds the body to 68ch; the table scrolls inside that
 * measure rather than breaking out of it.
 */
export function Table({
  caption,
  columns,
  rows,
  id,
  minWidth = 560,
}: {
  caption: string;
  columns: readonly React.ReactNode[];
  /** One array per row. Cell 0 becomes the row header. */
  rows: readonly (readonly React.ReactNode[])[];
  /** Set when two tables on a page share a caption. */
  id?: string;
  minWidth?: number;
}) {
  const captionId = `${id ?? anchorId(caption)}-caption`;

  return (
    <div
      role="region"
      aria-labelledby={captionId}
      tabIndex={0}
      className="mt-6 overflow-x-auto rounded-md border border-line focus-visible:ring-1 focus-visible:ring-accent/60 focus-visible:outline-none"
    >
      <table
        className="w-full border-collapse text-left"
        style={{ minWidth }}
      >
        <caption
          id={captionId}
          className="border-b border-line px-3.5 py-2.5 text-left text-[12.5px] text-fg-subtle"
        >
          {caption}
        </caption>
        <thead>
          <tr className="border-b border-line-strong">
            {columns.map((column, i) =>
              // The corner cell heads nothing — the row labels below it are
              // themselves headers. An empty `<th scope="col">` announces a
              // column heading and then says nothing, which is what axe's
              // `empty-table-header` rule is about; a `<td>` is the corner.
              i === 0 && column === "" ? (
                <td key={i} className="w-[38%] px-3.5 py-2.5" />
              ) : (
                <th
                  key={i}
                  scope="col"
                  className={cn(
                    "px-3.5 py-2.5 text-[12.5px] font-medium text-fg",
                    i === 0 && "w-[38%]",
                  )}
                >
                  {column}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r} className="border-t border-line">
              {row.map((cell, c) =>
                c === 0 ? (
                  <th
                    key={c}
                    scope="row"
                    className="px-3.5 py-3 text-[13px] font-normal text-fg"
                  >
                    {cell}
                  </th>
                ) : (
                  <td
                    key={c}
                    className="px-3.5 py-3 text-[13px] leading-relaxed text-fg-muted"
                  >
                    {cell}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Questions, takeaways, the way out ──────────────────── */

/**
 * The FAQ list.
 *
 * No heading of its own — the page writes its own `H2` above this, in its own
 * language, and a component that guessed at that heading would be one more
 * string to translate.
 *
 * `items` is the same array `faqJsonLd` marks up. Pass it to both; the visible
 * answer and the marked-up answer are then the same string by construction,
 * which is what Google asks for and what stops the two drifting.
 */
export function FAQ({ items }: { items: readonly FaqItem[] }) {
  return (
    <div className="mt-6 divide-y divide-line border-t border-line">
      {items.map((item) => (
        <div key={item.question} className="py-5">
          <h3 className="text-[14.5px] font-medium text-fg text-pretty">
            {item.question}
          </h3>
          <p className="mt-2 text-[14px] leading-relaxed text-fg-muted text-pretty">
            {item.answer}
          </p>
        </div>
      ))}
    </div>
  );
}

/**
 * The short answer, boxed, for a reader who is skimming.
 *
 * The title is a `<p>` rather than a heading on purpose: this box turns up
 * wherever it is useful, including before the first `H2`, and a heading there
 * would put a hole in the page's outline for the sake of a bold line.
 */
export function Takeaway({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <aside className="mt-8 rounded-md border border-line-strong bg-surface p-4">
      <p className="flex items-center gap-2 text-[13px] font-medium text-fg">
        <span aria-hidden="true" className="size-1.5 rounded-full bg-accent" />
        {title}
      </p>
      <div className="mt-2 text-[13.5px] leading-relaxed text-fg-muted text-pretty">
        {children}
      </div>
    </aside>
  );
}

/**
 * The way out at the end of the article.
 *
 * Reuses the storefront's `CTA` rather than styling a second button. That
 * makes this a client boundary, which is fine and already how `PageShell`
 * imports `Section`: the surrounding page stays a server component.
 */
export function CallToAction({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  /** One or two plain sentences. Optional — the button can stand alone. */
  children?: React.ReactNode;
}) {
  return (
    <div className="mt-12 rounded-lg border border-line bg-surface p-5">
      {children && (
        <p className="max-w-[52ch] text-[14px] leading-relaxed text-fg-muted text-pretty">
          {children}
        </p>
      )}
      <CTA href={href} className={children ? "mt-4" : undefined}>
        {label}
      </CTA>
    </div>
  );
}

/**
 * Where to go next, from the registry's link map.
 *
 * Same language throughout — `seo.ts` refuses to hold a cross-language
 * `related` entry — so this can never turn into an accidental EN↔NL body link.
 * The card shows the short label and the registry's summary line, which means
 * a page's description of itself is written once and every page that links to
 * it stays current for free.
 */
export function RelatedPages({
  slug,
  title,
}: {
  slug: Slug;
  title?: string;
}) {
  const items = relatedTo(slug);
  if (items.length === 0) return null;
  const words = WORDS[page(slug).lang];
  const headingId = "related-heading";

  return (
    <nav
      aria-labelledby={headingId}
      className="mt-16 border-t border-line pt-8"
    >
      <h2 id={headingId} className="label-mono text-fg-subtle">
        {title ?? words.related}
      </h2>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <li key={item.slug}>
            <Link
              href={item.slug}
              className="group block h-full rounded-md border border-line p-4 transition-colors duration-150 hover:border-line-strong"
            >
              <span className="flex items-center gap-1.5 text-[14px] font-medium text-fg">
                {item.nav}
                <Icon
                  name="chevron-right"
                  size={12}
                  className="text-fg-subtle transition-transform duration-150 group-hover:translate-x-0.5"
                />
              </span>
              <span className="mt-1.5 block text-[13px] leading-relaxed text-fg-muted text-pretty">
                {item.summary}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
