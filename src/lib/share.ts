"use client";

/**
 * A view link: one URL that shows someone a project, read-only.
 *
 * There is no server yet, so the honest way to make a link work is to put the
 * document *in* the link. The payload lives in the fragment — everything after
 * `#` — which browsers never send to a server. So a view link is genuinely
 * private: it travels through whatever chat app you paste it into, and this
 * app's origin never sees the contents, even in a log.
 *
 * The cost is length. A document compresses to a few kilobytes, which is a
 * long-but-workable URL; a page of photographs does not. Rather than silently
 * dropping the pictures, `linkVerdict` reports the size and says plainly when
 * a link has grown past what messaging apps reliably carry.
 *
 * When a backend is configured, `publishShare` in `lib/db` takes over and this
 * becomes a short link. Nothing above here changes.
 */

import type { Block, BoardItem, Project, SlideObject } from "./types";
import { sanitizeHtml, safeImageSrc } from "./sanitize";

/**
 * What the sender is offering.
 *
 * Worth being precise about, because it is not access control and pretending
 * otherwise would be dishonest: the document travels inside the link, so a
 * "view" recipient already holds every word of it and could always read it in
 * a text editor. The permission decides what the *app* opens — a reader, or a
 * live session you can type into — and it is a statement of intent, the same
 * way a shared folder marked "read only" is. Real enforcement needs the
 * document to live on a server, which is the same line every other seam here
 * draws.
 */
export type SharePermission = "view" | "edit";

/**
 * Payload tag: permission, then format. `v1z` is a view link, gzipped; `e1p`
 * an edit link, uncompressed. A bare `1z` from an earlier link still reads as
 * a view link rather than failing.
 */
const GZIP = "1z";
const PLAIN = "1p";

/** Past this many characters, some chat apps start truncating links. */
export const COMFORTABLE = 8_000;
/** Past this, most will. */
export const RISKY = 32_000;

/* ── Base64url, over bytes ──────────────────────────────── */

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  // In chunks: `String.fromCharCode(...bytes)` on a megabyte-long array
  // overflows the argument limit and throws.
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function through(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/* ── Encoding ───────────────────────────────────────────── */

/**
 * The project as a link payload.
 *
 * Compression is what makes this viable at all — document JSON is repetitive
 * and gzips to roughly a fifth. Where `CompressionStream` is missing the
 * payload is still correct, just longer, and says so in its own tag rather
 * than being guessed at on the way back in.
 */
export async function encodeShare(
  project: Project,
  permission: SharePermission = "view",
): Promise<string> {
  const json = JSON.stringify(stripForShare(project));
  const bytes = new TextEncoder().encode(json);
  const mark = permission === "edit" ? "e" : "v";

  if (typeof CompressionStream === "undefined")
    return `${mark}${PLAIN}.${toBase64Url(bytes)}`;

  const stream = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new CompressionStream("gzip"));
  return `${mark}${GZIP}.${toBase64Url(await through(stream))}`;
}

/**
 * What travels. History, viewport and comment threads are working state, not
 * the document — sending them would make every link heavier for nothing, and
 * a snapshot history is a record of drafts the author didn't choose to show.
 */
function stripForShare(project: Project): Project {
  const light: Project = { ...project, board: project.board.map(bare) };
  delete light.history;
  delete light.viewport;
  return light;
}

function bare(item: BoardItem): BoardItem {
  const copy = { ...item };
  delete copy.comments;
  return copy;
}

export async function shareLink(
  project: Project,
  permission: SharePermission = "view",
): Promise<string> {
  const payload = await encodeShare(project, permission);
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/v#${payload}`;
}

export interface LinkVerdict {
  characters: number;
  /** Whether it is short enough to survive the places people paste links. */
  level: "fine" | "long" | "risky";
  note: string;
}

export function linkVerdict(url: string): LinkVerdict {
  const characters = url.length;
  if (characters <= COMFORTABLE)
    return {
      characters,
      level: "fine",
      note: "Short enough for anywhere you'd paste a link.",
    };
  if (characters <= RISKY)
    return {
      characters,
      level: "long",
      note: "A long link. Email and chat carry it; some older tools cut it short.",
    };
  return {
    characters,
    level: "risky",
    note: "Very long, mostly pictures. Many apps will truncate this — send the file instead.",
  };
}

/* ── Decoding ───────────────────────────────────────────── */

/**
 * A payload back into a project — treated as hostile the whole way.
 *
 * Anyone can write a link. So this never trusts the shape it is given: every
 * field is read individually and coerced, HTML is sanitised, and image sources
 * have to be images. Whatever survives is a `Project` by construction rather
 * than by assertion.
 */
export interface DecodedShare {
  project: Project;
  permission: SharePermission;
}

export async function decodeShare(payload: string): Promise<DecodedShare | null> {
  const dot = payload.indexOf(".");
  if (dot < 0) return null;
  const tag = payload.slice(0, dot);
  const body = payload.slice(dot + 1);

  const permission: SharePermission = tag.startsWith("e") ? "edit" : "view";
  const format = tag.replace(/^[ve]/, "");

  let bytes: Uint8Array;
  try {
    bytes = fromBase64Url(body);
    if (format === GZIP) {
      if (typeof DecompressionStream === "undefined") return null;
      bytes = await through(
        new Blob([bytes as BlobPart])
          .stream()
          .pipeThrough(new DecompressionStream("gzip")),
      );
    } else if (format !== PLAIN) {
      return null;
    }
  } catch {
    return null;
  }

  try {
    const project = validate(JSON.parse(new TextDecoder().decode(bytes)));
    return project ? { project, permission } : null;
  } catch {
    return null;
  }
}

const str = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v : fallback;
const num = (v: unknown, fallback = 0): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;

const KINDS = ["doc", "notes", "deck", "board", "code", "design"] as const;
const BLOCK_TYPES = [
  "text", "table", "chart", "slides", "code", "image", "bibliography", "toc",
] as const;
const ITEM_KINDS = [
  "text", "sticky", "image", "card", "frame", "connector",
] as const;

function validate(input: unknown): Project | null {
  const raw = obj(input);
  if (!str(raw.id) || !str(raw.name)) return null;

  return {
    id: str(raw.id),
    name: str(raw.name).slice(0, 200),
    kind: oneOf(raw.kind, KINDS, "doc"),
    glyph: str(raw.glyph, "◇").slice(0, 4),
    createdAt: num(raw.createdAt, Date.now()),
    updatedAt: num(raw.updatedAt, Date.now()),
    blocks: arr(raw.blocks).map(block).filter(Boolean) as Project["blocks"],
    board: arr(raw.board).map(item).filter(Boolean) as Project["board"],
    typography: raw.typography ? (obj(raw.typography) as never) : undefined,
    sources: arr(raw.sources) as Project["sources"],
    citationStyle: oneOf(
      raw.citationStyle,
      ["apa", "mla", "chicago", "harvard"] as const,
      "apa",
    ),
    notePlacement: oneOf(raw.notePlacement, ["foot", "end"] as const, "foot"),
    wordGoal: typeof raw.wordGoal === "number" ? raw.wordGoal : undefined,
    sectionGoals: obj(raw.sectionGoals) as Record<string, number>,
  };
}

function block(input: unknown): Project["blocks"][number] | null {
  const raw = obj(input);
  const id = str(raw.id);
  if (!id) return null;
  const type = oneOf(raw.type, BLOCK_TYPES, "text");
  const title = raw.title === undefined ? undefined : str(raw.title).slice(0, 200);

  switch (type) {
    case "text":
      // The one place a stranger's markup reaches the DOM. Cleaned here, at
      // the boundary, so nothing downstream has to remember to.
      return { id, type, title, html: sanitizeHtml(str(raw.html)) };
    case "image":
      return {
        id,
        type,
        title,
        src: safeImageSrc(raw.src),
        alt: str(raw.alt).slice(0, 400),
        caption: raw.caption === undefined ? undefined : str(raw.caption).slice(0, 400),
        naturalWidth: num(raw.naturalWidth) || undefined,
        naturalHeight: num(raw.naturalHeight) || undefined,
        scale: num(raw.scale, 100),
        align: oneOf(raw.align, ["left", "centre", "full"] as const, "centre"),
        frame: oneOf(raw.frame, ["none", "line", "shadow"] as const, "none"),
      };
    case "slides":
      return {
        id,
        type,
        title,
        slides: arr(raw.slides).map((s) => {
          const slide = obj(s);
          return {
            id: str(slide.id) || id,
            title: str(slide.title),
            bullets: arr(slide.bullets).map((b) => str(b)),
            note: slide.note === undefined ? undefined : str(slide.note),
            layout: slide.layout as never,
            objects: arr(slide.objects).map((o) => {
              const object = obj(o);
              return {
                ...object,
                src: safeImageSrc(object.src) || undefined,
                text: object.text === undefined ? undefined : str(object.text),
              } as SlideObject;
            }),
          };
        }),
        style: raw.style ? (obj(raw.style) as never) : undefined,
      };
    default:
      // Tables, charts, code and bibliographies hold data, not markup, and
      // React escapes every string it renders.
      return { ...raw, id, type, title } as Block;
  }
}

function item(input: unknown): Project["board"][number] | null {
  const raw = obj(input);
  const id = str(raw.id);
  if (!id) return null;
  return {
    ...raw,
    id,
    kind: oneOf(raw.kind, ITEM_KINDS, "text"),
    x: num(raw.x),
    y: num(raw.y),
    width: num(raw.width, 200),
    height: num(raw.height, 120),
    z: num(raw.z),
    src: raw.src === undefined ? undefined : safeImageSrc(raw.src),
    text: raw.text === undefined ? undefined : str(raw.text),
    title: raw.title === undefined ? undefined : str(raw.title),
    // A card is a window onto a project in *someone else's* library. Across a
    // link there is nothing behind it, so it arrives as the note it was.
    projectId: undefined,
    comments: undefined,
  } as BoardItem;
}
