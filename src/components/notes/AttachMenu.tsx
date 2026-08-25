"use client";

/**
 * Picking a file for the assistant to read.
 *
 * "Maak een analyse van dit bestand" is the whole point of the notepad's
 * assistant, and it needs a file to point at. Both shelves are offered from
 * one list — what this browser has kept locally and what the account holds,
 * including everything the desktop app has sent up — because from the
 * asking side that distinction is the tool's problem, not the person's.
 *
 * Only what can be read is offered, and what can be read is now whatever the
 * team chat could already read — text, .docx, .pptx and PDFs. A spreadsheet
 * on the shelf is shown greyed with the reason, rather than hidden: somebody
 * who cannot find the file they just uploaded assumes the picker is broken,
 * and a reason is a smaller disappointment than a list that lies.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { assetData, formatBytes, useKit, type KitAsset } from "@/lib/kit";
import { accountFileData, listAccountFiles, type AccountFile } from "@/lib/kit/account";
import { iconFor, labelFor } from "@/lib/kit/mime";
import { isArtefact } from "@/lib/kit/artefact";
import { canExtract } from "@/lib/files/extract";
import { readAsText } from "@/lib/kit/text";
import type { AssistFile } from "@/lib/ai/assist/client";

/** What the model is given of one file, at most. */
const PER_FILE_CEILING = 60_000;

/** One row in the picker, whichever shelf it came from. */
interface Candidate {
  id: string;
  name: string;
  mime: string;
  bytes: number;
  where: "here" | "account";
  readable: boolean;
}

/**
 * Only kept files, never pictures or fonts.
 *
 * Nothing here reads an image — there is no vision model behind this
 * endpoint — and offering a photo greyed out with "text can't be read" would
 * be a strange thing to say about a photo. Fonts are the same. The greying is
 * for files somebody would reasonably expect to work: the .xlsx, the .odt.
 */
const candidateOfAsset = (asset: KitAsset): Candidate | null => {
  if (asset.kind !== "file") return null;
  return {
    id: asset.id,
    name: asset.name,
    mime: asset.mime,
    bytes: asset.bytes,
    where: "here",
    readable: canExtract(asset.mime, asset.filename),
  };
};

const candidateOfAccountFile = (file: AccountFile): Candidate => ({
  id: file.id,
  name: file.name,
  mime: file.mime,
  bytes: file.size,
  where: "account",
  readable: canExtract(file.mime, file.name),
});

export function AttachMenu({
  attached,
  onAttach,
  onDetach,
}: {
  attached: AssistFile[];
  onAttach: (file: AssistFile) => void;
  onDetach: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [account, setAccount] = useState<AccountFile[]>([]);
  const [reading, setReading] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [noted, setNoted] = useState<string | null>(null);
  const assets = useKit((s) => s.assets);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    listAccountFiles()
      .then((files) => {
        if (alive) setAccount(files);
      })
      // An account with no `kit_files` table is a deployment that has not run
      // the migration, not a fault worth shouting about here — the local
      // shelf still works and the kit page says what is missing.
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const candidates = useMemo(() => {
    const local = assets.map(candidateOfAsset).filter((c): c is Candidate => c !== null);
    // A document the assistant made is not a document to feed back to it.
    const remote = account.filter((f) => !isArtefact(f)).map(candidateOfAccountFile);
    const rows = [...local, ...remote];
    // Readable first: the list exists to be picked from, and the ones that
    // cannot be picked should not be in the way of the ones that can.
    return rows.sort((a, b) => Number(b.readable) - Number(a.readable));
  }, [assets, account]);

  const pick = async (candidate: Candidate) => {
    setProblem(null);
    setNoted(null);
    setReading(candidate.id);
    try {
      const data =
        candidate.where === "here"
          ? await assetData(candidate.id)
          : await accountFileData(
              account.find((f) => f.id === candidate.id) as AccountFile,
            );
      if (!data) throw new Error("Those bytes aren't here any more.");

      const read = await readAsText(
        data,
        candidate.mime,
        candidate.name,
        PER_FILE_CEILING,
      );
      onAttach({
        id: candidate.id,
        name: candidate.name,
        mime: candidate.mime,
        bytes: candidate.bytes,
        ...(read === null ? {} : { text: read.text }),
      });
      setNoted(read?.note ?? null);
      setOpen(false);
    } catch (error) {
      setProblem(String((error as Error).message ?? error));
    } finally {
      setReading(null);
    }
  };

  return (
    <div className="relative" ref={box}>
      {attached.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-1">
          {attached.map((file) => (
            <li key={file.id}>
              <span className="flex items-center gap-1 rounded-xs border border-line bg-surface-2 py-0.5 pl-1.5 pr-0.5 text-[11px] text-fg-muted">
                <Icon name={iconFor(file.mime, file.name)} size={11} className="shrink-0" />
                <span className="max-w-[140px] truncate">{file.name}</span>
                <button
                  type="button"
                  onClick={() => onDetach(file.id)}
                  className="rounded-xs p-0.5 text-fg-subtle transition-colors duration-150 hover:text-fg"
                  aria-label={`Don't send ${file.name}`}
                >
                  <Icon name="x" size={10} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {noted && (
        <p className="mb-2 text-[10.5px] leading-relaxed text-fg-subtle">{noted}</p>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn(
          "flex items-center gap-1 rounded-xs border border-line px-1.5 py-1 text-[11px] transition-colors duration-150",
          open ? "border-line-strong text-fg" : "text-fg-subtle hover:text-fg",
        )}
      >
        <Icon name="file" size={11} />
        Attach a file
      </button>

      {open && (
        <div className="absolute bottom-full left-0 z-30 mb-1.5 max-h-[300px] w-[280px] overflow-y-auto rounded-sm border border-line bg-surface p-1 shadow-lg">
          {candidates.length === 0 ? (
            <p className="px-2 py-3 text-[11.5px] leading-relaxed text-fg-subtle">
              Nothing on your shelf yet. Drop a file on the Kit page — or on
              the desktop note — and it will be here.
            </p>
          ) : (
            <ul className="grid gap-px">
              {candidates.map((candidate) => (
                <li key={`${candidate.where}:${candidate.id}`}>
                  <button
                    type="button"
                    disabled={!candidate.readable || reading !== null}
                    onClick={() => void pick(candidate)}
                    title={
                      candidate.readable
                        ? undefined
                        : `${labelFor(candidate.mime, candidate.name)} — its text can't be read yet`
                    }
                    className={cn(
                      "flex w-full items-center gap-2 rounded-xs px-2 py-1.5 text-left transition-colors duration-150",
                      candidate.readable
                        ? "hover:bg-surface-2"
                        : "cursor-not-allowed opacity-45",
                    )}
                  >
                    <Icon
                      name={iconFor(candidate.mime, candidate.name)}
                      size={13}
                      className="shrink-0 text-fg-subtle"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] text-fg">
                        {candidate.name}
                      </span>
                      <span className="block truncate text-[10.5px] text-fg-subtle">
                        {reading === candidate.id
                          ? "Reading…"
                          : candidate.readable
                            ? `${formatBytes(candidate.bytes)} · ${candidate.where === "here" ? "on this browser" : "in your account"}`
                            : "Text can't be read yet"}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {problem && (
            <p className="px-2 py-1.5 text-[11px] text-warn" role="alert">
              {problem}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
