"use client";

/**
 * Making a set out of something you already have.
 *
 * The three things anybody actually wants to be tested on are in this app
 * already: a note they took in a lecture, a document they wrote, and the PDF
 * the lecturer handed out. So the source is picked from those rather than
 * pasted — asking somebody to copy their own notes into a box, in the tool
 * the notes are in, is the kind of step that makes a feature go unused.
 *
 * Nothing is sent until the text has actually been got hold of, and if it
 * cannot be, the reason is shown here rather than becoming an empty set.
 */

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { blockToText } from "@/lib/ai/context";
import { canExtract } from "@/lib/files/extract";
import { assetData, useKit, type KitFile } from "@/lib/kit";
import { accountFileData, listAccountFiles, type AccountFile } from "@/lib/kit/account";
import { iconFor } from "@/lib/kit/mime";
import { readAsText } from "@/lib/kit/text";
import { listNotes, titleOf, type Note } from "@/lib/db/notes";
import { useProjects } from "@/lib/store";
import { createSet, makeCards } from "@/lib/study";

/** What the model is shown of one source. The endpoint caps this again. */
const SOURCE_CEILING = 60_000;

type Kind = "cards" | "questions";

interface Source {
  key: string;
  name: string;
  detail: string;
  icon: Parameters<typeof Icon>[0]["name"];
  /** Got hold of only when this one is chosen — a shelf is not read to list it. */
  read: () => Promise<string>;
}

export function NewSet({
  onMade,
  onClose,
}: {
  onMade: (setId: string) => void;
  onClose: () => void;
}) {
  const projects = useProjects((s) => s.projects);
  const assets = useKit((s) => s.assets);
  const [notes, setNotes] = useState<Note[]>([]);
  const [account, setAccount] = useState<AccountFile[]>([]);
  const [chosen, setChosen] = useState<Source | null>(null);
  const [kind, setKind] = useState<Kind>("cards");
  const [count, setCount] = useState(20);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    // Both shelves are optional: no account means no notes and no account
    // files, and that is an ordinary state rather than a fault.
    listNotes().then(setNotes).catch(() => {});
    listAccountFiles().then(setAccount).catch(() => {});
  }, []);

  const sources: Source[] = [
    ...notes.map((note) => ({
      key: `note:${note.id}`,
      name: titleOf(note) || "Untitled note",
      detail: "note",
      icon: "sticky" as const,
      read: async () => note.body,
    })),
    ...projects.map((project) => ({
      key: `project:${project.id}`,
      name: project.name,
      detail: "document",
      icon: "text" as const,
      read: async () =>
        project.blocks.map((block) => blockToText(block, project)).join("\n\n"),
    })),
    ...assets
      .filter((asset): asset is KitFile => asset.kind === "file")
      .filter((asset) => canExtract(asset.mime, asset.filename))
      .map((asset) => ({
        key: `asset:${asset.id}`,
        name: asset.name,
        detail: "on this browser",
        icon: iconFor(asset.mime, asset.name),
        read: async () => {
          const data = await assetData(asset.id);
          if (!data) throw new Error("Those bytes aren't here any more.");
          const got = await readAsText(data, asset.mime, asset.name, SOURCE_CEILING);
          if (!got) throw new Error("There are no words in that file.");
          return got.text;
        },
      })),
    ...account
      .filter((file) => canExtract(file.mime, file.name))
      .map((file) => ({
        key: `file:${file.id}`,
        name: file.name,
        detail: "in your account",
        icon: iconFor(file.mime, file.name),
        read: async () => {
          const got = await readAsText(
            await accountFileData(file),
            file.mime,
            file.name,
            SOURCE_CEILING,
          );
          if (!got) throw new Error("There are no words in that file.");
          return got.text;
        },
      })),
  ];

  const make = async () => {
    if (!chosen) return;
    setProblem(null);
    setBusy(true);
    try {
      const text = (await chosen.read()).trim();
      if (text.length < 40)
        throw new Error("There isn't enough in that to make cards from.");
      const made = await makeCards(text.slice(0, SOURCE_CEILING), kind, count);
      const set = createSet({
        name: chosen.name,
        source: chosen.detail,
        cards: made.cards,
      });
      onMade(set.id);
    } catch (error) {
      setProblem(String((error as Error).message ?? error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />
      <div
        role="dialog"
        aria-label="New set"
        className="relative flex h-full w-full max-w-[400px] flex-col border-l border-line bg-surface-2"
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-[13px] font-medium text-fg">New set</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-sm p-1 text-fg-subtle hover:text-fg"
          >
            <Icon name="x" size={13} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <span className="text-meta text-fg-subtle">What to learn</span>
          {sources.length === 0 ? (
            <p className="mt-2 text-[12px] leading-relaxed text-fg-subtle">
              Nothing to make cards from yet. Write a note, start a document,
              or put a PDF on the Kit page and it will be here.
            </p>
          ) : (
            <ul className="mt-1.5 grid gap-px">
              {sources.map((source) => (
                <li key={source.key}>
                  <button
                    type="button"
                    onClick={() => setChosen(source)}
                    aria-pressed={chosen?.key === source.key}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-xs px-2 py-1.5 text-left transition-colors",
                      chosen?.key === source.key
                        ? "bg-surface text-fg"
                        : "text-fg-muted hover:bg-surface",
                    )}
                  >
                    <Icon name={source.icon} size={12} className="shrink-0 text-fg-subtle" />
                    <span className="min-w-0 flex-1 truncate text-[12px]">{source.name}</span>
                    <span className="shrink-0 text-[10.5px] text-fg-subtle">
                      {source.detail}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-5 grid gap-1">
            <span className="text-meta text-fg-subtle">What kind</span>
            <div className="flex rounded-sm border border-line p-0.5" role="group">
              {(
                [
                  ["cards", "Recall cards"],
                  ["questions", "Practice questions"],
                ] as const
              ).map(([option, label]) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setKind(option)}
                  aria-pressed={kind === option}
                  className={cn(
                    "flex-1 rounded-xs px-2 py-1 text-[11.5px] transition-colors",
                    kind === option ? "bg-surface text-fg" : "text-fg-subtle hover:text-fg",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-fg-subtle">
              {kind === "cards"
                ? "A term or a short question on the front, what it means on the back."
                : "A question you could be asked in an exam, and why the answer is the answer."}
            </p>
          </div>

          <label className="mt-5 grid gap-1">
            <span className="text-meta text-fg-subtle">Roughly how many</span>
            <input
              type="number"
              min={4}
              max={60}
              value={count}
              onChange={(e) => setCount(Number(e.target.value) || 20)}
              className="w-[90px] rounded-sm border border-line bg-surface px-2.5 py-1.5 text-[12.5px] text-fg outline-none focus:border-accent"
            />
          </label>

          {problem && (
            <p className="mt-4 text-[11.5px] leading-relaxed text-warn" role="alert">
              {problem}
            </p>
          )}
        </div>

        <div className="border-t border-line p-4">
          <button
            type="button"
            disabled={!chosen || busy}
            onClick={() => void make()}
            className="w-full rounded-sm bg-accent px-3 py-2 text-[12px] font-medium text-on-accent transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {busy ? "Reading it and writing cards…" : "Make the cards"}
          </button>
          <p className="mt-2 text-[10.5px] leading-relaxed text-fg-subtle">
            Cards are made only from what is in the source. Check them — the
            one you are about to memorise is the one worth being sure about.
          </p>
        </div>
      </div>
    </div>
  );
}
