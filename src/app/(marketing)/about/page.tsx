import type { Metadata } from "next";
import Link from "next/link";
import { H2, NotYet, P, PageShell } from "@/components/landing/PageShell";

export const metadata: Metadata = {
  title: "About",
  // Its own URL, said out loud. The sitemap advertises this page, and a
  // page in a sitemap with no canonical leaves the choice of URL to a crawler.
  alternates: { canonical: "/about" },
  description:
    "Why a single workspace instead of four, and what this company is and is not.",
};

export default function AboutPage() {
  return (
    <PageShell
      eyebrow="About"
      title="One place, because the tools were never the problem."
      lead="Word is a good word processor. The problem is that finishing anything now means four of them, and the seams between them are where the work goes to die."
    >
      <H2>The argument</H2>
      <P>
        A thesis lives in a document, its numbers in a spreadsheet, its defence
        in a deck, its thinking on a whiteboard, and its coordination in a chat
        app. Five files, five formats, five places to look, and a set of copies
        that start drifting apart the moment you make the second one.
      </P>
      <P>
        Nothing about that is necessary. A table and the chart that reads from
        it are the same data seen twice — they should be one object, not two
        files. A pile of stickies and the document they become are the same
        idea at two stages, so promoting one into the other should be a
        keystroke rather than an afternoon of retyping. That is the whole
        design brief: fewer copies, fewer seams, one place.
      </P>

      <H2>What this is</H2>
      <P>
        A workspace where writing, spreadsheets, slides, an infinite board,
        code and your team&apos;s conversation are the same document model. AI
        is in the surfaces rather than in a sidebar, and it never writes to
        anything without showing you the change first.
      </P>

      <H2>What this is not</H2>
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
        And it is <strong className="font-medium text-fg">not a replacement
        for Microsoft 365 or Google Workspace</strong>, whatever the shape of
        the argument above suggests. There is no email and no calendar, which
        for most people is the larger half of what Outlook is. There is no
        organisation-wide administration — no single sign-on, no audit log, no
        retention policy — so a school&apos;s IT department has nothing here to
        approve. Sharing is per-link rather than per-group. Keep the mail and
        the calendar you have; this replaces the four apps you make things in,
        which is a smaller claim and a true one.
      </P>

      <H2>The money</H2>
      <P>
        Subscriptions and metered AI, priced so that using the expensive part
        costs something and not using it costs nothing. A tenth of that revenue
        is set aside before anything else is paid out — the whole arrangement,
        including what is still only an intention, is on the{" "}
        <Link
          href="/impact"
          className="text-fg-muted underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg"
        >
          impact page
        </Link>
        .
      </P>

      <H2>Who is behind it</H2>
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
