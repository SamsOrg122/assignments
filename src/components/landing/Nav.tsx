"use client";

/**
 * Storefront navigation.
 *
 * Editorial rather than the usual floating glass pill: a full-width rule, the
 * wordmark set in the page's display serif, and links in small letterspaced
 * Geist. The two faces meet here first, which is the point — the bar is the
 * first thing that has to say what kind of thing this is.
 *
 * It rides transparent over the photograph and condenses on scroll: the height
 * drops, a hairline appears, and the backdrop frosts. Three small changes
 * rather than one big one, so it reads as the page settling rather than as a
 * bar swapping itself out.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";
import { Logo } from "@/components/ui/Logo";
import { NavMenu, type NavMenuItem } from "./NavMenu";
import { HUBS, PAGES, childrenOf, type Lang, type Slug } from "@/lib/seo";

/**
 * Absolute rather than bare fragments: the bar renders on the sub-pages too,
 * where "#pricing" resolves to nothing at all.
 */
const LINKS = [
  { href: "/#product", label: "Product" },
  { href: "/#features", label: "Features" },
  { href: "/impact", label: "Impact" },
  { href: "/pricing", label: "Pricing" },
];

/**
 * The two dropdowns, built from the page registry rather than from a list
 * kept beside it.
 *
 * A menu maintained by hand is a menu that goes stale: the page ships, the
 * sitemap finds it, and the one place a person would look never mentions it.
 * `childrenOf` is the same call the hub pages make, so a new page appears in
 * all three places at once or in none of them.
 *
 * Sorted by label, not by the registry's order. The registry is ordered by
 * how much each page matters to us, which is exactly the wrong order for
 * somebody scanning for a word they already have in mind.
 */
const menuFor = (hub: Slug): NavMenuItem[] => {
  const entry = PAGES[hub];
  const children = childrenOf(hub)
    .map((child) => ({
      href: child.slug,
      label: child.nav,
      hint: child.summary,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, entry.lang));
  return [{ href: entry.slug, label: entry.nav }, ...children];
};

const ALL_IN = (lang: Lang) => HUBS.filter((hub) => PAGES[hub].lang === lang);

export function Nav() {
  const [lifted, setLifted] = useState(false);
  const pathname = usePathname();
  /*
   * Which language this part of the storefront is written in.
   *
   * Taken from the URL rather than from the interface preference, because
   * these are documents: somebody reading the Dutch comparison should be
   * offered the other Dutch pages, whatever language their app is set to.
   */
  const lang: Lang = pathname?.startsWith("/nl") ? "nl" : "en";

  useEffect(() => {
    const onScroll = () => setLifted(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 transition-[background-color,border-color,backdrop-filter] duration-300",
        lifted
          ? "border-b border-line bg-canvas/72 backdrop-blur-xl"
          : "border-b border-transparent",
      )}
    >
      <nav
        aria-label="Main"
        className={cn(
          "mx-auto flex w-full max-w-[1240px] items-center gap-3 px-5 transition-[height] duration-300 sm:px-8",
          lifted ? "h-14" : "h-[72px]",
        )}
      >
        <Link href="/" className="group flex items-center gap-2.5 text-fg">
          {/* The mark itself, taking the nav's colour. */}
          <Logo
            size={20}
            className="transition-transform duration-300 group-hover:scale-110"
          />
          <span className="nav-wordmark text-[17px] leading-none tracking-[-0.01em]">
            Tougather
          </span>
        </Link>

        <ul className="ml-8 hidden items-center gap-6 md:flex">
          {ALL_IN(lang).map((hub) => (
            <li key={hub}>
              <NavMenu
                label={PAGES[hub].nav}
                items={menuFor(hub)}
                lang={lang === "nl" ? "nl" : undefined}
              />
            </li>
          ))}
          {LINKS.map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                // The underline grows from the left rather than fading in —
                // a rule that draws itself reads as a response to the pointer,
                // where an opacity change reads as a state flip.
                className="group relative block py-1 text-[12.5px] tracking-[0.01em] text-fg-muted transition-colors duration-150 hover:text-fg"
              >
                {l.label}
                <span
                  aria-hidden="true"
                  className="absolute -bottom-0.5 left-0 h-px w-full origin-left scale-x-0 bg-fg-muted transition-transform duration-300 ease-out group-hover:scale-x-100"
                />
              </a>
            </li>
          ))}
        </ul>

        <div className="ml-auto flex items-center gap-1.5">
          <MobileMenu lang={lang} />
          {/* An account is optional, so this sits beside "start writing"
              rather than in front of it — but it has to exist somewhere a
              returning user can find without opening Settings. */}
          <Link
            href="/signin"
            className="rounded-sm px-2.5 py-1.5 text-[12.5px] text-fg-muted transition-colors duration-150 hover:text-fg"
          >
            Sign in
          </Link>
          <Link
            href="/library"
            className="hidden rounded-sm px-2.5 py-1.5 text-[12.5px] text-fg-muted transition-colors duration-150 hover:text-fg sm:block"
          >
            Open Tougather
          </Link>
          <Link
            href="/library"
            className="group flex items-center gap-1.5 rounded-full border border-line-strong px-3.5 py-1.5 text-[12.5px] text-fg transition-colors duration-200 hover:border-fg-subtle hover:bg-surface"
          >
            Start writing
            <Icon
              name="arrow-right"
              size={12}
              className="text-fg-subtle transition-transform duration-200 group-hover:translate-x-0.5"
            />
          </Link>
        </div>
      </nav>
    </header>
  );
}

/**
 * The same navigation, on a screen too narrow for a bar.
 *
 * A panel rather than a set of dropdowns: on a phone the whole thing fits in
 * one scroll, and a menu inside a menu is a place to get lost. Escape and a
 * tap outside close it, the button says whether it is open, and choosing
 * something closes it on the way out.
 */
function MobileMenu({ lang }: { lang: Lang }) {
  const pathname = usePathname();
  /*
   * Keyed on the path so that navigating closes it.
   *
   * The obvious way — an effect that sets `open` to false when the path
   * changes — is a second render for something the first render already knew,
   * and React's own lint rule refuses it. A `key` throws the panel away and
   * builds a closed one in its place, in one pass. The open state has to live
   * *inside* the keyed component for that to mean anything.
   */
  return <MenuPanel key={pathname} lang={lang} />;
}

function MenuPanel({ lang }: { lang: Lang }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="storefront-menu"
        aria-label={lang === "nl" ? "Menu" : "Menu"}
        onClick={() => setOpen((was) => !was)}
        className="flex items-center gap-1.5 rounded-sm px-2 py-1.5 text-[12.5px] text-fg-muted transition-colors duration-150 hover:text-fg"
      >
        <Icon name={open ? "x" : "list"} size={13} />
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label={lang === "nl" ? "Menu sluiten" : "Close menu"}
            onClick={() => setOpen(false)}
            className="fixed inset-0 top-14 z-40 cursor-default bg-black/40"
          />
          <div
            id="storefront-menu"
            lang={lang === "nl" ? "nl" : undefined}
            className="anim-pop fixed inset-x-3 top-14 z-50 max-h-[75vh] overflow-y-auto rounded-lg border border-line-strong bg-surface p-3 shadow-[0_24px_70px_-12px_rgba(0,0,0,0.75)]"
          >
            {ALL_IN(lang).map((hub) => (
              <div key={hub} className="mb-3 last:mb-0">
                <p className="label-mono mb-1.5">{PAGES[hub].nav}</p>
                <ul className="flex flex-col">
                  {menuFor(hub).map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className="block rounded-md px-2 py-2 text-[13px] text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
                      >
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <div className="border-t border-line pt-2">
              <ul className="flex flex-col">
                {LINKS.map((l) => (
                  <li key={l.href}>
                    <a
                      href={l.href}
                      onClick={() => setOpen(false)}
                      className="block rounded-md px-2 py-2 text-[13px] text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
                    >
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
