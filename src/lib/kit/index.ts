"use client";

/**
 * The kit: your own things, usable everywhere.
 *
 * Three kinds, one shelf.
 *
 *   • **Fonts** you brought — a school's typeface, a company's, one you like.
 *     Registered with the browser on load, then offered wherever a face is
 *     chosen: a document's typography, a deck's titles, a slide's text.
 *   • **Pictures** you keep reaching for — a logo, a letterhead, a diagram.
 *   • **Pieces** — any block you've already built, saved and droppable into
 *     any other project. A cover slide, a marking rubric, a costing table.
 *
 * Deliberately not called a Library: that word already means the list of your
 * projects, and having two of them would make every sentence in this app
 * ambiguous.
 *
 * The rule that shapes the model: an asset is *copied* when you use it, never
 * referenced. A piece dropped into a document is that document's now — editing
 * it doesn't reach back, and deleting it from the kit doesn't gut the essay you
 * handed in last term. Live references are the right answer for a table inside
 * one project (see ChartBlock) and the wrong answer across projects, where the
 * thing you want is a starting point.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Block, Slide } from "../types";
import { versioned } from "../persistence/versioned";
import { uid } from "../factories";
import { prepareImage } from "../images";
import { deleteBlob, getBlob, putBlob } from "./blobs";
import { makeThumb, thumbKey } from "./thumbs";

export type KitKind = "font" | "image" | "piece" | "file";

interface KitBase {
  id: string;
  kind: KitKind;
  name: string;
  createdAt: number;
  /** Roughly what it costs, for the shelf's own honesty about size. */
  bytes: number;
}

export interface KitFont extends KitBase {
  kind: "font";
  /** The family name this is registered under. Unique across the kit. */
  family: string;
  /** woff2 / woff / truetype / opentype — what `FontFace` is told. */
  format: string;
}

export interface KitImage extends KitBase {
  kind: "image";
  width: number;
  height: number;
  /** Whether `${id}:thumb` was written. Absent on anything stored before
   *  thumbnails existed, and on anything that could not be rasterised. */
  thumb?: boolean;
}

/**
 * A saved block, or a saved slide. Held inline rather than in IndexedDB: a
 * piece is JSON in the kilobytes, and keeping it in the ordinary store means
 * it survives in the backup file with everything else.
 */
export interface KitPiece extends KitBase {
  kind: "piece";
  of: "block" | "slide";
  payload: Block | Slide;
}

/**
 * Any other file somebody dropped — a PDF, a .docx from a teacher, a zip of
 * sources. The kit keeps it and hands it back; it does not pretend to
 * understand it. What makes this worth having is the drop: the kit is where
 * files land, whatever they are, rather than "sorry, only fonts and images".
 */
export interface KitFile extends KitBase {
  kind: "file";
  /** The mime type as the browser reported it; empty when it had no idea. */
  mime: string;
  /** The original filename with its extension, for downloading back out. */
  filename: string;
  /** See `KitImage.thumb`. A PDF or a zip never has one. */
  thumb?: boolean;
}

export type KitAsset = KitFont | KitImage | KitPiece | KitFile;

interface KitState {
  assets: KitAsset[];
  add: (asset: KitAsset) => void;
  rename: (id: string, name: string) => void;
  remove: (id: string) => void;
}

export const useKit = create<KitState>()(
  persist(
    (set) => ({
      assets: [],
      add: (asset) => set((s) => ({ assets: [asset, ...s.assets] })),
      rename: (id, name) =>
        set((s) => ({
          assets: s.assets.map((a) => {
            if (a.id !== id) return a;
            // An empty name is not a rename, it is a field somebody cleared
            // before typing. Keeping the old one matches `addPiece`, which
            // has always refused to store a blank.
            const next = name.trim();
            if (!next) return a;
            // A file's download name follows its label. Without this a file
            // renamed to "Rubric" still comes back down as "Scan_0042.pdf",
            // which is the one place the rename was supposed to matter.
            if (a.kind === "file") {
              const extension = a.filename.includes(".")
                ? a.filename.slice(a.filename.lastIndexOf("."))
                : "";
              return { ...a, name: next, filename: `${next}${extension}` };
            }
            return { ...a, name: next };
          }),
        })),
      remove: (id) =>
        set((s) => ({ assets: s.assets.filter((a) => a.id !== id) })),
    }),
    {
      ...versioned<KitState>("assignments:kit:v1", []),
      partialize: (s) => ({ assets: s.assets }),
      skipHydration: true,
    },
  ),
);

export function hydrateKit() {
  void useKit.persist.rehydrate();
}

/* ── Adding things ──────────────────────────────────────── */

export class KitError extends Error {}

const FORMATS: Record<string, string> = {
  woff2: "woff2",
  woff: "woff",
  ttf: "truetype",
  otf: "opentype",
};

/**
 * A font file becomes a family you can pick.
 *
 * The family name is derived from the file name rather than read out of the
 * font's own tables. Parsing a `name` table is a real amount of binary
 * fiddling for a string the person can simply be shown and allowed to correct
 * — so it is a guess, presented as an editable name, not as a fact.
 */
export async function addFont(file: File): Promise<KitFont> {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const format = FORMATS[extension];
  if (!format)
    throw new KitError(
      "That isn't a font this browser can load — use .woff2, .woff, .ttf or .otf.",
    );

  const dataUrl = await readDataUrl(file);
  const label = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();
  // Namespaced so a kit font can never be confused with a system family, and
  // so two files called "Regular" don't collide.
  const family = `kit-${uid()}`;

  // Loaded before it is stored: a file the browser refuses is not an asset,
  // and finding that out later would leave a dead entry on the shelf.
  await registerFont(family, dataUrl, format);

  const asset: KitFont = {
    id: uid(),
    kind: "font",
    name: label || "Font",
    family,
    format,
    createdAt: Date.now(),
    bytes: dataUrl.length,
  };
  await putBlob(asset.id, dataUrl);
  useKit.getState().add(asset);
  return asset;
}

export async function addImage(image: {
  src: string;
  width: number;
  height: number;
  name: string;
  bytes: number;
}): Promise<KitImage> {
  const id = uid();
  const mime = mimeOfDataUrl(image.src);
  const thumb = await makeThumb(image.src, mime);
  const asset: KitImage = {
    id,
    kind: "image",
    name: image.name.replace(/\.[a-z0-9]+$/i, "") || "Picture",
    width: image.width,
    height: image.height,
    createdAt: Date.now(),
    bytes: image.bytes,
    ...(thumb ? { thumb: true } : {}),
  };
  await putBlob(asset.id, image.src);
  if (thumb) await putBlob(thumbKey(asset.id), thumb).catch(() => {});
  useKit.getState().add(asset);
  return asset;
}

/**
 * What a data URL says it is.
 *
 * Only used to decide whether a thumbnail is worth attempting, so a wrong
 * answer costs one skipped thumbnail rather than a wrong file.
 */
function mimeOfDataUrl(dataUrl: string): string {
  const match = /^data:([^;,]+)/.exec(dataUrl);
  return match ? match[1] : "";
}

/** Keep any file, as it came. */
export async function addFile(file: File): Promise<KitFile> {
  refuseUnstorable(file);
  const src = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Couldn't read ${file.name}.`));
    reader.readAsDataURL(file);
  });
  const id = uid();
  // An image arriving through this path rather than `addImage` — a HEIC the
  // browser cannot decode, say — still gets a thumbnail if it can.
  const thumb = await makeThumb(src, file.type);
  const asset: KitFile = {
    id,
    kind: "file",
    name: file.name.replace(/\.[a-z0-9]+$/i, "") || "File",
    filename: file.name,
    mime: file.type,
    createdAt: Date.now(),
    bytes: file.size,
    ...(thumb ? { thumb: true } : {}),
  };
  await putBlob(asset.id, src);
  if (thumb) await putBlob(thumbKey(asset.id), thumb).catch(() => {});
  useKit.getState().add(asset);
  return asset;
}

/**
 * The two files the shelf must not accept.
 *
 * The ceiling matches the desktop's exactly (`store/files.rs`), and for the
 * same reason it is enforced at the door rather than at the write: the
 * person is standing there having just dropped something, which is the only
 * moment "that one is too big" is useful information. Postgres refuses over
 * 12M base64 characters, so a file that cannot be stored here could not have
 * reached the account either.
 *
 * Empty is refused for a different reason: `kit_files.size` carries a
 * `> 0` check, so a zero-byte file kept here would fail on push with a
 * constraint message nobody can act on.
 */
export const MAX_FILE_BYTES = 8 * 1024 * 1024;

function refuseUnstorable(file: File): void {
  if (file.size === 0)
    throw new KitError(`${file.name} is empty, so there is nothing to keep.`);
  if (file.size > MAX_FILE_BYTES)
    throw new KitError(
      `${file.name} is ${formatBytes(file.size)}. The shelf holds files up to ${formatBytes(
        MAX_FILE_BYTES,
      )} — bigger than that belongs somewhere built for it.`,
    );
}

/**
 * Route a dropped file to the right shelf.
 *
 * Fonts become fonts and pictures become pictures, because the specific kinds
 * can do more — a font is registered with the browser, a picture knows its
 * size. Everything else is kept as it came. Nothing is refused: a drop that
 * bounces some of its files is a drop somebody has to re-sort by hand, which
 * is the chore this exists to remove.
 */
export async function addDropped(file: File): Promise<KitAsset> {
  if (/\.(woff2?|ttf|otf)$/i.test(file.name)) return addFont(file);
  if (file.type.startsWith("image/")) {
    refuseUnstorable(file);
    // Through `prepareImage`, like every other way a picture gets in. This
    // path used to read the raw data URL and keep it whole, so a photo
    // dropped straight from a phone was stored at full resolution while the
    // same photo added with the button was scaled down — the shelf's size
    // depended on which gesture you happened to use.
    const prepared = await prepareImage(file);
    return addImage({
      src: prepared.src,
      name: file.name,
      bytes: prepared.bytes,
      width: prepared.width,
      height: prepared.height,
    });
  }
  return addFile(file);
}

export function addPiece(
  of: "block" | "slide",
  payload: Block | Slide,
  name: string,
): KitPiece {
  const asset: KitPiece = {
    id: uid(),
    kind: "piece",
    of,
    // Deep-copied on the way in as well as on the way out. Saving a piece must
    // not leave the kit holding a reference into a live document, where an
    // ordinary edit would silently rewrite what you saved.
    payload: structuredClone(payload),
    name: name.trim() || "Piece",
    createdAt: Date.now(),
    bytes: JSON.stringify(payload).length,
  };
  useKit.getState().add(asset);
  return asset;
}

export async function removeAsset(id: string) {
  const asset = useKit.getState().assets.find((a) => a.id === id);
  useKit.getState().remove(id);
  if (asset && asset.kind !== "piece") {
    await deleteBlob(id).catch(() => {});
    // The thumbnail is a second row under a second key, so deleting the
    // asset alone would leave it in IndexedDB with nothing pointing at it,
    // forever.
    await deleteBlob(thumbKey(id)).catch(() => {});
  }
}

/** The stored bytes for a font or a picture. */
export function assetData(id: string): Promise<string | null> {
  return getBlob(id);
}

/**
 * The small copy if there is one, the whole thing if there is not.
 *
 * Never assumes: a workspace restored from a backup taken before thumbnails
 * existed has assets whose `thumb` flag is absent *and* assets whose flag is
 * set but whose thumbnail row did not survive the restore, since
 * `replaceBlobs` clears the store wholesale.
 */
export async function assetPreview(asset: KitAsset): Promise<string | null> {
  if (asset.kind === "piece") return null;
  if (asset.kind === "image" || asset.kind === "file") {
    const small = await getBlob(thumbKey(asset.id)).catch(() => null);
    if (small) return small;
    // A file with no thumbnail is a PDF or a zip — there is nothing to show
    // and pulling megabytes to discover that would be the bug this avoids.
    if (asset.kind === "file" && !asset.thumb) return null;
  }
  return getBlob(asset.id).catch(() => null);
}

function readDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new KitError("That file couldn't be read."));
    reader.readAsDataURL(file);
  });
}

/* ── Making fonts real ──────────────────────────────────── */

const registered = new Set<string>();

async function registerFont(family: string, dataUrl: string, format: string) {
  if (typeof document === "undefined" || registered.has(family)) return;
  try {
    const face = new FontFace(family, `url(${dataUrl}) format("${format}")`);
    await face.load();
    document.fonts.add(face);
    registered.add(family);
  } catch {
    throw new KitError("This browser couldn't load that font file.");
  }
}

/**
 * Put every kit font back in front of the browser.
 *
 * `FontFace` registrations do not survive a reload, so without this a document
 * set in a kit font would render in the fallback after every refresh — which
 * reads as the font having been lost.
 */
export async function loadKitFonts(): Promise<void> {
  const fonts = useKit.getState().assets.filter((a): a is KitFont => a.kind === "font");
  await Promise.all(
    fonts.map(async (font) => {
      if (registered.has(font.family)) return;
      const data = await assetData(font.id).catch(() => null);
      if (!data) return;
      await registerFont(font.family, data, font.format).catch(() => {
        // A font the browser now refuses shouldn't stop the others loading,
        // and it stays on the shelf so it can be seen and removed.
      });
    }),
  );
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
