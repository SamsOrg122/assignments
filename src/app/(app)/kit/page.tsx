"use client";

/**
 * The kit: fonts, pictures and saved pieces, usable in every project.
 *
 * Deliberately not called a Library — that word already means the list of your
 * projects here, and two of them would make every sentence ambiguous.
 */

import { useEffect, useRef, useState } from "react";
import { TopBar } from "@/components/shell/TopBar";
import {
  KitError,
  addDropped,
  addFont,
  addImage,
  assetData,
  formatBytes,
  removeAsset,
  useKit,
  type KitAsset,
  type KitFile,
  type KitFont,
} from "@/lib/kit";
import { pickImage } from "@/lib/images";
import {
  accountFileData,
  deleteAccountFile,
  listAccountFiles,
  type AccountFile,
} from "@/lib/kit/account";
import { useUI } from "@/lib/ui-store";
import { BLOCK_META } from "@/components/shell/CommandPalette";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";

export default function KitPage() {
  const assets = useKit((s) => s.assets);
  const rename = useKit((s) => s.rename);
  const notify = useUI((s) => s.notify);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [fromAccount, setFromAccount] = useState<AccountFile[]>([]);
  const fontRef = useRef<HTMLInputElement>(null);
  const anyRef = useRef<HTMLInputElement>(null);
  const guardRef = useRef<(work: () => Promise<unknown>) => Promise<void>>(
    async () => {},
  );
  const notifyRef = useRef<(message: string) => void>(() => {});

  const fonts = assets.filter((a) => a.kind === "font");
  const images = assets.filter((a) => a.kind === "image");
  const pieces = assets.filter((a) => a.kind === "piece");
  const files = assets.filter((a) => a.kind === "file");
  const total = assets.reduce((n, a) => n + a.bytes, 0);

  useEffect(() => {
    // Quiet when it fails: most deployments without the migration, and every
    // signed-out browser, simply have no account shelf — an alarm about that
    // would be noise on a page that works fine without it.
    let alive = true;
    listAccountFiles()
      .then((files) => alive && setFromAccount(files))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  /*
   * The drop. Listens on the window rather than on a target somebody has to
   * find: the promise is "drop it anywhere on this page and it is kept", and
   * a promise with a bullseye attached is a smaller promise. Fonts become
   * fonts, pictures become pictures, everything else is kept as it came —
   * nothing bounces, because a drop that rejects half its files is a chore
   * handed back.
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
        for (const file of dropped) await addDropped(file);
        notifyRef.current(
          dropped.length === 1
            ? `${dropped[0]!.name} added to your kit`
            : `${dropped.length} files added to your kit`,
        );
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

  return (
    <>
      <TopBar>
        <Icon name="board" size={13} className="shrink-0 text-fg-subtle" />
        <span className="text-[13px] font-medium text-fg">Kit</span>
        {total > 0 && (
          <span className="ml-auto font-mono text-[10.5px] text-fg-subtle">
            {formatBytes(total)}
          </span>
        )}
      </TopBar>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[860px] px-5 py-8 sm:px-8">
          <h1 className="display text-[22px] text-fg">Your kit</h1>
          <p className="mt-1.5 max-w-[62ch] text-[13px] leading-relaxed text-fg-muted">
            Things you bring once and use everywhere — a typeface, a logo, a
            table you rebuild every term. Anything here can be dropped into a
            document, a deck or a board.
          </p>
          {/*
            The rule worth stating up front, because it decides whether people
            trust the shelf: using something copies it. Nothing you insert
            stays wired to this page.
          */}
          <p className="mt-2 max-w-[62ch] text-[12px] leading-relaxed text-fg-subtle">
            Using a piece copies it into the project. Editing it there
            doesn&apos;t change what&apos;s here, and clearing this shelf never
            touches work you&apos;ve already handed in.{" "}
            <strong className="font-medium text-fg-muted">
              Drop any file anywhere on this page
            </strong>{" "}
            — fonts and pictures are sorted onto their shelves, everything else
            is kept below.
          </p>

          <Section
            title="Fonts"
            hint="Loaded into the browser and offered wherever a face is chosen."
            action={
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => fontRef.current?.click()}
                  className="flex items-center gap-1.5 rounded-sm border border-line px-2.5 py-1.5 text-[12px] text-fg-muted transition-colors hover:border-line-strong hover:text-fg disabled:opacity-40"
                >
                  <Icon name="plus" size={11} />
                  Add a font
                </button>
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
              </>
            }
          >
            {fonts.length === 0 ? (
              <Empty>
                No fonts yet. A `.woff2` is the one to look for — the same file
                a website would use, and a tenth the size of a `.ttf`.
              </Empty>
            ) : (
              <ul className="space-y-1.5">
                {fonts.map((font) => (
                  <li
                    key={font.id}
                    className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-surface px-3 py-2.5"
                  >
                    <span
                      className="min-w-0 flex-1 truncate text-[20px] text-fg"
                      style={{ fontFamily: `"${(font as KitFont).family}"` }}
                    >
                      {font.name}
                    </span>
                    <NameField asset={font} onRename={rename} />
                    <Meta asset={font} />
                    <Remove asset={font} />
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section
            title="Pictures"
            hint="Downscaled on the way in, like every other picture here."
            action={
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void guard(async () => {
                    const image = await pickImage();
                    if (!image) return;
                    await addImage(image);
                    notify(`${image.name} added to your kit`);
                  })
                }
                className="flex items-center gap-1.5 rounded-sm border border-line px-2.5 py-1.5 text-[12px] text-fg-muted transition-colors hover:border-line-strong hover:text-fg disabled:opacity-40"
              >
                <Icon name="plus" size={11} />
                Add a picture
              </button>
            }
          >
            {images.length === 0 ? (
              <Empty>
                Nothing yet. A logo or a letterhead is what this is for — the
                picture you would otherwise go looking for every time.
              </Empty>
            ) : (
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {images.map((asset) => (
                  <li
                    key={asset.id}
                    className="overflow-hidden rounded-md border border-line bg-surface"
                  >
                    <Thumbnail id={asset.id} alt={asset.name} />
                    <div className="flex items-center gap-2 px-2 py-1.5">
                      <NameField asset={asset} onRename={rename} grow />
                      <Remove asset={asset} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section
            title="Files"
            hint="Anything you dropped, kept as it came — a PDF, a brief, a zip."
            action={
              <>
                <input
                  ref={anyRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const chosen = Array.from(e.target.files ?? []);
                    e.target.value = "";
                    if (chosen.length === 0) return;
                    void guard(async () => {
                      for (const file of chosen) await addDropped(file);
                      notify(
                        chosen.length === 1
                          ? `${chosen[0]!.name} added to your kit`
                          : `${chosen.length} files added to your kit`,
                      );
                    });
                  }}
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => anyRef.current?.click()}
                  className="flex items-center gap-1.5 rounded-sm border border-line px-2.5 py-1.5 text-[12px] text-fg-muted transition-colors hover:border-line-strong hover:text-fg disabled:opacity-40"
                >
                  <Icon name="plus" size={11} />
                  Add files
                </button>
              </>
            }
          >
            {files.length === 0 ? (
              <Empty>
                Nothing yet. Drag anything onto this page — it lands here and
                stays until you take it out again.
              </Empty>
            ) : (
              <ul className="space-y-1.5">
                {files.map((asset) => (
                  <li
                    key={asset.id}
                    className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-surface px-3 py-2.5"
                  >
                    <Icon name="file" size={13} className="shrink-0 text-fg-subtle" />
                    <NameField asset={asset} onRename={rename} grow />
                    <Meta asset={asset} />
                    <Download file={asset as KitFile} />
                    <Remove asset={asset} />
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {fromAccount.length > 0 ? (
            <Section
              title="From your desktop"
              hint="Dropped on the floating note, kept in your account, here on every machine."
            >
              <ul className="space-y-1.5">
                {fromAccount.map((file) => (
                  <li
                    key={file.id}
                    className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-surface px-3 py-2.5"
                  >
                    <Icon name="download" size={13} className="shrink-0 text-fg-subtle" />
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-fg">
                      {file.name}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] text-fg-subtle">
                      {formatBytes(file.size)}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        void accountFileData(file).then((data) => {
                          const a = document.createElement("a");
                          a.href = data;
                          a.download = file.name;
                          a.click();
                        }).catch(() => notify("Couldn't fetch that file."))
                      }
                      className="shrink-0 rounded-xs p-1 text-fg-subtle transition-colors hover:text-fg"
                      aria-label={`Download ${file.name}`}
                    >
                      <Icon name="download" size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void deleteAccountFile(file.id)
                          .then(() =>
                            setFromAccount((all) => all.filter((f) => f.id !== file.id)),
                          )
                          .catch(() => notify("Couldn't delete that file."))
                      }
                      className="shrink-0 rounded-xs p-1 text-fg-subtle transition-colors hover:text-danger"
                      aria-label={`Delete ${file.name}`}
                    >
                      <Icon name="trash" size={12} />
                    </button>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          <Section
            title="Pieces"
            hint="Saved from a project. Insert one from the / menu or ⌘K."
          >
            {pieces.length === 0 ? (
              <Empty>
                Nothing saved yet. In any project, open a block&apos;s menu and
                choose <em>Save to kit</em> — a rubric, a costing table, a cover
                slide.
              </Empty>
            ) : (
              <ul className="space-y-1.5">
                {pieces.map((asset) => (
                  <li
                    key={asset.id}
                    className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-surface px-3 py-2.5"
                  >
                    <Icon
                      name={
                        asset.kind === "piece" && asset.of === "slide"
                          ? "slides"
                          : BLOCK_META[
                              (asset.kind === "piece" &&
                              "type" in asset.payload
                                ? asset.payload.type
                                : "text") as keyof typeof BLOCK_META
                            ].icon
                      }
                      size={13}
                      className="shrink-0 text-fg-subtle"
                    />
                    <NameField asset={asset} onRename={rename} grow />
                    <Meta asset={asset} />
                    <Remove asset={asset} />
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </main>

      {dragging ? (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center border-2 border-dashed border-accent bg-canvas/70"
        >
          <p className="rounded-md border border-line bg-surface px-4 py-2.5 text-[13px] text-fg">
            Drop to add to your kit
          </p>
        </div>
      ) : null}
    </>
  );
}

/* ── Pieces of the page ─────────────────────────────────── */

function Section({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <div className="mb-2.5 flex flex-wrap items-end gap-x-3 gap-y-1.5">
        <h2 className="text-[14px] font-medium text-fg">{title}</h2>
        <p className="min-w-0 flex-1 text-[12px] text-fg-subtle">{hint}</p>
        {action}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-dashed border-line px-4 py-6 text-center text-[12.5px] leading-relaxed text-fg-subtle">
      {children}
    </p>
  );
}

function NameField({
  asset,
  onRename,
  grow = false,
}: {
  asset: KitAsset;
  onRename: (id: string, name: string) => void;
  grow?: boolean;
}) {
  return (
    <input
      value={asset.name}
      onChange={(e) => onRename(asset.id, e.target.value)}
      aria-label={`Name of ${asset.name}`}
      className={cn(
        "min-w-0 rounded-xs bg-transparent px-1 py-0.5 text-[12.5px] text-fg-muted outline-none transition-colors hover:bg-surface-2 focus:bg-surface-2 focus:text-fg",
        grow ? "flex-1" : "w-[16ch]",
      )}
    />
  );
}

function Meta({ asset }: { asset: KitAsset }) {
  return (
    <span className="shrink-0 font-mono text-[10px] text-fg-subtle">
      {formatBytes(asset.bytes)}
    </span>
  );
}

/**
 * Hand the file back, exactly as it went in.
 *
 * The bytes sit in IndexedDB as a data URL; a temporary anchor with the
 * original filename is the whole mechanism. A shelf you can put things on but
 * not take things off is a trap, not a shelf.
 */
function Download({ file }: { file: KitFile }) {
  const notify = useUI((s) => s.notify);
  return (
    <button
      type="button"
      onClick={() =>
        void assetData(file.id).then((data) => {
          if (!data) {
            notify("That file's data is missing from this browser.");
            return;
          }
          const a = document.createElement("a");
          a.href = data;
          a.download = file.filename;
          a.click();
        })
      }
      aria-label={`Download ${file.name}`}
      className="shrink-0 rounded-xs p-1 text-fg-subtle transition-colors hover:text-fg"
    >
      <Icon name="download" size={12} />
    </button>
  );
}

function Remove({ asset }: { asset: KitAsset }) {
  const notify = useUI((s) => s.notify);
  return (
    <button
      type="button"
      onClick={() => {
        void removeAsset(asset.id);
        notify(`${asset.name} removed — projects using it are untouched`);
      }}
      aria-label={`Remove ${asset.name}`}
      className="shrink-0 rounded-xs p-1 text-fg-subtle transition-colors hover:text-danger"
    >
      <Icon name="trash" size={12} />
    </button>
  );
}

/**
 * A picture's bytes live in IndexedDB, so they arrive after a round trip. Read
 * through an effect rather than during render — it is an external system, and
 * the server has none of this.
 */
function Thumbnail({ id, alt }: { id: string; alt: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    assetData(id).then(
      (data) => live && setSrc(data),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [id]);

  return (
    <span className="block aspect-[4/3] w-full bg-canvas">
      {src && (
        /* eslint-disable-next-line @next/next/no-img-element -- a data URL
           out of the browser's own store; there is nothing to fetch. */
        <img src={src} alt={alt} className="size-full object-contain" />
      )}
    </span>
  );
}
