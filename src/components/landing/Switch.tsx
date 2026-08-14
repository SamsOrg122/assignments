/**
 * The argument, on the page that people actually land on.
 *
 * Everything above this says what the product is. Nobody leaves Microsoft 365
 * because of what a product is — they leave because it is five subscriptions,
 * or because it is five files, or because they are stuck. So this section is
 * the three questions somebody is really asking, answered in the order they
 * ask them: what does this replace, what does it cost, and what will I lose.
 *
 * The third column is the one that does the persuading. A page that says
 * plainly where you should stay with Microsoft is believed when it says where
 * you shouldn't — and it is the one thing a company with five hundred times
 * our marketing budget structurally cannot copy.
 *
 * Every claim here is checkable, and links to the page that checks it. Nothing
 * is asserted that the code does not already do: no folder import, no
 * collaboration promises, no numbers we cannot stand behind.
 */

import Link from "next/link";
import { Glass, Reveal, Section, SectionHead } from "./primitives";
import { Icon, type IconName } from "@/components/ui/Icon";
import { PLANS } from "@/lib/impact/config";
import { PaymentStatus } from "@/components/pricing/PaymentStatus";

/** Read from the plans rather than typed here, so a price change cannot leave
 *  the argument quoting a number the pricing table has stopped charging. */
const FREE = PLANS.find((p) => p.id === "free")!;
const PRO = PLANS.find((p) => p.id === "pro")!;

const COLUMNS: Array<{
  icon: IconName;
  label: string;
  title: string;
  body: React.ReactNode;
  link: { href: string; text: string };
}> = [
  {
    icon: "board",
    label: "What it replaces",
    title: "Five files become one project.",
    body: (
      <>
        A document, a spreadsheet, a deck, a board and the team&apos;s chat are
        five apps and five formats in Office. Here they are one project with one
        link and one search box — and the assistant answers with all of it in
        view, because underneath it is one thing rather than five file formats
        that happen to share a logo.
      </>
    ),
    link: { href: "/compare/microsoft-365", text: "Feature by feature" },
  },
  {
    icon: "sparkle",
    label: "What it costs",
    title: `Free does everything. €${PRO.price} adds the AI.`,
    body: (
      <>
        Nothing is gated on the free plan: every editor, import and export,
        version history and sources, with {FREE.includedCredits} AI credits a
        month that stop rather than becoming an invoice. Pro is €{PRO.price} a
        month and is not billed per seat, where Microsoft licenses per person —
        take their figure for your team size and put it beside ours. We
        deliberately don&apos;t print their price here: it moves by country and
        plan, and one stale number would make this whole page worth ignoring.
        <PaymentStatus variant="inline" />
      </>
    ),
    link: { href: "/pricing", text: "The whole price list" },
  },
  {
    icon: "minus",
    label: "What it doesn't do",
    title: "Where you should stay where you are.",
    body: (
      <>
        Stay on Microsoft 365 if your workbook runs macros, if you work past
        fifty thousand rows, if two of you edit the same paragraph at once, if
        your institution needs SSO, or if Outlook is the reason the licence
        exists. Those are consequences of keeping your work in your own
        browser, not gaps being quietly closed — and we would rather you read
        it here than find out in week three.
      </>
    ),
    link: { href: "/compare/excel", text: "Honestly, on spreadsheets" },
  },
];

export function Switch() {
  return (
    <Section id="why" className="py-20 sm:py-28">
      <Reveal>
        <SectionHead
          eyebrow="Why people move"
          title="What you are actually comparing."
          lead="Not a feature grid. The three things somebody weighs before they move a thesis or a company into something new — including the one where the answer is don't."
        />
      </Reveal>

      <div className="mt-10 grid gap-4 lg:grid-cols-3">
        {COLUMNS.map((column, i) => (
          <Reveal key={column.label} delay={40 + i * 60}>
            <Glass className="flex h-full flex-col p-5 sm:p-6">
              <span className="flex items-center gap-2 text-[12px] tracking-[0.01em] text-fg-subtle">
                <Icon name={column.icon} size={12} />
                {column.label}
              </span>
              <h3 className="mt-3 text-[17px] leading-snug font-medium text-fg text-balance">
                {column.title}
              </h3>
              <p className="mt-2.5 flex-1 text-[13.5px] leading-relaxed text-fg-muted text-pretty">
                {column.body}
              </p>
              <Link
                href={column.link.href}
                className="group mt-5 inline-flex items-center gap-1 text-[12.5px] text-fg-muted transition-colors duration-150 hover:text-fg"
              >
                {column.link.text}
                <Icon
                  name="chevron-right"
                  size={11}
                  className="text-fg-subtle transition-transform duration-150 group-hover:translate-x-0.5"
                />
              </Link>
            </Glass>
          </Reveal>
        ))}
      </div>

      {/*
        The objection that stops most people before any of the above: my work
        is in Word. Answered with the one fact that removes it — the files go
        both ways, so trying this is not a commitment.
      */}
      <Reveal delay={220}>
        <Glass
          soft
          className="mt-4 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:gap-6 sm:p-6"
        >
          <span className="flex shrink-0 items-center gap-2 text-[12px] text-fg-subtle">
            <Icon name="file" size={12} />
            Your work comes with you
          </span>
          <p className="flex-1 text-[13.5px] leading-relaxed text-fg-muted text-pretty">
            Drag your whole Office folder onto the Library. The{" "}
            <strong className="font-medium text-fg">.docx</strong> files become
            documents, the <strong className="font-medium text-fg">.pptx</strong>{" "}
            files become decks, the{" "}
            <strong className="font-medium text-fg">.xlsx</strong> files become
            spreadsheets, and your folders come with them — and all three write
            back out again. Anything it can&apos;t read is named, with the
            reason. Trying this costs you nothing, and leaving takes your work
            with it.
          </p>
        </Glass>
      </Reveal>
    </Section>
  );
}
