/**
 * What the model is told, and what it is shown.
 *
 * Two halves. The system message is about *conduct* — what this assistant is
 * for, and the handful of rules that stop it from being annoying. The user
 * message is the context: the whole project, the workspace around it, the team
 * that owns it, and the ids every tool call has to address.
 *
 * The context is rendered as text rather than sent as JSON because a model
 * reads a document better than it reads a serialisation of one, and the ids
 * are the only part that has to survive verbatim.
 */

import type { AIContext } from "../types";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const SYSTEM = `You are the assistant inside Assignments — one workspace for documents, spreadsheets, decks and boards, aimed at people doing real work: students writing a thesis, teams writing a report.

You are given the whole project, not a paragraph. Use that: answer questions about the document as a whole, and say when something in one section contradicts another.

How to answer:
- Write plainly. No preamble, no "Certainly!", no restating the question.
- Markdown is fine — short paragraphs, the occasional list. Never a wall of bullets.
- Match the language the person is writing in. If the document is in Dutch, answer in Dutch.
- Be brief unless asked for depth. Three sentences that land beat twelve that hedge.

Changing the document:
- You never edit anything directly. To propose an edit, call one of the tools. The person sees a preview and accepts or rejects it, so a proposal costs them one keystroke to refuse.
- Call a tool when the request is to *do* something ("tighten this", "add a column for margin", "turn this into a deck"). Just answer when the request is a question.
- Say in your text what you are proposing and why — one or two sentences. Do not repeat the content of the change back; they can see it.
- Every id you use must come from the context below. Never invent a block id, row id or column id. If the thing you would need to address isn't there, say so instead of guessing.
- One change per answer. If two things are worth doing, do the more important one and mention the other.

Honesty:
- If the document doesn't contain what's needed to answer, say that. Do not fill the gap with plausible detail.
- Never invent sources, figures, quotations or citations. If a claim needs a source, say which kind of source would settle it.`;

/** Dictation goes through the same seam, and it is a different job. */
const SPEECH = `This is dictated speech, transcribed. Turn it into prose the person can keep: fix the punctuation and sentence boundaries, drop the filler ("um", "you know", false starts, repeated words), and keep every idea and their own wording. Do not summarise, do not improve the argument, do not add anything.

Then call append_text on the block given as the target, with the cleaned-up prose. Your written answer should be one short line, not the text itself.`;

const bullet = (label: string, value: string | number | undefined) =>
  value === undefined || value === "" ? "" : `${label}: ${value}\n`;

/** One block, with whatever handles a tool call would need to address it. */
function renderBlock(block: AIContext["blocks"][number], target?: string): string {
  const head = [
    `### ${block.title ?? block.heading ?? block.type} — id \`${block.id}\` (${block.type})`,
    block.id === target ? "[the block this was asked from]" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const parts = [head];

  if (block.columns?.length)
    parts.push(
      "Columns: " +
        block.columns
          .map(
            (c) =>
              `${c.name} → \`${c.id}\` (${c.type}${c.formula ? `: ${c.formula}` : ""})`,
          )
          .join(", "),
    );

  if (block.rowIds?.length)
    parts.push(
      `Row ids, in the order the rows appear below: ${block.rowIds
        .map((id) => `\`${id}\``)
        .join(", ")}` + (block.moreRows ? ` (+${block.moreRows} more, ids omitted)` : ""),
    );

  if (block.slideIds?.length)
    parts.push(`Slides: ${block.slideIds.length}, numbered 1–${block.slideIds.length}.`);

  if (block.deckStyle)
    parts.push(`Deck style: ${JSON.stringify(block.deckStyle)}`);

  parts.push(block.text || "(empty)");
  return parts.join("\n");
}

export function renderContext(context: AIContext): string {
  const out: string[] = [];

  out.push(
    `## The project\n` +
      bullet("Name", context.projectName) +
      bullet("Type", context.projectKind) +
      bullet("Words", context.words) +
      bullet("Word goal", context.wordGoal),
  );

  if (context.team) {
    const t = context.team;
    const people = t.members
      .map((m) => `${m.name}${m.isYou ? " (the person asking)" : ""} — ${m.role}${m.title ? `, ${m.title}` : ""}`)
      .join("\n");
    const knowledge = t.knowledge
      .map(
        (k) =>
          `- [${k.kind}] ${k.subject}: ${k.body}${k.confirmed ? "" : " (unconfirmed — treat as a guess)"}`,
      )
      .join("\n");
    out.push(
      `## The team\n${t.workspaceName} (${t.kind})\n${people}` +
        (knowledge ? `\n\nWhat they've told us:\n${knowledge}` : ""),
    );

    const focus = new Set(t.focusFiles ?? []);
    const files = t.files.filter((f) => !focus.size || focus.has(f.id));
    if (files.length)
      out.push(
        `## Attached files${focus.size ? " (this question is about these)" : ""}\n` +
          files.map((f) => `### ${f.name}\n${f.text}`).join("\n\n"),
      );
  }

  out.push(
    `## The document\n` +
      context.blocks
        .map((b) => renderBlock(b, context.targetBlockId))
        .join("\n\n"),
  );

  if (context.board?.items.length)
    out.push(
      `## Board items (id, kind, position, size)\n` +
        context.board.items
          .map((i) => {
            const what =
              i.kind === "connector"
                ? `connector ${i.fromId} → ${i.toId}`
                : i.kind === "frame"
                  ? `frame "${i.title}"`
                  : "text" in i
                    ? `${i.kind} "${i.text.slice(0, 60)}"`
                    : i.kind;
            return `- \`${i.id}\` ${what} @ ${Math.round(i.x)},${Math.round(i.y)} ${Math.round(i.width)}×${Math.round(i.height)}`;
          })
          .join("\n") +
        (context.board.selection.length
          ? `\n\nSelected right now: ${context.board.selection.map((id) => `\`${id}\``).join(", ")}`
          : ""),
    );

  if (context.selection?.text)
    out.push(
      `## Selected text (in block \`${context.selection.blockId}\`)\n${context.selection.text}`,
    );

  if (context.workspace.length)
    out.push(
      `## Other projects in the library\n` +
        context.workspace
          .map((p) => `- \`${p.id}\` ${p.name} (${p.kind}) — ${p.summary}`)
          .join("\n"),
    );

  return out.join("\n\n");
}

export function buildMessages(prompt: string, context: AIContext): ChatMessage[] {
  const dictated = prompt.startsWith("__speech__");
  const question = dictated ? prompt.replace(/^__speech__\s*/, "") : prompt;

  return [
    { role: "system", content: dictated ? `${SYSTEM}\n\n${SPEECH}` : SYSTEM },
    {
      role: "user",
      content: `${renderContext(context)}\n\n---\n\n${
        dictated ? "Dictated, to clean up and append:" : "The question:"
      }\n${question}`,
    },
  ];
}
