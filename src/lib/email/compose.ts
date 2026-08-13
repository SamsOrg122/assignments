/**
 * Turning a piece of work into an email.
 *
 * Not an inbox, and deliberately not. Your address lives at your school or
 * your company; nobody moves it, and a mail client here would be competing
 * with Outlook on the one thing people cannot switch. What is actually hard
 * about sending your work to somebody is *writing the message* — so this
 * writes the message and then hands it to whatever you already use.
 *
 * Three ways out, because each one breaks somewhere:
 *  - `mailto:` opens the real compose window, and is the nicest of the three
 *    until the body is long. The limit is the URL, not us: Windows has
 *    historically cut these off around two thousand characters, silently.
 *  - a `.eml` file opens in every desktop client with the subject and body
 *    intact and no length limit, but arrives as a download.
 *  - the clipboard always works and never surprises anyone.
 * The interface offers all three and says which one is safe for the draft in
 * hand rather than guessing.
 *
 * The draft itself is built here, locally, from the project — no model
 * involved, so it works offline and with no key. The assistant can rewrite it
 * afterwards; that is an improvement on a working draft rather than the only
 * path to one.
 */

import type { Project } from "../types";
import { outline, projectSummary, projectWordCount } from "../summary";
import { formatNumber } from "../format";

export interface Draft {
  to: string;
  subject: string;
  body: string;
}

/**
 * A conservative ceiling for `mailto:`. RFC 2368 sets none; the limit is
 * whatever the operating system will pass along, and the smallest number
 * anybody documents is around 2,000 characters. Staying under it means the
 * difference between a full draft and a silently truncated one.
 */
export const MAILTO_LIMIT = 1800;

/** What the person would have written themselves, before editing it. */
export function draftFor(project: Project, link?: string | null): Draft {
  const sections = outline(project.blocks).filter((s) => s.title.trim());
  const words = projectWordCount(project);
  const summary = projectSummary(project);

  const lines: string[] = [];
  lines.push(`Hello,`, ``);
  lines.push(
    summary
      ? `I've attached — or linked below — ${project.name}. ${summary}`
      : `Here is ${project.name}.`,
  );

  if (sections.length > 1) {
    lines.push(``, `What's in it:`);
    for (const section of sections.slice(0, 8)) {
      lines.push(`  • ${section.title}`);
    }
    if (sections.length > 8) lines.push(`  • …and ${sections.length - 8} more`);
  }

  if (words) lines.push(``, `${formatNumber(words)} words in total.`);
  if (link) lines.push(``, link);

  lines.push(``, `Thanks,`);

  return { to: "", subject: project.name, body: lines.join("\n") };
}

/** Whether `mailto:` will carry this draft without losing the end of it. */
export function fitsInMailto(draft: Draft): boolean {
  return mailtoHref(draft).length <= MAILTO_LIMIT;
}

export function mailtoHref(draft: Draft): string {
  const query = new URLSearchParams();
  if (draft.subject) query.set("subject", draft.subject);
  if (draft.body) query.set("body", draft.body);
  /*
   * URLSearchParams encodes a space as "+", which is correct for a form body
   * and wrong for a mailto: — some clients paste the plus signs in literally.
   * Percent-encoding is what RFC 2368 asks for.
   */
  return `mailto:${encodeURIComponent(draft.to)}?${query.toString().replace(/\+/g, "%20")}`;
}

/**
 * RFC 2047 encoded-word, for header text a mail client would otherwise mangle.
 *
 * A header is defined as ASCII. "Bijlage: hoofdstuk 3" in a raw Subject line
 * arrives as mojibake in about half the clients that will open this file, and
 * the half it breaks in is not the half you can test.
 */
function encodeHeader(text: string): string {
  if (!/[^ -~]/.test(text)) return text;
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `=?UTF-8?B?${btoa(binary)}?=`;
}

/**
 * The draft as a file every desktop mail client opens as a new message.
 *
 * CRLF throughout: RFC 5322 defines the line ending, and a client that
 * tolerates bare newlines in the body will still lose the header block if the
 * separating line is wrong.
 */
export function emlText(draft: Draft): string {
  const headers = [
    draft.to ? `To: ${draft.to}` : null,
    `Subject: ${encodeHeader(draft.subject)}`,
    `X-Unsent: 1`, // Tells Outlook to open it as a draft rather than as received mail.
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=utf-8`,
    `Content-Transfer-Encoding: 8bit`,
  ].filter(Boolean);

  return `${headers.join("\r\n")}\r\n\r\n${draft.body.replace(/\r?\n/g, "\r\n")}\r\n`;
}

/** A filename that survives every filesystem people actually use. */
export function emlFilename(draft: Draft): string {
  const stem =
    draft.subject
      .replace(/[^\p{L}\p{N} _-]/gu, "")
      .trim()
      .slice(0, 60) || "message";
  return `${stem}.eml`;
}

/** What the assistant is asked, when somebody wants the draft rewritten. */
export function rewritePrompt(draft: Draft, instruction: string): string {
  return [
    `Rewrite this email. ${instruction}`,
    ``,
    `Keep it short and plain. No marketing language, no exclamation marks.`,
    `Answer with the subject line first, prefixed exactly "Subject: ", then a`,
    `blank line, then the body. Nothing else.`,
    ``,
    `Subject: ${draft.subject}`,
    ``,
    draft.body,
  ].join("\n");
}

/**
 * Read a rewritten draft back out of the model's answer.
 *
 * Falls back to treating the whole answer as the body rather than throwing: a
 * model that ignores the format has still written something useful, and losing
 * it to a parse error would be the worse outcome.
 */
export function parseRewrite(answer: string, previous: Draft): Draft {
  const match = answer.match(/^\s*Subject:\s*(.+?)\s*\n([\s\S]*)$/);
  if (!match) return { ...previous, body: answer.trim() };
  return { ...previous, subject: match[1].trim(), body: match[2].trim() };
}
