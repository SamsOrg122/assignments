"use client";

/**
 * Finding something on the shelf.
 *
 * The same fuzzy matcher ⌘K and the slash menu use, so typing "logo" ranks
 * identically wherever you happen to be typing it. A shelf you have to scan
 * with your eyes is a shelf that stops working at about thirty things, and
 * a drop-anything library passes thirty quickly.
 *
 * Matched against more than the name: a file's original filename and its
 * kind both matter, because "pdf" and "Scan_0042" are exactly what somebody
 * remembers about a file they never named.
 */

import { fuzzyMatch } from "../fuzzy";
import { labelFor } from "./mime";
import type { KitAsset } from ".";

/** Everything worth matching a query against, as one string. */
export function haystack(asset: KitAsset): string {
  const parts = [asset.name, asset.kind];
  if (asset.kind === "file") {
    parts.push(asset.filename, asset.mime, labelFor(asset.mime, asset.filename));
  }
  if (asset.kind === "font") parts.push(asset.format, "typeface", "family");
  if (asset.kind === "image") parts.push("picture", "photo");
  if (asset.kind === "piece") parts.push(asset.of, "block", "saved");
  return parts.filter(Boolean).join(" ");
}

export interface Ranked<T> {
  item: T;
  score: number;
}

/**
 * Rank by best match, name first.
 *
 * The name is scored on its own as well as inside the haystack, because a
 * match on the thing somebody actually typed in should always beat a match
 * on a mime type they have never seen.
 */
export function rank<T>(
  items: T[],
  query: string,
  text: (item: T) => { name: string; all: string },
): Ranked<T>[] {
  const q = query.trim();
  if (!q) return items.map((item) => ({ item, score: 0 }));

  const out: Ranked<T>[] = [];
  for (const item of items) {
    const { name, all } = text(item);
    const onName = fuzzyMatch(q, name);
    const onAll = onName ? null : fuzzyMatch(q, all);
    const hit = onName ?? onAll;
    if (!hit) continue;
    out.push({ item, score: hit.score + (onName ? 1000 : 0) });
  }
  return out.sort((a, b) => b.score - a.score);
}

export const searchKit = (assets: KitAsset[], query: string): Ranked<KitAsset>[] =>
  rank(assets, query, (a) => ({ name: a.name, all: haystack(a) }));
