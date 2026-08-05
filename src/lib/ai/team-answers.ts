/**
 * Team-aware answers.
 *
 * These are the questions that are only answerable if the assistant knows who
 * the team is: who signs off, what the group calls things, when the deadline
 * is, what's in the brief someone uploaded. Everything here computes over the
 * real workspace record rather than inventing plausible-sounding staff.
 */

import { ROLE_LABELS } from "../team/permissions";
import type { AIContext } from "./types";
import { words as contentWords } from "./analysis";

type Team = NonNullable<AIContext["team"]>;

/** Score a knowledge entry or file against the question's vocabulary. */
function relevance(query: Set<string>, text: string): number {
  if (query.size === 0) return 0;
  const target = new Set(contentWords(text));
  let hits = 0;
  for (const w of query) if (target.has(w)) hits++;
  return hits / query.size;
}

export interface TeamAnswer {
  text: string;
  /** Something worth remembering that came out of this exchange. */
  learn?: { kind: string; subject: string; body: string };
}

/* ── Who does what ──────────────────────────────────────── */

export function answerWho(team: Team, prompt: string): TeamAnswer {
  const query = new Set(contentWords(prompt));

  // "who is my supervisor" — match on title and role as well as name.
  const scored = team.members
    .map((m) => ({
      member: m,
      score: relevance(
        query,
        `${m.name} ${m.title ?? ""} ${m.about ?? ""} ${ROLE_LABELS[m.role]}`,
      ),
    }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (best && best.score > 0.15) {
    const m = best.member;
    return {
      text:
        `**${m.name}**${m.title ? ` — ${m.title}` : ""} (${ROLE_LABELS[m.role]}${m.isYou ? ", that's you" : ""}).\n\n` +
        (m.about ? `${m.about}\n\n` : "") +
        `_From the workspace member list, not a guess._`,
    };
  }

  const lines = [
    `**${team.workspaceName}** has ${team.members.length} member${team.members.length === 1 ? "" : "s"}:`,
    "",
    ...team.members.map(
      (m) =>
        `• **${m.name}** — ${m.title ?? ROLE_LABELS[m.role]}` +
        `${m.isYou ? " (you)" : ""}` +
        `${m.about ? `\n  ${m.about}` : ""}`,
    ),
  ];
  if (team.context?.organisation)
    lines.push("", `At ${team.context.organisation}${team.context.unit ? `, ${team.context.unit}` : ""}.`);
  return { text: lines.join("\n") };
}

/* ── What do we know ────────────────────────────────────── */

export function answerKnowledge(team: Team, prompt: string): TeamAnswer {
  const query = new Set(contentWords(prompt));

  const hits = team.knowledge
    .map((k) => ({ k, score: relevance(query, `${k.subject} ${k.body}`) }))
    .filter((r) => r.score > 0.2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  if (hits.length === 0) {
    const byKind = new Map<string, number>();
    for (const k of team.knowledge)
      byKind.set(k.kind, (byKind.get(k.kind) ?? 0) + 1);
    return {
      text:
        `Nothing on file about that.\n\n` +
        `The workspace currently remembers ${team.knowledge.length} thing${team.knowledge.length === 1 ? "" : "s"}: ` +
        [...byKind.entries()].map(([k, n]) => `${n} ${k}`).join(", ") +
        `.\n\n_Tell me and I'll offer to remember it._`,
    };
  }

  const lines = ["From what this workspace knows:", ""];
  for (const { k } of hits)
    lines.push(
      `• **${k.subject}** — ${k.body}` +
        (k.confirmed ? "" : `  _(unconfirmed, learned from ${k.source})_`),
    );
  return { text: lines.join("\n") };
}

/* ── Files ──────────────────────────────────────────────── */

export function answerFiles(team: Team, prompt: string): TeamAnswer {
  if (team.files.length === 0)
    return {
      text: "No files have been given to the workspace yet. Upload one on the Team page and I'll read it.",
    };

  const query = new Set(contentWords(prompt));
  const scored = team.files
    .map((f) => ({ f, score: relevance(query, `${f.name} ${f.text}`) }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score < 0.12) {
    return {
      text:
        `I have ${team.files.length} file${team.files.length === 1 ? "" : "s"}:\n\n` +
        team.files
          .map((f) => `• **${f.name}** — ${f.text.split(/\s+/).length} words`)
          .join("\n") +
        `\n\nAsk about anything in them.`,
    };
  }

  // Quote the passages that actually matched, so the answer is checkable.
  const sentences = best.f.text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 25);
  const picked = sentences
    .map((s) => ({ s, score: relevance(query, s) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .filter((r) => r.score > 0);

  return {
    text:
      `From **${best.f.name}**:\n\n` +
      picked.map((p) => `> ${p.s}`).join("\n\n") +
      `\n\n_Quoted from the uploaded file so you can check it._`,
  };
}

/* ── Remembering ────────────────────────────────────────── */

const KIND_HINTS: Array<[RegExp, string]> = [
  [/\b(deadline|due|submit|submission|hand in)\b/i, "deadline"],
  [/\b(call|term|word|we say|refer to)\b/i, "term"],
  [/\b(always|never|must|should|style|format|convention|rule)\b/i, "convention"],
  [/\b(supervisor|reader|lead|works on|responsible|handles)\b/i, "person"],
  [/\b(university|company|department|programme|course|school)\b/i, "org"],
];

/**
 * "Remember that the deadline is 12 June" — turn an instruction into a
 * structured entry. The subject is what makes it findable later, so it's
 * extracted rather than left as the whole sentence.
 */
export function answerRemember(prompt: string): TeamAnswer {
  const body = prompt
    .replace(/^\s*(please\s+)?(remember|note|keep in mind|don'?t forget)\s*(that\s+)?/i, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!body)
    return { text: "Tell me what to remember — a deadline, a convention, who does what." };

  const kind =
    KIND_HINTS.find(([pattern]) => pattern.test(body))?.[1] ?? "fact";

  // A leading noun phrase makes a better subject than the first three words.
  const subject =
    /^(?:the\s+)?([\w' -]{3,40}?)\s+(?:is|are|was|were|will be|must|should|goes|lives)\b/i.exec(
      body,
    )?.[1] ?? body.split(/\s+/).slice(0, 4).join(" ");

  return {
    text:
      `I'll add this to what the workspace knows:\n\n` +
      `**${titleCase(subject)}** — ${body}\n\n` +
      `Filed as a ${kind}. Everyone on the team sees it, and it goes into the context for future answers.`,
    learn: { kind, subject: titleCase(subject), body },
  };
}

function titleCase(s: string): string {
  const trimmed = s.trim().replace(/[.,;:]$/, "");
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/* ── Onboarding ─────────────────────────────────────────── */

/** "Catch me up" / "what should a new person know". */
export function answerBrief(team: Team): TeamAnswer {
  const lines: string[] = [];

  if (team.context?.organisation || team.context?.unit)
    lines.push(
      `**${team.workspaceName}** — ${[team.context?.organisation, team.context?.unit].filter(Boolean).join(", ")}.`,
      "",
    );
  if (team.context?.subject) lines.push(team.context.subject, "");

  lines.push("**Who's who**", "");
  for (const m of team.members)
    lines.push(
      `• ${m.name} — ${m.title ?? ROLE_LABELS[m.role]}${m.isYou ? " (you)" : ""}`,
    );

  const deadlines = team.knowledge.filter((k) => k.kind === "deadline");
  if (deadlines.length) {
    lines.push("", "**Dates**", "");
    for (const d of deadlines) lines.push(`• ${d.subject} — ${d.body}`);
  }

  const conventions = team.knowledge.filter(
    (k) => k.kind === "convention" || k.kind === "term",
  );
  if (conventions.length) {
    lines.push("", "**How this team works**", "");
    for (const c of conventions) lines.push(`• ${c.subject} — ${c.body}`);
  }

  if (team.files.length) {
    lines.push("", "**Files I've read**", "");
    for (const f of team.files) lines.push(`• ${f.name}`);
  }

  if (team.context?.notes) lines.push("", team.context.notes);

  return { text: lines.join("\n") };
}
