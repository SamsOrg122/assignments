import type { Metadata } from "next";
import Link from "next/link";
import {
  H2,
  List,
  NotYet,
  P,
  PageShell,
} from "@/components/landing/PageShell";
import { IMPACT, percent } from "@/lib/impact/config";

export const metadata: Metadata = {
  title: "Terms, privacy and cookies",
  description:
    "What we do with your work and your data, in plain words. A draft, not yet reviewed by a lawyer.",
};

/**
 * Terms, privacy and cookies on one page.
 *
 * Three thin pages would look more official and say the same thing. One page
 * you can read in five minutes is the version someone actually reads.
 *
 * Everything here describes the software as it is today, which is unusually
 * easy to describe: it runs entirely in your browser and there is no server to
 * send anything to. That will change, and when it does this page changes with
 * it rather than after it.
 */
export default function LegalPage() {
  return (
    <PageShell
      eyebrow="Legal"
      title="What we do with your work, in plain words."
      lead="Written to be read rather than to be safe. It describes the software as it is today — which is a much shorter story than most of these pages tell."
      updated="the day this page was written"
    >
      <NotYet
        what="This is a draft, not a reviewed legal document."
        needs={
          <>
            No lawyer has been near it. Before anyone can pay for this, it needs
            to be replaced by terms that have been reviewed in the jurisdiction
            this company is registered in. Until then it is an honest
            description of what the software does, and nothing more.
          </>
        }
      />

      <H2 id="privacy">Where your work lives</H2>
      <P>
        In your browser. Every project, board, message and setting is stored in
        this device&apos;s local storage. There is no account, no server holding
        your documents, and nothing is transmitted when you write.
      </P>
      <P>
        The practical consequences are worth stating plainly, because they cut
        both ways:
      </P>
      <List
        items={[
          "Nobody can read your work, including us. There is nowhere to read it from.",
          "It is not backed up. Clearing your browser data deletes it, and no one can restore it.",
          "It does not follow you to another device or another browser.",
          "Export early and often — PDF, Word and Markdown are in the command palette.",
        ]}
      />

      <H2>The AI</H2>
      <P>
        Today the assistant runs locally and no text leaves your browser. That
        is a property of this build, not a promise about the future: connecting
        a real model means sending the relevant part of your project to whoever
        runs it.
      </P>
      <P>
        When that happens, this page will say which provider, what gets sent, how
        long they keep it, and whether it is used for training — before the
        feature ships, not after. If you are reading this sentence, it
        hasn&apos;t happened yet.
      </P>

      <H2 id="cookies">Cookies</H2>
      <P>
        None. No analytics, no advertising pixels, no third-party scripts, and
        no consent banner — because there is nothing to consent to. The
        preferences you set are kept in local storage, which is not a cookie and
        is never sent anywhere.
      </P>
      <P>
        If that changes, a banner appears and this section is rewritten. A
        product that quietly starts tracking you and updates its policy
        afterwards has told you exactly how much its policy is worth.
      </P>

      <H2>Your work is yours</H2>
      <P>
        You own everything you write here. Using this software grants us no
        licence to it, no right to display it, and no claim over anything you
        make with the AI&apos;s help. There is no clause underneath this
        paragraph walking it back.
      </P>

      <H2>Payment</H2>
      <P>
        Nothing is charged today; the pricing page describes what is intended.
        When payment exists, it will be monthly, cancellable in one click from
        inside the app, and it will not silently renew at a different price. The{" "}
        {percent(IMPACT.shareOfRevenue.value)} described on the{" "}
        <Link
          href="/impact"
          className="text-fg-muted underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg"
        >
          impact page
        </Link>{" "}
        is intended to be written into these terms at that point, which is what
        would turn it from an intention into an obligation.
      </P>

      <H2>Liability</H2>
      <P>
        This is pre-release software with no server and no backups. It is
        offered as it is, and it may lose your work. Do not make it the only
        copy of something that matters to you.
      </P>

      <H2>Changes</H2>
      <P>
        Material changes will be dated at the top of this page and described in
        a sentence rather than folded silently into a new revision.
      </P>

      <H2>Contact</H2>
      <P>
        Questions about any of this go to the address on the{" "}
        <Link
          href="/contact"
          className="text-fg-muted underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg"
        >
          contact page
        </Link>
        .
      </P>
    </PageShell>
  );
}
