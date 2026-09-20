import type { Metadata } from "next";
import Link from "next/link";
import { H2, H3, List, NotYet, P, PageShell } from "@/components/landing/PageShell";
import { BROWSER_VERSION, CHROMIUM_MAJOR, ELECTRON_MAJOR } from "@/lib/browser";
import { IMPACT, percent } from "@/lib/impact/config";

export const metadata: Metadata = {
  title: "What Tougather is",
  // Its own URL, said out loud. The sitemap advertises this page, and a
  // page in a sitemap with no canonical leaves the choice of URL to a crawler.
  alternates: { canonical: "/about" },
  description:
    "A browser, a workspace and an assistant in one window — what each part actually does, who pays for the thinking, and what this is not.",
};

/**
 * The page that explains the product properly.
 *
 * ── WHY IT WAS REWRITTEN ────────────────────────────────────────────────
 * This page argued, well, for a workspace that replaces four apps — and it
 * was written before there was a browser, so it never mentioned the thing the
 * homepage now leads with. Somebody who clicked "About" from a page about a
 * browser arrived at an essay about document formats.
 *
 * A landing page has four seconds and a slogan. This is the other half of
 * that bargain: the place where somebody who is interested can read what each
 * part actually does, in order, with the awkward bits in the same voice as
 * the good ones. Every claim here is one the product makes good on; the ones
 * it does not yet are under "What this is not" and on the download page,
 * which is the deal the rest of the site is built on.
 */
export default function AboutPage() {
  const share = percent(IMPACT.shareOfRevenue.value);

  return (
    <PageShell
      eyebrow="About"
      title="A browser, a workspace, and an assistant that costs you nothing extra."
      lead="One window instead of four apps and a tab you lost, with the AI running on the plan you already pay for rather than on a meter of ours."
      glow={["var(--lilac)", "var(--sky)"]}
    >
      <H2 id="what">What it is, exactly</H2>
      <P>
        Tougather is a desktop program you install. It is three things sharing
        one window, and it is worth being precise about which is which, because
        most of what is confusing about this category is that nobody says.
      </P>

      <H3>1. A browser</H3>
      <P>
        A real one — Chromium underneath, the open web, your bookmarks, your
        logins. Tabs live in a sidebar rather than shrinking along the top, two
        pages can sit side by side in one window, and a workspace is a
        genuinely separate session: signed in to work in one and to your own
        account in another, at the same time, without incognito and without a
        second browser. A private workspace keeps nothing at all — it is not
        in the session file, it does not come back with Ctrl+Shift+T, and it
        does not exist for the assistant.
      </P>

      <H3>2. A workspace</H3>
      <P>
        Documents, spreadsheets, slides, an infinite board, code and your
        team&apos;s conversation, on one document model rather than in five file
        formats. It is served from inside the download at{" "}
        <code>tougather://app</code>, so it opens instantly and works with no
        network; only the billing side goes out over the wire, and that side
        knows nothing about your tabs.
      </P>

      <H3>3. An assistant</H3>
      <P>
        Give it a job with ⌘J and it opens its own tab and gets on with it
        while you keep working in yours. It never takes your screen and never
        drives your mouse. It starts in an empty workspace of its own with no
        logins in it, and anything that reaches into a tab of yours asks you
        first — every single action, valid for one minute, never on a password
        or a payment field, and there is no &ldquo;always allow&rdquo;.
      </P>

      <H3>And a guide, which is the assistant turned around</H3>
      <P>
        Press Ctrl+Shift+G on any page and ask a question about the page you
        are looking at — <em>where do I turn this off?</em> Instead of doing it
        for you, it draws a ring around the thing, writes one sentence next to
        it, and stops. If the answer takes four steps it says &ldquo;2 of
        4&rdquo; and waits for you to press Next; Stop is always beside it, and
        Escape clears the ring.
      </P>
      <P>
        It is allowed less than the assistant is, not more. For a question
        about your page it gets the layout — headings, buttons, their names —
        and never the running text and never what is in a field, because
        pointing at something does not require reading it. It cannot open a
        page, cannot click and cannot type: that is not a setting but a lock on
        the door it comes through, and it is the reason the ring is drawn
        inside the page rather than on a layer over it, so every click still
        reaches the website underneath.
      </P>

      <H2 id="thinking">Who pays for the thinking</H2>
      <P>
        This is the part that makes Tougather different from every other AI
        browser, so here is the mechanism rather than the slogan.
      </P>
      <P>
        The others buy model calls wholesale and resell them to you. That is a
        real cost on their side, so it has to arrive on yours as a credit meter
        or a second subscription, and it means your pages and your drafts are
        uploaded to their servers to be looked at — under their retention
        policy, not yours.
      </P>
      <P>
        Tougather does not make the call. It starts the coding agent that is
        already installed and already signed in on your machine, as a child
        process, on the plan you are already paying for. Nothing is metered by
        us because there is nothing for us to meter, there is no key of ours in
        the download to leak, and your text never passes a server of ours. The
        agent starts with its own tools switched off — no shell, no file
        access, and none of the servers you have connected elsewhere — and is
        allowed exactly the tools this browser gives it.
      </P>
      <P>
        If you have no agent installed, you can put your own API key in
        Settings instead. It is stored through your system keychain and the
        request goes from your machine straight to the API — it never touches a
        server of ours, and the browser still ships without a key of its own.
        That path opens no local port at all, because the loop runs inside the
        browser rather than as a child process that has to knock.
      </P>

      <H2 id="why">Why one window and not four apps</H2>
      <P>
        A thesis lives in a document, its numbers in a spreadsheet, its defence
        in a deck, its thinking on a whiteboard, its sources in a browser tab
        and its coordination in a chat app. Six places to look, and a set of
        copies that start drifting apart the moment you make the second one.
      </P>
      <P>
        Nothing about that is necessary. A table and the chart that reads from
        it are the same data seen twice — they should be one object, not two
        files. A pile of stickies and the document they become are the same
        idea at two stages, so promoting one into the other should be a
        keystroke rather than an afternoon of retyping. And the page you are
        reading and the paragraph you are writing about it should not be in two
        different programs. That is the whole design brief: fewer copies, fewer
        seams, one place.
      </P>

      <H2 id="not">What this is not</H2>
      <P>
        It is not an AI that does your work. Every suggestion arrives as a
        proposal with accept and discard, because a tool that edits your thesis
        while you are reading a different paragraph is a tool you have to check
        constantly — which costs more than doing it yourself.
      </P>
      <P>
        It is also not free of opinions. There is one accent colour, five deck
        themes and a small set of fonts, because a formatting surface with
        every option is how documents end up looking like ransom notes. Power
        is in what you can build, not in how many ways you can style it.
      </P>
      <P>
        It is <strong className="font-medium text-fg">not a replacement for
        Microsoft 365 or Google Workspace</strong>, whatever the shape of the
        argument above suggests. There is no email and no calendar, which for
        most people is the larger half of what Outlook is. There is no
        organisation-wide administration — no single sign-on, no audit log, no
        retention policy — so a school&apos;s IT department has nothing here to
        approve. Sharing is per-link rather than per-group. Keep the mail and
        the calendar you have; this replaces the four apps you make things in,
        which is a smaller claim and a true one.
      </P>
      <P>
        And as a browser it is version {BROWSER_VERSION}, which is early. The
        things it does not have yet are not a secret:
      </P>
      <List
        items={[
          <>
            <strong className="font-medium text-fg">No signing and no
            updater.</strong>{" "}
            Windows shows a warning on first run, macOS asks you to confirm in
            System Settings, and a new version means downloading it again. It
            runs Electron {ELECTRON_MAJOR} with Chromium {CHROMIUM_MAJOR} —
            current when the build was cut, and with no updater that gap opens
            by itself from the day you install it.
          </>,
          <>
            <strong className="font-medium text-fg">No extensions, no
            sync, no password manager.</strong>{" "}
            Deliberately, for now. Each one is its own project rather than
            something added on the way past. Bookmarks, find-in-page, downloads
            and history all work — and history skips private workspaces and the
            assistant&rsquo;s own tabs by design, not by setting.
          </>,
          <>
            <strong className="font-medium text-fg">No DRM video.</strong>{" "}
            Widevine is not bundled, so Netflix and Spotify will refuse to
            play. That is a licensing question rather than a bug.
          </>,
        ]}
      />
      <P>
        The full list, with what each one would take to fix, is on the{" "}
        <Link
          href="/download"
          className="text-fg-muted underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg"
        >
          download page
        </Link>{" "}
        — before you install it rather than after.
      </P>

      <H2 id="money">The money</H2>
      <P>
        The browser is free and stays free. The workspace is a subscription,
        and the AI you run <em>through us</em> — as opposed to on your own
        agent, which is what the assistant uses — is metered, priced so that
        using the expensive part costs something and not using it costs
        nothing.
      </P>
      <P>
        {share} of revenue is set aside before anything else is paid out. Of
        revenue, not of profit: profit is a number we control and you cannot
        check, and revenue is the one both of us can see on your invoice. It
        applies to the subscription and the metered AI alike, with no carve-out
        for the expensive part.{" "}
        {IMPACT.shareOfRevenue.status === "placeholder" ? (
          <>
            It is an intended commitment rather than a binding one until it is
            written into our terms, and no partner has been signed — which is
            why there is no organisation named and no tree count anywhere on
            this site.
          </>
        ) : null}{" "}
        The whole arrangement, including the parts that are not settled, is on
        the{" "}
        <Link
          href="/impact"
          className="text-fg-muted underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg"
        >
          impact page
        </Link>
        .
      </P>

      <H2 id="who">Who is behind it</H2>
      <NotYet
        what="This section is a placeholder."
        needs={
          <>
            The founder&apos;s name, where this is registered, and how many
            people work on it belong here in plain words. We would rather leave
            it blank for now than describe a team that doesn&apos;t exist —
            &ldquo;we&rdquo; on this page means whoever is actually building
            it.
          </>
        }
      />
    </PageShell>
  );
}
