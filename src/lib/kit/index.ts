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
import { deleteBlob, getBlob, putBlob } from "./blobs";

export type KitKind = "font" | "image" | "piece";

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

export type KitAsset = KitFont | KitImage | KitPiece;

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
          assets: s.assets.map((a) => (a.id === id ? { ...a, name } : a)),
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
  const asset: KitImage = {
    id: uid(),
    kind: "image",
    name: image.name.replace(/\.[a-z0-9]+$/i, "") || "Picture",
    width: image.width,
    height: image.height,
    createdAt: Date.now(),
    bytes: image.bytes,
  };
  await putBlob(asset.id, image.src);
  useKit.getState().add(asset);
  return asset;
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
  if (asset && asset.kind !== "piece") await deleteBlob(id).catch(() => {});
}

/** The stored bytes for a font or a picture. */
export function assetData(id: string): Promise<string | null> {
  return getBlob(id);
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
