"use client";

/**
 * "Make an email out of this."
 *
 * The draft is written before the dialog opens, from the project itself, with
 * no model involved — so this works offline, works with no key, and never
 * shows anybody a spinner where a starting point should be. The assistant
 * rewrites it on request, which is an improvement on something rather than the
 * only way to get anything.
 *
 * Three ways out, and the reason all three exist is in `lib/email/compose.ts`.
 * The one that matters here: `mailto:` quietly truncates a long body on some
 * systems, so when the draft is too long the button says so and points at the
 * file instead. A send button that loses the last two paragraphs without
 * mentioning it is worse than no send button.
 */

import { useState } from "react";
import { Dialog, Row, Button, fieldClass } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { download } from "@/lib/export";
import { askAI } from "@/lib/ai";
import { buildContext } from "@/lib/ai/context";
import { useProjects } from "@/lib/store";
import { useUI } from "@/lib/ui-store";
import {
  type Draft,
  draftFor,
  emlFilename,
  emlText,
  fitsInMailto,
  mailtoHref,
  parseRewrite,
  rewritePrompt,
} from "@/lib/email/compose";
import type { Project } from "@/lib/types";

export function EmailDraft({
  project,
  link,
  onClose,
}: {
  project: Project;
  /** The share link, when one has been made. Goes into the body if so. */
  link?: string | null;
  onClose: () => void;
}) {
  const projects = useProjects((s) => s.projects);
  const notify = useUI((s) => s.notify);

  const [draft, setDraft] = useState<Draft>(() => draftFor(project, link));
  const [instruction, setInstruction] = useState("");
  const [rewriting, setRewriting] = useState(false);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const short = fitsInMailto(draft);

  const rewrite = async () => {
    if (rewriting) return;
    setRewriting(true);
    try {
      const context = buildContext(project, projects);
      let answer = "";
      for await (const chunk of askAI(
        rewritePrompt(draft, instruction.trim() || "Keep the meaning."),
        context,
      )) {
        if (chunk.type === "text") answer += chunk.value;
      }
      if (answer.trim()) setDraft((d) => parseRewrite(answer, d));
      else notify("The assistant didn't answer. The draft is unchanged.");
    } catch {
      notify("Couldn't reach the assistant. The draft is unchanged.");
    } finally {
      setRewriting(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        `${draft.subject}\n\n${draft.body}`,
      );
      notify("Copied — subject on the first line.");
    } catch {
      notify("This browser refused the clipboard. Select the text instead.");
    }
  };

  return (
    <Dialog
      title="Email this"
      description="Written from the project. Edit it here, then hand it to whatever you send mail with — nothing is sent from Tougather."
      onClose={onClose}
      width={560}
      footer={
        <>
          <Button onClick={copy}>Copy</Button>
          <Button
            onClick={() => {
              download(
                emlFilename(draft),
                emlText(draft),
                "message/rfc822",
              );
              notify("Saved. Opening it starts a draft in your mail app.");
            }}
          >
            Download .eml
          </Button>
          <Button
            variant="primary"
            disabled={!short}
            onClick={() => {
              window.location.href = mailtoHref(draft);
            }}
          >
            Open in mail app
          </Button>
        </>
      }
    >
      <Row label="To" hint="Optional. Leave it empty and fill it in over there.">
        <input
          type="email"
          value={draft.to}
          aria-label="To"
          placeholder="someone@example.com"
          onChange={(e) => set("to", e.target.value)}
          className={fieldClass}
        />
      </Row>

      <Row label="Subject">
        <input
          value={draft.subject}
          aria-label="Subject"
          onChange={(e) => set("subject", e.target.value)}
          className={fieldClass}
        />
      </Row>

      <Row label="Message">
        <textarea
          value={draft.body}
          aria-label="Message"
          rows={12}
          onChange={(e) => set("body", e.target.value)}
          className={`${fieldClass} resize-y font-normal leading-relaxed`}
        />
      </Row>

      <Row
        label="Ask the assistant to rewrite it"
        hint="It rewrites what's above and nothing else — your project is not touched."
      >
        <div className="flex gap-1.5">
          <input
            value={instruction}
            aria-label="How it should be rewritten"
            placeholder="shorter, and for my supervisor"
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void rewrite();
              }
            }}
            className={fieldClass}
          />
          <Button onClick={() => void rewrite()} disabled={rewriting}>
            {rewriting ? "Writing…" : "Rewrite"}
          </Button>
        </div>
      </Row>

      {!short && (
        <p className="flex items-start gap-1.5 text-[11.5px] leading-relaxed text-[#d8a33c]">
          <Icon name="file" size={11} className="mt-0.5 shrink-0" />
          This is too long to hand over as a link — some systems would cut it
          off partway through without saying so. Use the file or the clipboard.
        </p>
      )}
    </Dialog>
  );
}
