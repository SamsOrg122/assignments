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
import { H2, List, P, PageShell } from "@/components/landing/PageShell";
import {
  type FaqItem,
  breadcrumbJsonLd,
  faqJsonLd,
  page,
  pageJsonLd,
  pageMetadata,
} from "@/lib/seo";

const SLUG = "/guides/pitch-deck" as const;

export const metadata = pageMetadata(SLUG);

const TOC: TocItem[] = [
  { id: "order", label: "The order investors read in" },
  { id: "twelve", label: "The twelve slides" },
  { id: "notes", label: "On the slide, or in your mouth" },
  { id: "numbers", label: "The numbers they ask about first" },
  { id: "from-a-document", label: "Building it from a document you already wrote" },
  { id: "rehearsing", label: "Rehearsing with a second screen and a clock" },
  { id: "powerpoint", label: "For the person who insists on PowerPoint" },
  { id: "faq", label: "Questions people ask" },
];

const FAQS: FaqItem[] = [
  {
    question: "How many slides should a pitch deck have?",
    answer:
      "Ten to fifteen. Twelve is a comfortable middle, and the outline on this page is twelve. Anything past fifteen belongs in an appendix you send only if somebody asks. The real constraint is not the page count but the hour: budget about a third of the meeting for the deck and the rest for questions, because every slide you add comes out of the questions.",
  },
  {
    question: "What goes on the first slide?",
    answer:
      "One sentence saying what you do and who it is for, plus the company name and one way to reach you. Not a logo wall, not a mission statement, not a photograph of a mountain. The test: could somebody who saw only that slide describe your company to a colleague afterwards without getting it wrong?",
  },
  {
    question: "Do I need financial projections in a first-round deck?",
    answer:
      "Yes, but three years is enough and the assumptions matter more than the totals. Nobody believes the year-three number. What they are reading is whether you know which three assumptions the model hangs on, and what happens if the middle one is half of what you wrote. Put them on the slide next to the numbers, not in an appendix.",
  },
  {
    question: "Should I send the deck before or after the meeting?",
    answer:
      "Send a readable version beforehand, so the meeting is a conversation instead of a reading session. That version carries the sentences the live one leaves in the speaker notes. Keep the sparse one for presenting. If the deck is heavy with screenshots, send the file rather than a share link: a share link puts the document inside the URL, which is comfortable up to about eight thousand characters and truncated by some apps well before a page of pictures fits.",
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

export default function PitchDeckGuidePage() {
  return (
    <PageShell
      eyebrow="Guide"
      title={page(SLUG).h1}
      lead="Most pitch deck advice is about storytelling. This is about the mechanics: why the slides come in that order, which sentence is printed and which one stays in your mouth, and how to rehearse the thing with a clock running before you rehearse the words."
    >
      <JsonLd
        data={[breadcrumbJsonLd(SLUG), pageJsonLd(SLUG), faqJsonLd(FAQS)]}
      />
      <Breadcrumbs slug={SLUG} />

      <p className="mb-8 text-[12.5px] text-fg-subtle">
        <Link
          href="/nl/gidsen/pitch-deck"
          hrefLang="nl"
          lang="nl"
          className="text-fg-muted underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg"
        >
          Deze pagina in het Nederlands
        </Link>
      </p>

      <Contents slug={SLUG} items={TOC} />

      <Takeaway title="The short version">
        Twelve slides, in the order that answers each objection as it arrives.
        One claim per slide, one number you can defend, everything else in the
        speaker note. Rehearse against a clock on a second screen before you
        rehearse the words, and export <code>.pptx</code> for whoever asks for
        the file. Like <A href="/guides">all our step-by-step guides</A>, none
        of this needs a purchase to try.
      </Takeaway>

      <H2 id="order">The order investors read in</H2>
      <P>
        The order is not a convention. It is a proof chain: every slide answers
        the objection the slide before it just raised. Say there is a problem
        and the room wants to know whose. Show a solution and they ask whether
        it works. Show that it works and they ask why nobody did it five years
        ago. Only after that does a market number mean anything.
      </P>
      <P>
        Two things follow. Reordering breaks the chain — a market slide before
        a problem slide is a large number attached to nothing. And a slide that
        answers no objection is not a short slide, it is a slide to cut. Run
        that test before the design one.
      </P>

      <H3 id="misplaced">The two slides people put in the wrong place</H3>
      <P>
        <strong className="font-medium text-fg">Why now</strong> sits fifth,
        after the demo. Before anyone has seen the thing, &ldquo;the world
        changed&rdquo; is an assertion; afterwards it answers the question they
        are already forming, which is why this was not built in 2019.
      </P>
      <P>
        <strong className="font-medium text-fg">Competition</strong> sits
        ninth, and the version that works names where you lose. Investors have
        met your competitors, sometimes in the same week. A grid you win every
        row of says either that you have not looked or that you will not say.
      </P>

      <H2 id="twelve">The twelve slides</H2>
      <P>
        Twelve is a middle, not a rule. What matters is that each slide has one
        job, and that the third column exists at all: it is the half of the
        deck you say rather than print.
      </P>
      <Table
        caption="Twelve slides, what is printed on each one, and what belongs in the speaker note instead."
        columns={["Slide", "On the slide", "In the note"]}
        minWidth={720}
        rows={[
          [
            "1. Title",
            "One sentence: what you do and who for. Company name, your name, one contact.",
            "How you want to be introduced, and the line you open with.",
          ],
          [
            "2. Problem",
            "Whose problem, how often it happens, what it costs them today.",
            "The story of one of them, and where your number came from.",
          ],
          [
            "3. Solution",
            "What you built, in a sentence a listener could repeat back correctly.",
            "The two things it deliberately does not do.",
          ],
          [
            "4. How it works",
            "Three steps, or one screenshot. Not the architecture.",
            "The demo you would run if there were time, and what breaks in it.",
          ],
          [
            "5. Why now",
            "What changed — a cost, a law, a behaviour — with a year attached.",
            "What was attempted before that change, and why it failed.",
          ],
          [
            "6. Market",
            "Bottom-up: how many buyers, times what they pay a year.",
            "Where the buyer count came from and who you excluded.",
          ],
          [
            "7. Business model",
            "What you charge, to whom, how often. Gross margin if you know it.",
            "The prices you have tested, and what people said no to.",
          ],
          [
            "8. Traction",
            "One chart or four numbers, with dated axes. No cumulative curve.",
            "What each step change was, and which of them you cannot repeat.",
          ],
          [
            "9. Competition",
            "Named competitors on the two axes that decide deals, plus a row you lose.",
            "Who you last lost a deal to, and the reason they gave.",
          ],
          [
            "10. Team",
            "Who, what they did before, why it matters here. The gap you are hiring for.",
            "The history that made you start this and not something else.",
          ],
          [
            "11. Financials",
            "Three years, and the three assumptions the model hangs on.",
            "What the model does if the middle assumption is half.",
          ],
          [
            "12. The ask",
            "How much, how many months it buys, and what it pays for.",
            "Your floor, your terms, and who else is already in the round.",
          ],
        ]}
      />

      <H2 id="notes">On the slide, or in your mouth</H2>
      <P>
        One rule survives contact with a real room: the slide holds the claim,
        you hold the argument. A slide carrying the argument is a slide the
        room reads while you talk over it, and reading wins. So print the
        sentence you would still want on screen if you had lost your voice, and
        put everything that explains or qualifies in the note.
      </P>
      <P>
        The note field here is one line of monospace under the slide, and that
        is deliberate rather than unfinished. A note you can read at a glance
        while looking at a room is a cue; a paragraph is a script you will
        start reading from. Notes arriving from an imported{" "}
        <code>.pptx</code> get flattened into one line too — the importer joins a
        note&apos;s paragraphs with spaces — so an inherited deck of
        half-written speeches arrives as what it always was. Six words per
        slide is the target.
      </P>
      <P>
        Where a slide genuinely carries three points, reveal them one at a
        time. There are four settings and no fifth: by bullets, by objects, by
        both, or not at all. A bullet build numbers its bullets one to{" "}
        <em>n</em>, an object build uses the step number on each object, and
        the slide takes as many presses as the longer of the two. Stepping
        backwards lands at the end of the previous slide&apos;s build rather
        than replaying it — the difference between re-reading one bullet and
        performing the last slide again.
      </P>

      <H2 id="numbers">The numbers they ask about first</H2>
      <P>
        Questions about numbers arrive in an order too, and it is not the order
        your model is built in. Have these six ready as sentences, not as
        lookups:
      </P>
      <List
        items={[
          "Revenue or usage by month, with the months labelled. A cumulative curve only goes up, and everyone in the room knows that is what it is for.",
          "Growth over a named period — “3.1× over the last six months” rather than “fast”.",
          "Burn and runway in months, and the calendar date the money runs out.",
          "Gross margin, or the reason you do not have a meaningful one yet.",
          "What a customer costs to acquire and how long they take to pay it back, if you have sold to enough of them to know.",
          "The ask: the amount, the months it buys, and the milestone it is supposed to reach.",
        ]}
      />
      <P>
        Assumptions get scrutinised harder than totals, so put each one beside
        the number it produces rather than in an appendix nobody opens. The
        model behind them is a spreadsheet like any other — 167 functions,
        including the eleven financial ones (<code>PMT</code>, <code>FV</code>,{" "}
        <code>PV</code>, <code>NPER</code>, <code>RATE</code>, <code>NPV</code>
        , <code>IRR</code>, <code>SLN</code>, <code>SYD</code>,{" "}
        <code>EFFECT</code>, <code>NOMINAL</code>). A chart reads the table it
        came from instead of copying it, so a projection you fix leaves no
        stale chart behind it.
      </P>
      <P>
        One limit to plan around: a slide object is text, a rectangle, an
        ellipse, a line or a picture. There is no chart object, so a live chart
        cannot sit on a slide. In practice that is the constraint you wanted —
        the model and its chart belong in the document you send afterwards, and
        the slide carries the one number the chart is about. For the formulas
        that model is made of, see{" "}
        <A href="/guides/spreadsheet-formulas">
          building the financial projections
        </A>
        .
      </P>

      <H2 id="from-a-document">
        Building it from a document you already wrote
      </H2>
      <P>
        A deck is rarely the first thing written. There is usually a memo, a
        business plan or a grant application already sitting there, and
        retyping it into slides is where the weekend goes. Asking for a deck
        from the open document uses that document&apos;s own structure: every
        section over fifteen words becomes a slide, the headings become the
        titles, and the bullets are that section&apos;s opening sentences
        clipped to fit. Ask for twelve slides and you get twelve — the count is
        read out of your sentence and held between three and twenty. Those
        rules are the local stub&apos;s; with a model configured the outline is
        the model&apos;s, and still arrives as a preview you accept or
        discard.
      </P>
      <P>
        It creates a <em>new</em> deck project and leaves the document
        untouched, and nothing is applied until you press Accept. With no model
        configured, a local stub does the same job from your headings and says
        that is what it is.
      </P>
      <P>
        Trimming works the same way. Ask to cut a deck to twelve and it drops
        the thinnest slides by what they carry, keeps the first and last
        whatever they weigh, merges nothing, and lists what it removed so you
        can reject the lot. If your writing lives somewhere that cannot make
        slides at all,{" "}
        <A href="/compare/notion">why Notion has no slide editor</A> covers
        that trade.
      </P>

      <H2 id="rehearsing">Rehearsing with a second screen and a clock</H2>
      <P>
        Rehearse the clock before the words. Presenter view opens as a second
        window: your notes get the largest panel, the current slide&apos;s
        bullets sit beside them with the un-revealed ones dimmed, the next
        slide shows its title and up to four bullets, and a counter reads{" "}
        <code>4 / 12 · step 2/3</code>. One button starts the clock and afterwards
        resets it; it counts <code>mm:ss</code> until a talk needs an hour. Arrow keys, space and Page Down work from either window.
      </P>
      <P>
        The window the room is looking at is the authority on where the deck
        is; the presenter window only ever asks it to move. So you can close
        the presenter view mid-talk and reopen it, and it catches up instead of
        arguing. The limit is specific, and it is the one to check before a
        real pitch:{" "}
        <strong className="font-medium text-fg">
          the two windows talk over a browser channel, so they must be two
          windows of the same browser on one machine.
        </strong>{" "}
        Laptop plus projector, yes. Your phone driving your laptop, no. And if
        pop-ups are blocked the second window never opens — allow them for the
        site once, in advance, rather than discovering it in the room.
      </P>

      <H2 id="powerpoint">For the person who insists on PowerPoint</H2>
      <P>
        Somebody in the process will ask for the file. Export writes a real{" "}
        <code>.pptx</code>: a zip of OOXML parts, 16:9, images embedded as
        media, the master&apos;s footer and slide numbers drawn onto each slide
        that has not opted out, and a notes part for every slide with a note.
        Import appends rather than replaces, with a notification naming what it
        dropped. PowerPoint still wins most of the rows below.
      </P>
      <Table
        caption="What survives the trip to PowerPoint, and what PowerPoint still does better."
        columns={["", "PowerPoint", "This deck"]}
        minWidth={700}
        rows={[
          [
            "Builds and transitions",
            "A full animation timeline, per shape.",
            "Four settings, and none of them are written into the exported file — in PowerPoint every bullet arrives at once.",
          ],
          [
            "Charts on a slide",
            "Native, editable, linked to a workbook.",
            "No chart object. Text, rectangles, ellipses, lines and pictures only.",
          ],
          [
            "Themes and templates",
            "Hundreds, plus whatever your corporate template enforces.",
            "Five themes, and four layouts plus an automatic one, on purpose. You pick a layout, not a font size.",
          ],
          [
            "Comments on one slide",
            "Anchored to a slide, or to a shape on it.",
            "Anchored to the block, so a comment lands on the deck rather than on slide 7.",
          ],
          [
            "Reading a .pptx back in",
            "Everything, obviously.",
            "Titles, bullets and notes. Images, embedded objects, charts and the original theme are dropped, and named.",
          ],
          [
            "Speaker notes in the file",
            "Yes.",
            "Yes — a real notes part per slide that has one.",
          ],
          [
            "A PDF of the slides",
            "Writes one.",
            "No PDF writer. Exporting a deck to PDF gives each slide as a heading with its bullets — a handout, without the notes.",
          ],
          [
            "Presenting on a second screen",
            "A desktop application driving a projector as a second display.",
            "Two windows of one browser on one machine, with a clock you start from the second window.",
          ],
        ]}
      />
      <P>
        If the file has to live in somebody else&apos;s ecosystem for months
        rather than for one meeting, build it where they already are —{" "}
        <A href="/compare/google-workspace">how Google Slides compares</A> sets
        out that side of it.
      </P>

      <H2 id="faq">Questions people ask</H2>
      <FAQ items={FAQS} />

      <CallToAction href="/library" label="Start a deck">
        Put one claim on each of twelve slides and move every explaining
        sentence into the note. Then open the second screen and run it once
        with the clock going. That run tells you more than the next three
        edits.
      </CallToAction>

      <RelatedPages slug={SLUG} />
    </PageShell>
  );
}
