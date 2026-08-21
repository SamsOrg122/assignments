"use client";

/**
 * The kit: everything you brought, in one place you can look at.
 *
 * It used to be four fixed lists — fonts, pictures, files, pieces — each
 * with its own empty state, plus a fifth appearing only when the account
 * had something in it. That is a filing cabinet. A library is one shelf you
 * search and one grid you recognise things in, so the kinds became filters
 * over a single set and the account's files became a *source* on that same
 * shelf rather than a section below the real ones.
 *
 * Deliberately not called a Library — that word already means the list of
 * your projects here, and two of them would make every sentence ambiguous.
 *
 * The rule that decides whether people trust it: using something copies it.
 * Nothing inserted into a document stays wired to this page, so clearing
 * the shelf never reaches back into work already handed in.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TopBar } from "@/components/shell/TopBar";
import {
  KitError,
  addDropped,
  addFont,
  addImage,
  assetData,
  assetPreview,
  formatBytes,
  removeAsset,
  useKit,
  type KitAsset,
  type KitFile,
  type KitFont,
  type KitImage,
} from "@/lib/kit";
import { searchKit } from "@/lib/kit/search";
import { pickImage } from "@/lib/images";
import {
  accountFileData,
  accountThumb,
  deleteAccountFile,
  listAccountFiles,
  renameAccountFile,
  type AccountFile,
} from "@/lib/kit/account";
import { adoptArtefact, artefactName, isArtefact } from "@/lib/kit/artefact";
import { useUI } from "@/lib/ui-store";
import { useRemoteConfigured } from "@/lib/db/use-config";
import { useRouter } from "next/navigation";
import { Card, CardAction, Meta, NameField, Preview } from "@/components/kit/AssetCard";
import { InsertMenu } from "@/components/kit/InsertMenu";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";

type Shelf = "all" | "image" | "file" | "font" | "piece" | "desktop";

const SHELVES: Array<{ id: Shelf; label: string }> = [
  { id: "all", label: "Everything" },
  { id: "image", label: "Pictures" },
  { id: "file", label: "Files" },
  { id: "font", label: "Fonts" },
  { id: "piece", label: "Pieces" },
  { id: "desktop", label: "From your desktop" },
];

export default function KitPage() {
  const assets = useKit((s) => s.assets);
  const rename = useKit((s) => s.rename);
  const notify = useUI((s) => s.notify);
  const configured = useRemoteConfigured();

  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [query, setQuery] = useState("");
  const [shelf, setShelf] = useState<Shelf>("all");
  const [inserting, setInserting] = useState<string | null>(null);

  const [fromAccount, setFromAccount] = useState<AccountFile[] | null>(null);
  const [accountProblem, setAccountProblem] = useState<string | null>(null);

  const fontRef = useRef<HTMLInputElement>(null);
  const anyRef = useRef<HTMLInputElement>(null);
  const guardRef = useRef<(work: () => Promise<unknown>) => Promise<void>>(
    async () => {},
  );
  const notifyRef = useRef<(message: string) => void>(() => {});

  const total = assets.reduce((n, a) => n + a.bytes, 0);

  /**
   * The account shelf, refreshable and honest about failing.
   *
   * It used to be one fetch on mount whose failure was swallowed, and the
   * section was hidden when the list came back empty — so a signed-in
   * person whose request had failed saw exactly what a person with no files
   * saw, which is the wrong answer to "where did my file go".
   */
  const refreshAccount = useCallback(() => {
    if (!configured) {
      setFromAccount([]);
      setAccountProblem(null);
      return;
    }
    listAccountFiles()
      .then((files) => {
        setFromAccount(files);
        setAccountProblem(null);
      })
      .catch((error) => {
        setFromAccount([]);
        setAccountProblem(
          error instanceof Error ? error.message : "Couldn't reach your account.",
        );
      });
  }, [configured]);

  useEffect(() => {
    // Off the effect body: with no database `refreshAccount` sets state as
    // its first act, and doing that synchronously here is the cascading
    // render the lint rule is right about. A microtask is the same tick to
    // a person.
    void Promise.resolve().then(refreshAccount);
  }, [refreshAccount]);

  /*
   * The drop. Listens on the window rather than on a target somebody has to
   * find: the promise is "drop it anywhere on this page and it is kept", and
   * a promise with a bullseye attached is a smaller promise.
   */
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) =>
      Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const over = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
    };
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth += 1;
      setDragging(true);
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const dropped = Array.from(e.dataTransfer?.files ?? []);
      if (dropped.length === 0) return;
      void guardRef.current(async () => {
        let kept = 0;
        const refused: string[] = [];
        // One file the shelf cannot take must not take the rest of the drop
        // with it — a drop that bounces wholesale because the fourth item
        // was a video is the chore this page exists to remove.
        for (const file of dropped) {
          try {
            await addDropped(file);
            kept += 1;
          } catch (error) {
            refused.push(
              error instanceof Error ? error.message : `${file.name} couldn't be kept.`,
            );
          }
        }
        if (kept)
          notifyRef.current(
            kept === 1 ? `${dropped[0]!.name} is on your shelf` : `${kept} files kept`,
          );
        if (refused.length) notifyRef.current(refused[0]!);
      });
    };
    window.addEventListener("dragover", over);
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, []);

  const guard = async (work: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await work();
    } catch (error) {
      notify(
        error instanceof KitError || error instanceof Error
          ? error.message
          : "That couldn't be added.",
      );
    } finally {
      setBusy(false);
    }
  };

  // The drop listener is bound once and must not rebind per render, so it
  // reaches the current guard and notify through refs — updated in an
  // effect, which is the only place React allows a ref to be written.
  useEffect(() => {
    guardRef.current = guard;
    notifyRef.current = notify;
  });

  /* ── What the grid is showing ── */

  const local = useMemo(() => {
    const wanted =
      shelf === "all"
        ? assets
        : shelf === "desktop"
          ? []
          : assets.filter((a) => a.kind === shelf);
    return searchKit(wanted, query).map((r) => r.item);
  }, [assets, shelf, query]);

  const account = useMemo(() => {
    if (shelf !== "all" && shelf !== "desktop" && shelf !== "file") return [];
    const files = fromAccount ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return files;
    return files.filter((f) => f.name.toLowerCase().includes(q));
  }, [fromAccount, shelf, query]);

  const nothing = local.length === 0 && account.length === 0;
  const counts: Record<Shelf, number> = {
    all: assets.length + (fromAccount?.length ?? 0),
    image: assets.filter((a) => a.kind === "image").length,
    file: assets.filter((a) => a.kind === "file").length,
    font: assets.filter((a) => a.kind === "font").length,
    piece: assets.filter((a) => a.kind === "piece").length,
    desktop: fromAccount?.length ?? 0,
  };

  return (
    <>
      <TopBar>
        <Icon name="board" size={13} className="shrink-0 text-fg-subtle" />
        <span className="text-[13px] font-medium text-fg">Kit</span>
        {total > 0 && (
          <span className="ml-auto font-mono text-[10.5px] text-fg-subtle">
            {formatBytes(total)} in this browser
          </span>
        )}
      </TopBar>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[980px] px-5 py-8 sm:px-8">
          <h1 className="display text-[22px] text-fg">Your kit</h1>
          <p className="mt-1.5 max-w-[64ch] text-[13px] leading-relaxed text-fg-muted">
            Everything you brought once and use everywhere — a typeface, a
            logo, a brief, a table you rebuild every term. Drop anything on
            this page and it lands here; files dropped on the desktop note
            arrive here too. Any of it goes into a document in one click.
          </p>

          {/* Search, then the shelves as filters over one set. */}
          <div className="mt-6 flex flex-col gap-3">
            <div className="flex items-center gap-2.5 rounded-md border border-line bg-surface px-3">
              <Icon name="search" size={14} className="shrink-0 text-fg-subtle" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search your kit — a name, a filename, a kind…"
                aria-label="Search your kit"
                spellCheck={false}
                className="w-full bg-transparent py-2.5 text-[13.5px] text-fg outline-none placeholder:text-fg-subtle"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className="rounded-xs p-1 text-fg-subtle transition-colors hover:text-fg"
                >
                  <Icon name="x" size={12} />
                </button>
              )}
            </div>

            <div className="no-scrollbar -mx-1 flex items-center gap-1 overflow-x-auto px-1 pb-0.5">
              {SHELVES.filter((s) => s.id !== "desktop" || configured).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={shelf === s.id}
                  onClick={() => setShelf(s.id)}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-sm border px-2 py-1 text-[11.5px] transition-colors duration-150",
                    shelf === s.id
                      ? "border-line-strong bg-surface-2 text-fg"
                      : "border-line text-fg-subtle hover:text-fg-muted",
                  )}
                >
                  {s.label}
                  <span className="font-mono text-[9.5px] opacity-60">
                    {counts[s.id]}
                  </span>
                </button>
              ))}

              <div className="ml-auto flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => fontRef.current?.click()}
                  className="flex items-center gap-1.5 rounded-sm border border-line px-2 py-1 text-[11.5px] text-fg-muted transition-colors hover:border-line-strong hover:text-fg disabled:opacity-40"
                >
                  <Icon name="type" size={11} />
                  Font
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void guard(async () => {
                      const image = await pickImage();
                      if (!image) return;
                      await addImage(image);
                      notify(`${image.name} is on your shelf`);
                    })
                  }
                  className="flex items-center gap-1.5 rounded-sm border border-line px-2 py-1 text-[11.5px] text-fg-muted transition-colors hover:border-line-strong hover:text-fg disabled:opacity-40"
                >
                  <Icon name="image" size={11} />
                  Picture
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => anyRef.current?.click()}
                  className="flex items-center gap-1.5 rounded-sm border border-accent/50 bg-accent-soft px-2 py-1 text-[11.5px] text-accent transition-colors hover:border-accent disabled:opacity-40"
                >
                  <Icon name="plus" size={11} />
                  Add files
                </button>
              </div>
            </div>
          </div>

          <input
            ref={fontRef}
            type="file"
            accept=".woff2,.woff,.ttf,.otf"
            className="sr-only"
            aria-label="Choose a font file"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file)
                void guard(async () => {
                  const font = await addFont(file);
                  notify(`${font.name} is ready to use`);
                });
            }}
          />
          <input
            ref={anyRef}
            type="file"
            multiple
            className="sr-only"
            aria-label="Choose files"
            onChange={(e) => {
              const chosen = Array.from(e.target.files ?? []);
              e.target.value = "";
              if (chosen.length === 0) return;
              void guard(async () => {
                let kept = 0;
                const refused: string[] = [];
                for (const file of chosen) {
                  try {
                    await addDropped(file);
                    kept += 1;
                  } catch (error) {
                    refused.push(
                      error instanceof Error
                        ? error.message
                        : `${file.name} couldn't be kept.`,
                    );
                  }
                }
                if (kept)
                  notify(
                    kept === 1 ? `${chosen[0]!.name} is on your shelf` : `${kept} files kept`,
                  );
                if (refused.length) notify(refused[0]!);
              });
            }}
          />

          {accountProblem && (shelf === "all" || shelf === "desktop") && (
            <p className="mt-5 flex flex-wrap items-center gap-2 rounded-md border border-warn/35 bg-warn/[0.07] px-3 py-2.5 text-[12.5px] text-fg-muted">
              Files from your desktop aren&apos;t loading: {accountProblem}
              <button
                type="button"
                onClick={refreshAccount}
                className="rounded-sm border border-line px-2 py-0.5 text-[11.5px] text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
              >
                Try again
              </button>
            </p>
          )}

          {nothing ? (
            <p className="mt-6 rounded-md border border-dashed border-line px-4 py-14 text-center text-[12.5px] leading-relaxed text-fg-subtle">
              {query
                ? `Nothing matches “${query}”.`
                : shelf === "piece"
                  ? "Nothing saved yet. In any project, open a block's menu and choose Save to kit — a rubric, a costing table, a cover slide."
                  : shelf === "desktop"
                    ? "Nothing from the desktop note yet. Anything you drop on it lands here."
                    : "Nothing here yet. Drop a file anywhere on this page."}
            </p>
          ) : (
            <ul className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
              {local.map((asset) => (
                <LocalCard
                  key={asset.id}
                  asset={asset}
                  onRename={rename}
                  inserting={inserting === asset.id}
                  onInsert={() =>
                    setInserting((id) => (id === asset.id ? null : asset.id))
                  }
                  onCloseInsert={() => setInserting(null)}
                />
              ))}
              {account.map((file) => (
                <DesktopCard
                  key={file.id}
                  file={file}
                  onGone={() =>
                    setFromAccount((all) =>
                      (all ?? []).filter((f) => f.id !== file.id),
                    )
                  }
                  onRenamed={(name) =>
                    setFromAccount((all) =>
                      (all ?? []).map((f) => (f.id === file.id ? { ...f, name } : f)),
                    )
                  }
                />
              ))}
            </ul>
          )}
        </div>
      </main>

      {dragging ? (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center border-2 border-dashed border-accent bg-canvas/70"
        >
          <p className="rounded-md border border-line bg-surface px-4 py-2.5 text-[13px] text-fg">
            Drop to keep it
          </p>
        </div>
      ) : null}
    </>
  );
}

/* ── Cards ──────────────────────────────────────────────── */

function LocalCard({
  asset,
  onRename,
  inserting,
  onInsert,
  onCloseInsert,
}: {
  asset: KitAsset;
  onRename: (id: string, name: string) => void;
  inserting: boolean;
  onInsert: () => void;
  onCloseInsert: () => void;
}) {
  const notify = useUI((s) => s.notify);
  const insertable = asset.kind === "file" || asset.kind === "image";

  return (
    <Card>
      {asset.kind === "piece" ? (
        <span className="grid aspect-[5/3] w-full place-items-center bg-canvas">
          <Icon
            name={asset.of === "slide" ? "slides" : "text"}
            size={22}
            className="text-fg-subtle"
          />
        </span>
      ) : (
        <Preview
          load={() => assetPreview(asset)}
          alt={asset.name}
          mime={asset.kind === "file" ? asset.mime : "image/*"}
          filename={asset.kind === "file" ? asset.filename : asset.name}
          font={asset.kind === "font" ? (asset as KitFont).family : undefined}
        />
      )}

      <div className="flex min-w-0 flex-col gap-0.5 border-t border-line px-2 py-1.5">
        <NameField
          value={asset.name}
          label={`Name of ${asset.name}`}
          onCommit={(next) => onRename(asset.id, next)}
        />
        <div className="flex items-center gap-1 px-1">
          <span className="min-w-0 flex-1">
            <Meta asset={asset} />
          </span>
          {insertable && (
            <CardAction icon="corner-down-left" label={`Put ${asset.name} in a document`} onClick={onInsert} />
          )}
          {asset.kind === "file" && (
            <CardAction
              icon="download"
              label={`Download ${asset.name}`}
              onClick={() =>
                void assetData(asset.id).then((data) => {
                  if (!data) {
                    notify("That file's data is missing from this browser.");
                    return;
                  }
                  const a = document.createElement("a");
                  a.href = data;
                  a.download = (asset as KitFile).filename;
                  a.click();
                })
              }
            />
          )}
          <CardAction
            icon="trash"
            danger
            label={`Remove ${asset.name}`}
            onClick={() => {
              void removeAsset(asset.id);
              notify(`${asset.name} removed — projects using it are untouched`);
            }}
          />
        </div>
      </div>

      {inserting && insertable && (
        <InsertMenu asset={asset as KitFile | KitImage} onClose={onCloseInsert} />
      )}
    </Card>
  );
}

/**
 * A file that lives in the account rather than in this browser.
 *
 * Its bytes are one round trip away, so it can be downloaded and previewed
 * but not yet inserted — that would mean pulling megabytes on a click with
 * nothing on screen to say why it is taking a moment. Downloading it and
 * dropping it back is the honest path until the convergence lands.
 */
function DesktopCard({
  file,
  onGone,
  onRenamed,
}: {
  file: AccountFile;
  onGone: () => void;
  onRenamed: (name: string) => void;
}) {
  const notify = useUI((s) => s.notify);
  const router = useRouter();
  const [opening, setOpening] = useState(false);

  // A document the note's assistant made. It is a file in the account like
  // any other until somebody opens it, at which point it becomes a project.
  if (isArtefact(file))
    return (
      <Card className="border-accent/40">
        <span className="grid aspect-[5/3] w-full place-items-center bg-accent-soft">
          <Icon name="sparkle" size={24} className="text-accent" />
        </span>
        <div className="flex min-w-0 flex-col gap-1 border-t border-line px-2 py-2">
          <p className="truncate text-[12.5px] text-fg">{artefactName(file)}</p>
          <p className="truncate font-mono text-[10px] text-fg-subtle">
            Made on your note · {formatBytes(file.size)}
          </p>
          <div className="mt-0.5 flex items-center gap-1">
            <button
              type="button"
              disabled={opening}
              onClick={() => {
                setOpening(true);
                adoptArtefact(file)
                  .then((id) => {
                    notify(`Opened “${artefactName(file)}”`);
                    router.push(`/p/${id}`);
                  })
                  .catch((error) => {
                    setOpening(false);
                    notify(error instanceof Error ? error.message : "Couldn't open it.");
                  });
              }}
              className="flex-1 rounded-sm bg-accent px-2 py-1 text-[11.5px] font-medium text-on-accent transition-[filter] duration-150 hover:brightness-110 disabled:opacity-60"
            >
              {opening ? "Opening…" : "Open as a document"}
            </button>
            <CardAction
              icon="trash"
              danger
              label={`Delete ${artefactName(file)}`}
              onClick={() =>
                void deleteAccountFile(file.id)
                  .then(onGone)
                  .catch(() => notify("Couldn't delete that."))
              }
            />
          </div>
        </div>
      </Card>
    );

  return (
    <Card className="border-dashed">
      <Preview
        load={() => accountThumb(file)}
        alt={file.name}
        mime={file.mime}
        filename={file.name}
      />
      <div className="flex min-w-0 flex-col gap-0.5 border-t border-line px-2 py-1.5">
        <NameField
          value={file.name}
          label={`Name of ${file.name}`}
          onCommit={(next) => {
            onRenamed(next);
            void renameAccountFile(file.id, next).catch(() =>
              notify("Couldn't rename that in your account."),
            );
          }}
        />
        <div className="flex items-center gap-1 px-1">
          <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-fg-subtle">
            Desktop · {formatBytes(file.size)}
          </span>
          <CardAction
            icon="download"
            label={`Download ${file.name}`}
            onClick={() =>
              void accountFileData(file)
                .then((data) => {
                  const a = document.createElement("a");
                  a.href = data;
                  a.download = file.name;
                  a.click();
                })
                .catch(() => notify("Couldn't fetch that file."))
            }
          />
          <CardAction
            icon="trash"
            danger
            label={`Delete ${file.name}`}
            onClick={() =>
              void deleteAccountFile(file.id)
                .then(onGone)
                .catch(() => notify("Couldn't delete that file."))
            }
          />
        </div>
      </div>
    </Card>
  );
}
