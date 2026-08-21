"use client";

/**
 * Files the desktop note dropped into the account.
 *
 * Read-mostly from the browser: the desktop app is where drops happen, this
 * is where they are found again. The listing deliberately does not fetch the
 * bytes — a shelf of ten 8 MB files must not cost 80 MB to look at — so the
 * content comes down only when somebody actually downloads one.
 */

import { supabase } from "../db/client";
import { getBlob, putBlob, deleteBlob } from "./blobs";
import { makeThumb } from "./thumbs";

export interface AccountFile {
  id: string;
  name: string;
  mime: string;
  size: number;
  updatedAt: number;
}

export async function listAccountFiles(): Promise<AccountFile[]> {
  const client = supabase();
  if (!client) return [];
  const { data, error } = await client
    .from("kit_files")
    .select("id,name,mime,size,updated_at")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    mime: String(row.mime ?? ""),
    size: Number(row.size) || 0,
    updatedAt: Date.parse(String(row.updated_at)) || 0,
  }));
}

/** The bytes, as a data URL ready for an anchor. */
export async function accountFileData(file: AccountFile): Promise<string> {
  const client = supabase();
  if (!client) throw new Error("Supabase isn't configured.");
  const { data, error } = await client
    .from("kit_files")
    .select("content_b64")
    .eq("id", file.id)
    .single();
  if (error) throw new Error(error.message);
  const mime = file.mime || "application/octet-stream";
  return `data:${mime};base64,${String(data.content_b64)}`;
}

/**
 * Rename one. The desktop app reads the name back on its next round, so
 * this is the same field it wrote — there is no second copy to disagree.
 */
export async function renameAccountFile(id: string, name: string): Promise<void> {
  const client = supabase();
  if (!client) throw new Error("Supabase isn't configured.");
  const next = name.trim();
  if (!next) return;
  const { error } = await client
    .from("kit_files")
    .update({ name: next, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * A small picture of an account file, made once and kept here.
 *
 * The listing deliberately carries no bytes, so the only way to show a
 * dropped photograph is to fetch it — and doing that on every visit would
 * undo the reason the listing is thin. So the first look pays for the
 * download, a 256px copy goes into the same IndexedDB the local shelf uses,
 * and every look after that is free.
 *
 * Bounded on purpose: an eight-megabyte image is not worth pulling to draw
 * a ninety-six-pixel square, and anything that is not a picture has nothing
 * to draw at all. Both cases return null and the card shows its mime icon,
 * which is a complete answer rather than a placeholder.
 */
const THUMB_CEILING = 4 * 1024 * 1024;

export const accountThumbKey = (id: string): string => `acct:${id}:thumb`;

export async function accountThumb(file: AccountFile): Promise<string | null> {
  const key = accountThumbKey(file.id);
  const kept = await getBlob(key).catch(() => null);
  if (kept) return kept;

  if (!file.mime.startsWith("image/")) return null;
  if (file.size > THUMB_CEILING) return null;

  const data = await accountFileData(file).catch(() => null);
  if (!data) return null;
  const thumb = await makeThumb(data, file.mime);
  if (!thumb) return null;
  await putBlob(key, thumb).catch(() => {});
  return thumb;
}

/** A tombstone, so the desktop app never resurrects it. */
export async function deleteAccountFile(id: string): Promise<void> {
  const client = supabase();
  if (!client) throw new Error("Supabase isn't configured.");
  const now = new Date().toISOString();
  const { error } = await client
    .from("kit_files")
    .update({ deleted_at: now, updated_at: now })
    .eq("id", id);
  if (error) throw new Error(error.message);
  // The cached thumbnail is this browser's, so the tombstone up there does
  // not reach it. Left behind it would be an orphan nothing can ever point
  // at again.
  await deleteBlob(accountThumbKey(id)).catch(() => {});
}
