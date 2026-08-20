"use client";

/**
 * The commons: reading and writing what people share with everyone.
 *
 * Thin on purpose. Posts are not local-first the way documents are — a
 * commons only exists where the account database does, so this module talks
 * to Supabase directly and reports plainly when there is nothing to talk
 * to. The page decides what a deployment without a database sees (the
 * built-in gallery), not this file.
 *
 * Everything that arrives is a stranger's data. Titles and bodies render as
 * text (React does that); payloads are *never* trusted here — a design is
 * re-sanitized by `lib/looks` and a template goes through the same
 * validator a share link does, at the moment of use.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { versioned } from "../persistence/versioned";
import { supabase } from "../db/client";
import { uid } from "../factories";
import type { ProjectLook } from "../looks";

export type PostKind = "idea" | "design" | "template";

export interface CommunityPost {
  id: string;
  kind: PostKind;
  title: string;
  body: string;
  authorName: string;
  /** Whether this account wrote it — retiring is offered only then. */
  mine: boolean;
  hearts: number;
  hearted: boolean;
  /** Untrusted. Shape depends on kind; sanitized at the moment of use. */
  payload: unknown;
  createdAt: number;
}

/** The name posts are signed with, remembered per browser. */
interface Signature {
  name: string;
  setName: (name: string) => void;
}

export const useSignature = create<Signature>()(
  persist(
    (set) => ({
      name: "",
      setName: (name) => set({ name: name.slice(0, 60) }),
    }),
    {
      ...versioned<Signature>("assignments:signature:v1", []),
      skipHydration: true,
    },
  ),
);

export function hydrateSignature() {
  void useSignature.persist.rehydrate();
}

const missing = () =>
  new Error("The community needs the account database, and this deployment has none.");

/** The session's user id, so `mine` and `hearted` mean this account. */
async function whoAmI(): Promise<string | null> {
  const client = supabase();
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data.session?.user?.id ?? null;
}

export async function listPosts(): Promise<CommunityPost[]> {
  const client = supabase();
  if (!client) throw missing();
  const me = await whoAmI();

  const [posts, hearts] = await Promise.all([
    client
      .from("community_posts")
      .select("id,kind,title,body,author_id,author_name,payload,created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(200),
    client.from("community_hearts").select("post_id,user_id"),
  ]);
  if (posts.error) throw new Error(posts.error.message);
  // Hearts failing alone should not empty the page — counts just read zero.
  const heartRows = hearts.error ? [] : (hearts.data ?? []);

  const byPost = new Map<string, { count: number; mine: boolean }>();
  for (const row of heartRows) {
    const id = String(row.post_id);
    const entry = byPost.get(id) ?? { count: 0, mine: false };
    entry.count += 1;
    if (me && String(row.user_id) === me) entry.mine = true;
    byPost.set(id, entry);
  }

  return (posts.data ?? []).map((row) => ({
    id: String(row.id),
    kind: (["idea", "design", "template"].includes(String(row.kind))
      ? String(row.kind)
      : "idea") as PostKind,
    title: String(row.title ?? ""),
    body: String(row.body ?? ""),
    authorName: String(row.author_name ?? ""),
    mine: Boolean(me && String(row.author_id) === me),
    hearts: byPost.get(String(row.id))?.count ?? 0,
    hearted: byPost.get(String(row.id))?.mine ?? false,
    payload: row.payload,
    createdAt: Date.parse(String(row.created_at)) || 0,
  }));
}

export async function publishPost(input: {
  kind: PostKind;
  title: string;
  body: string;
  payload: unknown;
}): Promise<void> {
  const client = supabase();
  if (!client) throw missing();
  const me = await whoAmI();
  if (!me) throw new Error("No session to post as. Open the app once so it signs in, then retry.");
  const { error } = await client.from("community_posts").insert({
    id: uid(),
    author_id: me,
    author_name: useSignature.getState().name || "Someone",
    kind: input.kind,
    title: input.title.trim().slice(0, 120) || "Untitled",
    body: input.body.trim().slice(0, 4000),
    payload: input.payload ?? {},
  });
  if (error) throw new Error(error.message);
}

/** Tombstone your own post. The policy refuses anybody else's. */
export async function retirePost(id: string): Promise<void> {
  const client = supabase();
  if (!client) throw missing();
  const { error } = await client
    .from("community_posts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function toggleHeart(post: CommunityPost): Promise<void> {
  const client = supabase();
  if (!client) throw missing();
  const me = await whoAmI();
  if (!me) throw new Error("No session yet — open the app once so it signs in.");
  if (post.hearted) {
    const { error } = await client
      .from("community_hearts")
      .delete()
      .eq("post_id", post.id)
      .eq("user_id", me);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await client
      .from("community_hearts")
      .insert({ post_id: post.id, user_id: me });
    if (error) throw new Error(error.message);
  }
}

/** The design a post carries, or null when its payload holds none. */
export function designOf(post: CommunityPost): ProjectLook | null {
  if (post.kind !== "design") return null;
  const raw = post.payload as { backdrop?: unknown; accent?: unknown } | null;
  if (!raw || typeof raw !== "object" || typeof raw.backdrop !== "string") return null;
  return {
    backdrop: raw.backdrop,
    ...(typeof raw.accent === "string" ? { accent: raw.accent } : {}),
  };
}
