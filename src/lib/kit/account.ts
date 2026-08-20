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
}
