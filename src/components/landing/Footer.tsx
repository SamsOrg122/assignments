/**
 * Footer.
 *
 * Quiet. The only thing it argues for is the transparency column, which is
 * where someone sceptical about the impact claim goes next — so it sits first,
 * not buried after four columns of marketing links.
 *
 * FOUNDER: `href: null` renders as un-linked text with a "coming" marker
 * rather than a dead link. Fill in the URL and it becomes a link.
 */

import Link from "next/link";
import { CTA } from "./primitives";
import { IMPACT, percent } from "@/lib/impact/config";

interface FooterLink {
  label: string;
  href: string | null;
}

const COLUMNS: Array<{ title: string; links: FooterLink[] }> = [
  {
    title: "Transparency",
    links: [
      { label: "How impact works", href: "#impact" },
      { label: "Where the money goes", href: "#impact" },
      { label: "Impact reports", href: null },
      { label: "Planting partner", href: null },
      { label: "Independent review", href: null },
    ],
  },
  {
    title: "Product",
    links: [
      { label: "Overview", href: "#product" },
      { label: "Features", href: "#features" },
      { label: "Pricing", href: "#pricing" },
      { label: "Open Assignments", href: "/library" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: null },
      { label: "Contact", href: null },
      { label: "Status", href: null },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Terms", href: null },
      { label: "Privacy", href: null },
      { label: "Impact commitment", href: null },
      { label: "Cookies", href: null },
    ],
  },
];

export function Footer() {
  return (
    <footer className="relative border-t border-line">
      <div className="mx-auto w-full max-w-[1240px] px-5 py-14 sm:px-8">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,2fr)]">
          <div>
            <Link
              href="/"
              className="flex w-fit items-center gap-2.5 text-[14px] font-medium text-fg"
            >
              <span
                aria-hidden="true"
                className="grid size-6 place-items-center rounded-sm bg-fg text-[11px] font-semibold text-canvas"
              >
                A
              </span>
              Assignments
            </Link>
            <p className="mt-3 max-w-[38ch] text-[13px] leading-relaxed text-fg-muted text-pretty">
              Everything you make, in one place — and{" "}
              {percent(IMPACT.shareOfRevenue.value)} of every euro set aside for
              something growing.
            </p>
            <CTA href="/library" className="mt-5">
              Start writing
            </CTA>
          </div>

          <nav
            aria-label="Footer"
            className="grid grid-cols-2 gap-8 sm:grid-cols-4"
          >
            {COLUMNS.map((col) => (
              <div key={col.title}>
                <h2 className="text-[12.5px] font-medium text-fg">
                  {col.title}
                </h2>
                <ul className="mt-3 space-y-2">
                  {col.links.map((l) => (
                    <li key={l.label}>
                      {l.href ? (
                        <Link
                          href={l.href}
                          className="text-[12.5px] text-fg-muted transition-colors duration-150 hover:text-fg"
                        >
                          {l.label}
                        </Link>
                      ) : (
                        <span
                          title="Not published yet."
                          className="inline-flex items-center gap-1.5 text-[12.5px] text-fg-subtle"
                        >
                          {l.label}
                          <span className="rounded-xs border border-line px-1 py-px text-[9px] text-fg-subtle">
                            soon
                          </span>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11.5px] text-fg-subtle">
            © {new Date().getFullYear()} Assignments.
          </p>
          <p className="max-w-[62ch] text-[11.5px] leading-relaxed text-fg-subtle text-pretty">
            Figures marked provisional on this page are working assumptions, not
            verified facts. No planting partner has been appointed and no
            independent review has taken place.
          </p>
        </div>
      </div>
    </footer>
  );
}
