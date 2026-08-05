/**
 * The four things that are actually ours.
 *
 * Not the longest list we could write — the four features someone would
 * change tools for. Each gets a real vignette rather than an icon.
 */

import { Glass, Reveal, Section, SectionHead } from "./primitives";
import { DeckMock, SpeakMock, TypographyMock } from "./mocks";
import { Icon } from "@/components/ui/Icon";

export function Signature() {
  return (
    <Section id="features" className="py-20 sm:py-28">
      <Reveal>
        <SectionHead
          eyebrow="Signature"
          title="Four things you can't do anywhere else."
          lead="Everything else is table stakes. These are the reasons to move."
        />
      </Reveal>

      <div className="mt-10 grid gap-4 md:grid-cols-2">
        <Reveal delay={40}>
          <Feature
            title="Speak-to-prose"
            body="Not dictation. You talk the way you'd talk to a colleague, and what lands on the page is written prose — hesitations gone, clauses joined, paragraphs re-broken. It shows you what you said next to what will be written, so you can see the difference."
          >
            <SpeakMock />
          </Feature>
        </Reveal>

        <Reveal delay={100}>
          <Feature
            title="AI that has read your workspace"
            body="“Where does my argument drift?” is only answerable if something has read all six sections, your sources and your team's conventions. It has. Answers cite the section they came from."
          >
            <WorkspaceContextVignette />
          </Feature>
        </Reveal>

        <Reveal delay={40}>
          <Feature
            title="Typography that is already right"
            body="Measure, leading, tracking and margin are real numbers with good defaults, not a dropdown of six sizes. Long-form work looks composed before you touch anything — and you can still touch everything."
          >
            <TypographyMock />
          </Feature>
        </Reveal>

        <Reveal delay={100}>
          <Feature
            title="Thesis to deck, in one step"
            body="Your document already has the structure a deck needs. Point at it and get slides that follow your sections, in a theme that was designed rather than assembled."
          >
            <DeckMock />
          </Feature>
        </Reveal>
      </div>
    </Section>
  );
}

function Feature({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <Glass lift className="flex h-full flex-col p-5">
      <div className="min-h-[124px]">{children}</div>
      <h3 className="mt-5 text-[15px] font-medium text-fg">{title}</h3>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-fg-muted text-pretty">
        {body}
      </p>
    </Glass>
  );
}

/** Context chips + a cited answer — what "workspace-aware" actually looks like. */
function WorkspaceContextVignette() {
  return (
    <div aria-hidden="true" className="select-none">
      <div className="flex flex-wrap gap-1.5">
        {[
          "6 sections",
          "8,412 words",
          "14 sources",
          "3 teammates",
          "thesis-brief.md",
        ].map((chip) => (
          <span
            key={chip}
            className="rounded-xs border border-line px-1.5 py-0.5 font-mono text-[9.5px] text-fg-subtle"
          >
            {chip}
          </span>
        ))}
      </div>

      <div className="mt-3 flex items-start gap-2">
        <Icon name="sparkle" size={11} className="mt-0.5 shrink-0 text-accent" />
        <p className="text-[12px] leading-relaxed text-fg">
          Section 2 drifts furthest — it argues about tooling, while your
          question is about attention.
        </p>
      </div>
      <p className="mt-2 border-l border-line-strong pl-2.5 text-[11px] leading-relaxed text-fg-subtle">
        Your supervisor flagged the same paragraph in the first draft.
      </p>
    </div>
  );
}
