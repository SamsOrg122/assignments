/**
 * "What it is" — three moments rather than a feature list.
 *
 * The claim is *everything in one*, and a bulleted list of nouns is the least
 * convincing way to make it. Each moment shows one real thing the product
 * does, in the product's own design language.
 */

import { Glass, Reveal, Section, SectionHead } from "./primitives";
import { BoardMock, InlineAIMock, LibraryMock } from "./mocks";
import { Icon, type IconName } from "@/components/ui/Icon";

const KINDS: Array<{ icon: IconName; label: string }> = [
  { icon: "text", label: "Write" },
  { icon: "slides", label: "Present" },
  { icon: "board", label: "Draw" },
  { icon: "table", label: "Model" },
  { icon: "code", label: "Build" },
  { icon: "users", label: "Share" },
];

export function Product() {
  return (
    <Section id="product" className="py-20 sm:py-28">
      <Reveal>
        <SectionHead
          eyebrow="What it is"
          title="One workspace, two halves."
          lead={
            <>
              A Library for work that is sorted and findable. A Board for
              thinking that isn&apos;t sorted yet. You can promote a cluster of
              stickies into a real document, or drop a document onto a board as
              a card that keeps mirroring it — so the messy half and the
              finished half are the same workspace, not two apps.
            </>
          }
        />
      </Reveal>

      <Reveal delay={80}>
        <ul className="mt-8 flex flex-wrap gap-2">
          {KINDS.map((k) => (
            <li
              key={k.label}
              className="glass-soft flex items-center gap-2 rounded-md px-3 py-1.5 text-[12.5px] text-fg-muted"
            >
              <Icon name={k.icon} size={12} className="text-fg-subtle" />
              {k.label}
            </li>
          ))}
        </ul>
      </Reveal>

      <div className="mt-10 grid gap-4 lg:grid-cols-3">
        <Reveal delay={40} className="lg:col-span-2">
          <Moment
            title="The Library keeps it findable"
            body="Every project has a real type and opens in an editor built for it. Search here ranks identically to ⌘K, because it's the same matcher."
          >
            <Glass className="overflow-hidden">
              <LibraryMock />
            </Glass>
          </Moment>
        </Reveal>

        <Reveal delay={120}>
          <Moment
            title="The Board keeps it loose"
            body="An infinite canvas where a paragraph sits beside a sticky beside a live card for a real project."
          >
            <Glass className="h-[240px] overflow-hidden">
              <BoardMock />
            </Glass>
          </Moment>
        </Reveal>

        <Reveal delay={80} className="lg:col-span-3">
          <Moment
            title="AI is in the document, not in a sidebar"
            body="Ask about the thing you're looking at and it answers with the whole project in context — then proposes a change you accept or discard. It never writes to your document on its own."
            wide
          >
            <Glass className="p-4 sm:p-5">
              <InlineAIMock className="mx-auto max-w-[560px]" />
            </Glass>
          </Moment>
        </Reveal>
      </div>
    </Section>
  );
}

function Moment({
  title,
  body,
  children,
  wide = false,
}: {
  title: string;
  body: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="flex h-full flex-col">
      {children}
      <div className={wide ? "mt-4 max-w-[64ch]" : "mt-4"}>
        <h3 className="text-[14.5px] font-medium text-fg">{title}</h3>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-fg-muted text-pretty">
          {body}
        </p>
      </div>
    </div>
  );
}
