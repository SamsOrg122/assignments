import Link from "next/link";
import {
  Breadcrumbs,
  CallToAction,
  Contents,
  FAQ,
  H3,
  JsonLd,
  RelatedPages,
  Table,
  Takeaway,
  type TocItem,
} from "@/components/landing/LongForm";
import { H2, P, PageShell } from "@/components/landing/PageShell";
import {
  type FaqItem,
  breadcrumbJsonLd,
  faqJsonLd,
  page,
  pageJsonLd,
  pageMetadata,
} from "@/lib/seo";

const SLUG = "/guides/work-offline" as const;

export const metadata = pageMetadata(SLUG);

const TOC: TocItem[] = [
  { id: "where-work-lives", label: "Where the work lives" },
  { id: "service-worker", label: "The app itself, cached" },
  { id: "other-tools", label: "Google, Microsoft and Notion" },
  { id: "side-by-side", label: "Side by side" },
  { id: "backup", label: "What a backup file contains" },
  { id: "limits", label: "What browser storage cannot promise" },
  { id: "database", label: "What a database changes" },
  { id: "faq", label: "Questions people ask" },
];

const FAQS: FaqItem[] = [
  {
    question: "Does Google Docs work offline?",
    answer:
      "Yes, in Chrome or Edge with the Google Docs Offline extension installed and offline access enabled in Drive settings — but only for files you marked as available offline before you lost connection. The ordering is the trap: the setup needs the network you are preparing to lose.",
  },
  {
    question: "Does Notion work offline?",
    answer:
      "Yes, since 2024, on desktop and mobile. Recently visited pages are available automatically, and you can mark a page or a whole teamspace Available offline from its \u2022\u2022\u2022 menu. What you never opened and never marked will not open, and edits can conflict on sync.",
  },
  {
    question: "What happens to my edits when I get back online?",
    answer:
      "A server-first tool queues your changes and replays them, and a conflict is possible wherever the same paragraph changed twice. Here nothing is replayed, because nothing was waiting — the edits went into this browser as you typed. Reconnecting matters only with a database configured, and the rule there is per project, not per paragraph: the newer timestamp wins.",
  },
  {
    question: "Does Tougather work offline?",
    answer:
      "Yes, with nothing to switch on and no account to make. Your work is written into this browser's own storage as you type, so the only thing that ever needed a network was the app itself, and a service worker keeps a copy of that. What does not work offline is anything behind /api: account sync, live sessions, the hosted assistant. Those are never cached, deliberately, so one account's data cannot be replayed to whoever opens the browser next. Chat is stored here too, but its shipped transport is simulated with scripted peers, so no message reaches a colleague online either.",
  },
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

export default function WorkOfflineGuidePage() {
  return (
    <PageShell
      eyebrow="Guide"
      title={page(SLUG).h1}
      lead="Offline is rarely a plane. It is a train through a tunnel, a basement seminar room, campus wifi that authenticates you and then forwards nothing. What survives it was decided long beforehand, by where your tool keeps the work."
    >
      <JsonLd
        data={[breadcrumbJsonLd(SLUG), pageJsonLd(SLUG), faqJsonLd(FAQS)]}
      />
      <Breadcrumbs slug={SLUG} />

      <p className="mb-8 text-[12.5px] text-fg-subtle">
        <Link
          href="/nl/gidsen/offline"
          hrefLang="nl"
          lang="nl"
          className="text-fg-muted underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg"
        >
          Deze pagina in het Nederlands
        </Link>
      </p>

      <Contents slug={SLUG} items={TOC} />

      <Takeaway title="The short version">
        In Google Docs and Notion, offline is a cached copy of something on a
        server, arranged in advance. Here the browser holds the original, so
        there is nothing to arrange — and nothing on a server to fall back on.
        The second half is the part this page will not skip.
      </Takeaway>

      <H2 id="where-work-lives">Where the work lives</H2>
      <P>
        Two designs, and every difference below follows from which one a tool
        picked. In the first, the work sits on a server and your browser holds a
        view of it, so offline means caching a copy in advance and reconciling
        later. In the second, the browser is where the work is written, and the
        server holds the copy.
      </P>
      <P>
        Tougather is the second, and there is no account to make: the free plan
        has no login. What you type goes into this browser&apos;s local storage
        under six keys — projects, chat, team, appearance, kit and templates —
        with the kit&apos;s fonts and pictures in IndexedDB, a typeface being
        far too big for the quota those six share. Writes are coalesced for 250
        ms, then flushed on <code>pagehide</code> and on the tab being hidden
        rather than on <code>beforeunload</code>, which some browsers ignore.
      </P>

      <H2 id="service-worker">The app itself, cached</H2>
      <P>
        The only thing that genuinely needed a network was the app: the
        JavaScript that draws the editor. A service worker holds it. Navigations
        go to the network first with the cached shell behind them; cache-first
        there would pin you to a stale build until you cleared your browser.
        Files under <code>/_next/static/</code> come from cache first, their
        names carrying a content hash. Three paths are cached up front — the
        library, the offline page, the logo — and the rest enters the cache the
        first time you open it online.
      </P>
      <P>
        Requests to <code>/api/</code> are never cached at all, so a row fetched
        for one account cannot be replayed to whoever opens the browser next.
        Everything through the server is therefore gone while the network is:
        account sync, live sessions, the hosted assistant. The local AI stub
        answers and says that it is local. A web manifest makes the app
        installable, opening standalone at the library, but there is no native
        build — no React Native, Capacitor, Expo, Electron or Tauri in{" "}
        <code>package.json</code>. An installed copy is the same engine minus an
        address bar: same storage, same ceiling.
      </P>

      <H2 id="other-tools">Google, Microsoft and Notion</H2>

      <H3 id="google">Google Docs, Sheets and Slides</H3>
      <P>
        Chrome or Edge, the Google Docs Offline extension, offline access on in
        Drive&apos;s settings, then mark the files. Everything offline is not
        the default, and what you did not mark will not open. See{" "}
        <A href="/compare/google-workspace">
          Google Workspace compared in full
        </A>
        .
      </P>

      <H3 id="microsoft">Microsoft 365</H3>
      <P>
        Which Microsoft 365 you mean decides the answer. The desktop apps were
        offline-first before the word existed: the file is on your disk and
        OneDrive reconciles when it can. The browser versions of Word and Excel
        are not a substitute, and a university licence usually means the desktop
        apps.
      </P>

      <H3 id="notion">Notion</H3>
      <P>
        Yes, and better than it used to be. Recently visited pages are
        available automatically, and a page or a whole teamspace can be marked
        Available offline from its &bull;&bull;&bull; menu. What you never
        opened and never marked will not open.{" "}
        <A href="/compare/notion">The full Notion comparison</A> covers the
        rest.
      </P>

      <H2 id="side-by-side">Side by side</H2>
      <Table
        caption="Offline behaviour, tool by tool. Five of these seven rows go against Tougather."
        columns={["", "Google Docs", "Microsoft 365 desktop", "Notion", "Tougather"]}
        minWidth={860}
        rows={[
          [
            "Setup before the connection goes",
            "Extension, offline access on, files marked.",
            "None.",
            "Automatic for recent pages; anything else you mark in advance.",
            "None.",
          ],
          [
            "What opens with no network",
            "Only what you marked.",
            "Any file on your disk.",
            "Pages you have visited.",
            "Everything this browser holds.",
          ],
          [
            "Where it sits when the tab is closed",
            "Google's servers, plus a cache.",
            "A real file on disk, openable by other programs.",
            "Notion's servers, plus a cache.",
            "This browser's storage. No file until you export.",
          ],
          [
            "Clear your browser data and…",
            "Sign in again. Nothing lost.",
            "Irrelevant. The file is on disk.",
            "Sign in again. Nothing lost.",
            "Gone, without a backup file or a database.",
          ],
          [
            "Getting it to a second device",
            "Automatic.",
            "OneDrive reconciles.",
            "Automatic.",
            "Carry a backup file, or configure a database.",
          ],
          [
            "How much it holds",
            "Server-side.",
            "As much as the disk.",
            "Server-side.",
            "50,000 rows comfortable. 100,000 refused.",
          ],
          [
            "Installed app",
            "Browser, or the mobile apps.",
            "Native desktop apps.",
            "Desktop and mobile apps.",
            "An installable PWA. Nothing native.",
          ],
        ]}
      />

      <H2 id="backup">What a backup file contains</H2>
      <P>
        One JSON file, and it is the workspace rather than a list of it: the six
        store payloads exactly as local storage holds them, plus the kit&apos;s
        fonts and pictures read back out of IndexedDB — a backup naming your
        typefaces without carrying them is the worst kind of half-working. It is
        stamped with a format marker and a version, and named for the day:{" "}
        <code>tougather-2026-08-13.json</code>.
      </P>
      <P>
        Queued writes are flushed first, so a file taken a quarter of a second
        after your last edit still contains it. Restoring is destructive and
        therefore two steps: parsed, described back to you with a project count
        and an export date, applied only once you confirm. A file from a newer
        version is refused rather than half-read. Settings warns you separately
        once this origin is past 80% of its quota.
      </P>

      <H2 id="limits">What browser storage cannot promise</H2>

      <H3 id="ceiling">The measured ceiling</H3>
      <P>
        Measured, not estimated: a script opens a table of N rows, types one
        character and times the round trip to storage. A thousand rows is 0.1 MB
        and opens in 0.45 s. Fifty thousand is 3.4 MB, opens in 0.56 s and puts
        a keystroke on screen in 118 ms. A hundred thousand rows is 6.8 MB and
        is refused: browser storage is full. The ceiling is the storage, not the
        grid — millions of rows need a different storage model, which is real
        work rather than a setting and is not done.
      </P>

      <H3 id="refused">When the browser says no</H3>
      <P>
        A bar then appears across the top of the app and does not dismiss. It
        says the two useful things: the changes on screen are no longer being
        saved, and how large the write was that the browser turned down. It
        appears only on a genuine refusal, never at a percentage, because a bar
        that cries wolf is one people learn to scroll past. The refused value
        stays queued, so deleting something lets the next flush land it.
      </P>

      <H3 id="eviction">Eviction, and the sentence that matters</H3>
      <P>
        Browsers evict best-effort storage under pressure without telling
        anyone, and you find out by opening an empty library. The app asks for
        persistent storage, which takes this origin out of that pool: Chrome
        grants it silently on engagement, Firefox asks, Safari ignores the
        request, and Settings shows which answer you got. Even granted, it stops
        only <em>automatic</em> eviction. Clearing site data by hand still
        removes everything, and so do a shared laptop, a wiped machine and a
        stolen bag. Work held in a browser is not backed up, and no service
        worker changes that. There are two answers — the file above and a
        database — and one needs somebody to press a button. For work that runs
        for months, read this beside{" "}
        <A href="/guides/write-a-thesis">
          writing a thesis without a connection
        </A>
        .
      </P>

      <H2 id="database">What a database changes</H2>
      <P>
        Two public environment variables, and the browser stops being the only
        place. Sync then pushes and pulls whole projects. It is not a CRDT: one
        project is one document and the newer timestamp wins, which is honest
        about what it is for — the same person on a laptop and then a phone, not
        two people at once. A pull never deletes a project it has not seen
        before, a failed pull cancels the push, and a deletion is a stored
        tombstone that survives having been made offline. The same variables
        make form answers land somewhere and switch on the audit log, withheld
        without a database on purpose: a log of one browser is a diary.{" "}
        <A href="/guides">The rest of our guides</A> pick up from there.
      </P>

      <H2 id="faq">Questions people ask</H2>
      <FAQ items={FAQS} />

      <CallToAction href="/library" label="Open the library">
        No account, nothing to install, nothing to switch on first. Make
        something, turn the wifi off, and reload the page.
      </CallToAction>

      <RelatedPages slug={SLUG} />
    </PageShell>
  );
}
