/**
 * The footer.
 *
 * Every link goes somewhere that exists. The design this came from listed
 * Blog, Vacatures and Pers under a company that has none of them — a footer
 * full of dead links is the cheapest possible way to tell a visitor the rest
 * of the page might be decoration too.
 */

import Link from "next/link";
import { Mark } from "./Chrome";

const COLUMNS: Array<{ head: string; links: Array<[string, string]> }> = [
  {
    head: "Product",
    links: [
      ["Download", "/download"],
      ["Pricing", "/pricing"],
      ["Compare", "/compare"],
      ["Open Tougather", "/library"],
    ],
  },
  {
    head: "Impact",
    links: [
      ["The commitment", "/impact"],
      ["Where the money goes", "/impact#split"],
      ["Planting partner", "/impact#partner"],
    ],
  },
  {
    head: "Learn",
    links: [
      ["Guides", "/guides"],
      ["Write a thesis", "/guides/write-a-thesis"],
      ["Work offline", "/guides/work-offline"],
    ],
  },
  {
    head: "Company",
    links: [
      ["About", "/about"],
      ["Contact", "/contact"],
      ["Terms", "/legal"],
      ["Privacy", "/legal#privacy"],
    ],
  },
];

export function Footer() {
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="footer__grid">
          <div className="footer__brand">
            <Link className="brand" href="/">
              <Mark />
              Tougather
            </Link>
            <p>
              A browser with assistants in it, built by people who wanted one and could not find it.
            </p>
          </div>
          {COLUMNS.map((col) => (
            <div key={col.head}>
              <h6>{col.head}</h6>
              <ul>
                {col.links.map(([label, href]) => (
                  <li key={href + label}>
                    <Link href={href}>{label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="footer__bottom">
          <span>© {new Date().getFullYear()} Tougather.</span>
          <span className="lang">
            <Link href="/" data-on>
              EN
            </Link>
            <Link href="/nl/vergelijk">NL</Link>
          </span>
        </div>
      </div>
    </footer>
  );
}
