import type { Metadata } from "next";
import Link from "next/link";
import { H2, List, NotYet, P, PageShell } from "@/components/landing/PageShell";

export const metadata: Metadata = {
  title: "Contact",
  description: "How to reach whoever is building this.",
};

export default function ContactPage() {
  return (
    <PageShell
      eyebrow="Contact"
      title="A real person reads these."
      lead="There is no support tier and no ticket queue. There is one inbox, and for now it is small enough that everything in it gets answered."
    >
      <H2>Where to write</H2>
      <NotYet
        what="No public address is set yet."
        needs={
          <>
            A single monitored address belongs here — one, not four departments
            that all forward to the same place. Until it exists, publishing
            something that bounces would be worse than publishing nothing.
          </>
        }
      />

      <H2>What is worth writing about</H2>
      <P>
        Bugs, especially the ones that lost you work. Anything in the product
        that behaves differently from how this site describes it — that is a
        defect in one of the two, and both are worth fixing.
      </P>
      <P>
        Also: the parts of the{" "}
        <Link
          href="/impact"
          className="text-fg-muted underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg"
        >
          impact commitment
        </Link>{" "}
        you think are weaker than they sound. That page is written to be
        argued with.
      </P>

      <H2>What makes a bug report fixable</H2>
      <P>
        This app keeps everything in your browser, which makes bugs unusually
        hard to reproduce from the outside — there is no server log to read and
        no copy of your document to open. Four lines turn most reports into
        something that can be fixed the same day:
      </P>
      <List
        items={[
          "What you did, in the order you did it — including the step that felt irrelevant.",
          "What you expected instead, even when it seems obvious.",
          "Which browser, and whether it also happens in a different one.",
          <>
            Whether the console shows anything red.{" "}
            <span className="font-mono text-[13px] text-fg">F12</span>, then the
            Console tab.
          </>,
        ]}
      />
      <P>
        If it lost work, say so first. That moves it ahead of everything else in
        the queue.
      </P>

      <H2>What will not get an answer</H2>
      <P>
        Partnership proposals for the tree planting from anyone who cannot point
        at published multi-year survival rates. The criteria are on the impact
        page, in the order they are weighted.
      </P>

      <H2 id="status">Status</H2>
      <P>
        There is no status page, because there is no server to be down: the app
        runs entirely in your browser. If it fails to load, the problem is
        either the page delivery or something in this device&apos;s stored data
        — the command palette&apos;s{" "}
        <span className="font-mono text-[13px] text-fg">Reset workspace</span>{" "}
        clears the second one, at the cost of everything stored locally.
      </P>
    </PageShell>
  );
}
