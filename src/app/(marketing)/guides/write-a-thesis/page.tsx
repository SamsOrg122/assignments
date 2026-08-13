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

const SLUG = "/guides/write-a-thesis" as const;

export const metadata = pageMetadata(SLUG);

const TOC: TocItem[] = [
  { id: "steps", label: "The nine steps" },
  { id: "outline", label: "Chapter outline, and a word goal per section" },
  { id: "schedule", label: "Twenty weeks, week by week" },
  { id: "machinery", label: "The four settings that decide week 19" },
  { id: "handing-in", label: "Handing it to a supervisor who wants Word" },
  { id: "where-word-wins", label: "Where Word is still better" },
  { id: "faq", label: "Questions people ask" },
];

const FAQS: FaqItem[] = [
  {
    question: "How long should a thesis be?",
    answer:
      "It depends on your programme. Dutch HBO bachelor theses commonly run 10,000 to 15,000 words and master's theses 15,000 to 25,000, but those are conventions rather than rules. Your assessment form is the only number that counts, and it usually says whether references and appendices are inside the total.",
  },
  {
    question: "How long does writing a thesis take?",
    answer:
      "Most programmes allow one semester, roughly 20 weeks including the research. The mistake is spending 18 of them writing and 2 fixing. Put your first complete draft in week 15 rather than week 19, and keep the last two weeks for revision.",
  },
  {
    question: "Should I write my thesis in one document or one file per chapter?",
    answer:
      "One document. Cross-references, note numbering and an automatic contents page work within one document and none of the three works across five files. Split by chapter only if your editor slows down badly — and then the fix is a faster editor.",
  },
  {
    question: "What's the difference between a research question and sub-questions?",
    answer:
      "The research question is the single thing your thesis answers, and it appears twice: at the end of the introduction and at the start of the conclusion. Sub-questions are the steps towards it, and each should map to a chapter or a section. A sub-question with no chapter is either not one, or a missing chapter.",
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

export default function WriteAThesisGuidePage() {
  return (
    <PageShell
      eyebrow="Guide"
      title={page(SLUG).h1}
      lead="Most thesis advice is about motivation. This is about what actually goes wrong: a contents page nobody updated, figure numbers that stopped matching the text, a citation style changed in week 19, and a supervisor who wants Word with tracked changes."
    >
      <JsonLd
        data={[breadcrumbJsonLd(SLUG), pageJsonLd(SLUG), faqJsonLd(FAQS)]}
      />
      <Breadcrumbs slug={SLUG} />

      <p className="mb-8 text-[12.5px] text-fg-subtle">
        <Link
          href="/nl/gidsen/scriptie-schrijven"
          hrefLang="nl"
          lang="nl"
          className="text-fg-muted underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg"
        >
          Deze pagina in het Nederlands
        </Link>
      </p>

      <Contents slug={SLUG} items={TOC} />

      <Takeaway title="The short version">
        Nine steps, a chapter outline with a word goal per section, twenty
        weeks. Then four settings — citations, notes, contents,
        cross-references — that cost ten minutes in week 1 or a weekend in week
        19. See also{" "}
        <A href="/guides">all our step-by-step guides</A>.
      </Takeaway>

      <H2 id="steps">The nine steps</H2>
      <P>
        Every step ends in something another person can read. A step producing
        only a feeling of progress is not a step, which is why &ldquo;do the
        research&rdquo; sits so late.
      </P>
      <List
        items={[
          "Pick a subject you can get data about. The interesting question you cannot get access to costs more weeks than the dull one you can.",
          "Reduce it to one research question, in one sentence, with a verb you can test. If it needs a semicolon, it is two questions.",
          "Break it into three to five sub-questions. Each becomes a chapter or a section; nothing else does.",
          "Write the plan — problem, question, sub-questions, method, planning — and get it approved before you collect anything.",
          "Set the document up once: citation style, page setup, a contents block, a word goal per section.",
          "Collect sources as you read. A reference reconstructed from a browser history is one you get wrong.",
          "Do the research, writing the theory chapter alongside it. Waiting rooms and transcription are the only free hours you get.",
          "Draft in the order the argument needs. Method and results first: easiest to write, hardest to fake.",
          "Revise in three passes — structure, paragraphs, sentences — never two in one sitting.",
        ]}
      />

      <H2 id="outline">Chapter outline, and a word goal per section</H2>
      <P>
        A proportion, not a template. Results and discussion are together about
        two-fifths of a thesis, and the introduction is the shortest chapter
        people spend the longest on.
      </P>
      <Table
        caption="A 12,000-word thesis. Change the total, keep the proportions."
        columns={["Chapter", "What it answers", "Words"]}
        minWidth={600}
        rows={[
          ["Abstract", "The whole thesis in a paragraph. Written last.", "500"],
          ["Introduction", "Why this question, why now.", "1,000"],
          [
            "Theoretical framework",
            "Your concepts, defined out of other people's work.",
            "2,500",
          ],
          ["Method", "Precisely enough for a stranger to repeat it.", "1,500"],
          ["Results", "What you found. No interpretation.", "2,500"],
          [
            "Discussion",
            "What it means, and what your method cannot support.",
            "2,500",
          ],
          ["Conclusion", "The question, answered. Nothing new.", "800"],
          ["Recommendations", "What somebody does on Monday.", "700"],
        ]}
      />

      <H3 id="word-goals">Word goals per section</H3>
      <P>
        A whole-document target tells you nothing in week 10: you satisfy it by
        writing 4,000 words of theory and none of method. So goals sit on
        sections too. The outline panel keeps a target per section, keyed to
        that section, and shows each as <code>words / target</code> with a
        hairline meter; the header carries the overall figure as a percentage.
        The useful number is not the total but which section is furthest behind
        its own.
      </P>

      <H2 id="schedule">Twenty weeks, week by week</H2>
      <P>
        Weeks are the unit because a supervision cycle is a fortnight. The two
        blocks people cut when they fall behind are the last two, which is
        exactly backwards.
      </P>
      <Table
        caption="One semester in six blocks, and what has to exist at the end of each."
        columns={["Weeks", "What happens", "What exists at the end"]}
        minWidth={620}
        rows={[
          ["1–3", "Read widely, narrow hard.", "An approved plan."],
          [
            "4–5",
            "Method, instruments, access or ethics approval.",
            "The interview guide, survey or dataset.",
          ],
          [
            "6–11",
            "Fieldwork, theory chapter alongside.",
            "Data collected, framework drafted.",
          ],
          [
            "12–15",
            "Analysis, results, discussion. Write badly and fast.",
            "A complete first draft.",
          ],
          [
            "16–18",
            "Chapters moved, sections merged, arguments cut.",
            "A second draft, readable whole.",
          ],
          [
            "19–20",
            "Sentences, references, numbering, the assessment form.",
            "The file you hand in.",
          ],
        ]}
      />

      <H2 id="machinery">The four settings that decide week 19</H2>

      <H3 id="citations">Citations, in four styles</H3>
      <P>
        Four are supported, named in the code rather than approximated: APA 7,
        MLA 9, Chicago and Harvard. All four are author&ndash;date or
        author&ndash;page, which is why switching is a setting and not an edit —
        the in-text marker is derived from the source, so reordering the
        bibliography never renumbers your prose. Two authors get an ampersand,
        three or more collapse to <em>et al.</em>, and the list sorts by family
        name, then year.
      </P>
      <P>
        You add a source by pasting what you have: a DOI, arXiv id, ISBN, BibTeX
        record, URL or raw citation is detected and parsed, and anything the
        parser inferred is flagged uncertain. The limit worth knowing: the
        shipped resolver never touches the network, so a bare URL yields a title
        guessed from the slug — and says so.
      </P>

      <H3 id="notes">Footnotes and endnotes</H3>
      <P>
        Notes are numbered in document order, computed without a DOM, so the
        screen, the export and the assistant cannot drift apart. On screen they
        always sit at the end: a browser cannot print at the foot of a page,
        because <code>float: footnote</code> is in the CSS spec and in no
        shipping engine. The foot-or-end choice is therefore about the exported
        file — and one honest gap is that the Word writer emits real footnotes
        either way, so a programme demanding endnotes needs one conversion in
        Word.
      </P>

      <H3 id="contents">A contents page that cannot go stale</H3>
      <P>
        It is derived from the document&apos;s headings on every render and
        nothing is stored. That is the whole feature: a stored contents page can
        disagree with the document, which is why every word processor storing
        one also has an &ldquo;update field&rdquo; ritual. It is a block rather
        than a fixed strip, so it sits where the document wants it.
      </P>

      <H3 id="cross-references">Cross-references that renumber themselves</H3>
      <P>
        Two independent sequences run through the document, Figure <em>n</em>{" "}
        and Table <em>n</em>; pictures and charts share the figure sequence.
        Nothing is stored, so a figure inserted halfway renumbers everything
        after it — and every reference to it — in the same keystroke. A
        reference whose target you deleted renders <em>[missing reference]</em>{" "}
        rather than leaving a sentence that reads &ldquo;as shown in , the
        effect&rdquo;.
      </P>

      <H2 id="handing-in">Handing it to a supervisor who wants Word</H2>
      <P>
        Supervisors review in Word with track changes on, and most writing tools
        treat that as an export problem. It is a round-trip problem. The{" "}
        <code>.docx</code> written here is real OOXML, not Word-flavoured HTML
        with the extension changed: footnotes Word lays out itself,{" "}
        <code>w:ins</code> and <code>w:del</code> tracked changes it can review,
        a header and footer with a real PAGE field, and a contents field,{" "}
        <code>TOC \o &quot;1-3&quot; \h</code>, with the current entries baked in
        as its result — so it reads correctly on open and updates on F9.
      </P>
      <P>
        The way back matters more. Reading a <code>.docx</code> brings in
        headings, lists, tables and footnotes, and your supervisor&apos;s
        tracked changes arrive as proposed changes rather than flattened text —
        accept or reject them one at a time, or all at once across blocks you
        have not opened. Page setup covers A4, Letter and Legal, portrait or
        landscape, margins in millimetres, and page numbers bottom-right,
        bottom-centre or top-right.
      </P>
      <P>
        Three limits. Headers, footers and page numbers do not work in a browser
        print at all — CSS margin boxes are unimplemented in every shipping
        engine — so they go into the Word export only. PDF export is{" "}
        <code>window.print()</code> into a clean window, not a generated file.
        And equations reach Word as LaTeX source in a monospaced run, because
        LaTeX to OMML is a compiler rather than a function. If your faculty runs
        on Office,{" "}
        <A href="/compare/microsoft-365">
          if your university hands you Microsoft 365
        </A>{" "}
        has the rest.
      </P>

      <H2 id="where-word-wins">Where Word is still better</H2>
      <P>
        A thesis is the one document where the incumbent is genuinely hard to
        beat. The rows go both ways.
      </P>
      <Table
        caption="Jobs a thesis needs, and which tool does each better."
        columns={["", "Microsoft Word", "Tougather"]}
        minWidth={660}
        rows={[
          [
            "Endnotes as endnotes",
            "Real endnotes, own numbering.",
            "The setting exists; the .docx writer emits footnotes either way.",
          ],
          [
            "Equations",
            "A native OMML editor.",
            "LaTeX source in a monospaced run. Named in the code as the honest gap.",
          ],
          [
            "Reference styles",
            "About a dozen built in, and thousands more through the Zotero or EndNote add-in, which also fetch metadata.",
            "Four. The resolver never goes near the network.",
          ],
          [
            "A PDF file",
            "Writes one.",
            "window.print() into a clean window. No PDF writer.",
          ],
          [
            "Commenting on a sentence",
            "Anchored to a text range.",
            "Anchored to a block — deliberate, but coarser.",
          ],
          [
            "Page numbers when printing",
            "On every printout.",
            "In the Word export only.",
          ],
          [
            "Contents page",
            "A stored field, correct once you press F9.",
            "Derived every render. It cannot contradict the document.",
          ],
          [
            "Figure and table numbers",
            "Fields, which also need updating.",
            "Derived, so they renumber as you type.",
          ],
        ]}
      />
      <P>
        Word wins on what the print industry standardised thirty years ago, and
        loses on what has to stay correct while you edit. If your results
        chapter does arithmetic,{" "}
        <A href="/guides/spreadsheet-formulas">
          formulas for your results chapter
        </A>{" "}
        covers the functions worth learning, and{" "}
        <A href="/guides/work-offline">writing in a library with no wifi</A>{" "}
        covers the week your connection is not part of the plan.
      </P>

      <H2 id="faq">Questions people ask</H2>
      <FAQ items={FAQS} />

      <CallToAction href="/library" label="Start writing">
        Open a document, set the citation style and page size, drop in a
        contents block, put a goal on each section. Those ten minutes decide
        what week 19 looks like.
      </CallToAction>

      <RelatedPages slug={SLUG} />
    </PageShell>
  );
}
