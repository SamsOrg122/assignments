"use client";

/**
 * Keeping work without an account.
 *
 * The free plan has no login, which means the browser is the only thing
 * holding someone's thesis. That is fine right up until it isn't: browsers
 * evict "best effort" storage under pressure without warning anyone, and the
 * user finds out by opening an empty Library.
 *
 * Three defences, in order of how much they ask of the user:
 *
 *  1. `requestPersistence()` — ask the browser to mark this origin as
 *     persistent, which takes it out of the eviction pool entirely. Costs the
 *     user nothing and is the single highest-value line of code here.
 *  2. `estimate()` — how much room is left, so "you are near the limit" can be
 *     said before it matters rather than after.
 *  3. `exportWorkspace()` / `importWorkspace()` — one file holding everything,
 *     restorable in any browser. No server, no account, and it works offline.
 *
 * Sync to a real database is a fourth defence and lives behind `lib/db`. This
 * file deliberately does not depend on it: a workspace that survives without a
 * server is the promise being made to the free plan.
 */

/**
 * Every store that owns a slice of the workspace. Order is irrelevant.
 *
 * The `assignments:` prefix is the product's old name and it stays. These are
 * *addresses*, not labels: renaming them would point the app at empty slots
 * and every existing user would open Tougather to find their work gone. The
 * same goes for the IndexedDB database in `lib/kit/blobs.ts` and for
 * `BACKUP_FORMAT` below. A rebrand is not worth a single lost thesis.
 */
export const STORAGE_KEYS = [
  "assignments:projects:v1",
  "assignments:chat:v1",
  "assignments:team:v1",
  "assignments:appearance:v1",
  "assignments:kit:v1",
  "assignments:templates:v1",
] as const;

/**
 * Where the kit's fonts and pictures ride in the backup file.
 *
 * They live in IndexedDB rather than localStorage — a font is far too big for
 * the shared quota — so they are not covered by `STORAGE_KEYS`, and a backup
 * that carried the *list* of your fonts without the fonts themselves would be
 * the worst kind of half-working.
 */
export const BACKUP_BLOBS = "kitBlobs";

/**
 * Stamped into every backup file ever exported. Changing it would make each
 * one unreadable by the app that wrote it — see the note on STORAGE_KEYS.
 */
export const BACKUP_FORMAT = "assignments.backup";
export const BACKUP_VERSION = 1;

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  /** Milliseconds. Stamped by the caller, never read back as truth. */
  exportedAt: number;
  /** Raw persisted store payloads, keyed exactly as localStorage holds them. */
  data: Record<string, string>;
  /** The kit's binary assets, keyed by asset id. Absent in older files. */
  [BACKUP_BLOBS]?: Record<string, string>;
}

/* ── 1. Persistent storage ──────────────────────────────── */

export type PersistenceState = "persisted" | "best-effort" | "unsupported";

export async function persistenceState(): Promise<PersistenceState> {
  if (typeof navigator === "undefined" || !navigator.storage?.persisted)
    return "unsupported";
  return (await navigator.storage.persisted()) ? "persisted" : "best-effort";
}

/**
 * Ask to be exempt from eviction.
 *
 * Chrome grants this silently based on engagement, Firefox prompts, Safari
 * ignores it. All three are fine — the call is cheap and the failure mode is
 * exactly the status quo, so there is no reason not to make it.
 */
export async function requestPersistence(): Promise<PersistenceState> {
  if (typeof navigator === "undefined" || !navigator.storage?.persist)
    return "unsupported";
  try {
    const granted = await navigator.storage.persist();
    return granted ? "persisted" : "best-effort";
  } catch {
    return "best-effort";
  }
}

/* ── 2. How much room is left ───────────────────────────── */

export interface StorageUsage {
  /** Bytes this origin is using, as the browser reports it. */
  used: number;
  /** Bytes it is allowed, or null where the browser won't say. */
  quota: number | null;
  /** 0..1, or null when the quota is unknown. */
  fraction: number | null;
  /** What our own keys weigh, which is the part we can actually explain. */
  workspaceBytes: number;
}

export async function estimate(): Promise<StorageUsage> {
  let workspaceBytes = 0;
  if (typeof localStorage !== "undefined")
    for (const key of STORAGE_KEYS)
      workspaceBytes += (localStorage.getItem(key) ?? "").length * 2; // UTF-16

  if (typeof navigator === "undefined" || !navigator.storage?.estimate)
    return { used: workspaceBytes, quota: null, fraction: null, workspaceBytes };

  const { usage = 0, quota } = await navigator.storage.estimate();
  return {
    used: usage,
    quota: quota ?? null,
    fraction: quota ? usage / quota : null,
    workspaceBytes,
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/* ── 3. A file you can carry ────────────────────────────── */

/**
 * @param live Serialised store state for keys that may not have been written
 *   yet. The persist middleware writes on *change*, so a workspace nobody has
 *   edited has no storage entry at all — and a backup that quietly omits
 *   someone's projects is the exact failure this whole file exists to prevent.
 */
export function buildBackup(
  now: number,
  live: Record<string, string> = {},
  blobs: Record<string, string> = {},
): Backup {
  const data: Record<string, string> = {};
  for (const key of STORAGE_KEYS) {
    const value = localStorage.getItem(key) ?? live[key] ?? null;
    if (value !== null) data[key] = value;
  }
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now,
    data,
    [BACKUP_BLOBS]: blobs,
  };
}

export function backupFilename(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `tougather-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

/**
 * Download everything as one file. Nothing leaves the device.
 *
 * Async now, because the kit's fonts and pictures have to be read out of
 * IndexedDB first. A backup that skipped them to stay synchronous would lose a
 * typeface the moment somebody changed browser, which is the one thing this
 * file exists to prevent.
 */
export async function exportWorkspace(
  live?: Record<string, string>,
  blobs?: Record<string, string>,
): Promise<{ bytes: number; filename: string }> {
  const now = new Date();
  const backup = buildBackup(now.getTime(), live, blobs);
  const text = JSON.stringify(backup);
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = backupFilename(now);
  // In the document, not just constructed: a detached anchor's click is
  // ignored by some browsers, and the download silently never happens.
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  // Clean up on the next frame, not immediately: removing the anchor or
  // revoking the object URL synchronously races the download and produces a
  // cancelled transfer or a zero-byte file.
  requestAnimationFrame(() => {
    a.remove();
    URL.revokeObjectURL(url);
  });
  return { bytes: text.length * 2, filename: a.download };
}

export class BackupError extends Error {}

/**
 * Validate a file before touching anything.
 *
 * Restoring is destructive — it replaces the whole workspace — so the parse
 * and the write are separate steps. A half-applied restore from a truncated
 * file would be the worst possible outcome of a feature whose entire purpose
 * is not losing work.
 */
export function parseBackup(text: string): Backup {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new BackupError("That file isn't valid JSON.");
  }

  const backup = parsed as Partial<Backup>;
  if (backup?.format !== BACKUP_FORMAT)
    throw new BackupError("That isn't a Tougather backup file.");
  if (typeof backup.version !== "number" || backup.version > BACKUP_VERSION)
    throw new BackupError(
      "That backup was made by a newer version of Tougather.",
    );
  if (!backup.data || typeof backup.data !== "object")
    throw new BackupError("That backup is empty or damaged.");

  const keys = Object.keys(backup.data);
  if (!keys.some((k) => (STORAGE_KEYS as readonly string[]).includes(k)))
    throw new BackupError("That backup holds nothing this version can read.");

  return backup as Backup;
}

/** What a restore would do, so it can be described before it is done. */
export function describeBackup(backup: Backup): {
  projects: number;
  exportedAt: number;
} {
  let projects = 0;
  try {
    const raw = backup.data["assignments:projects:v1"];
    if (raw) projects = JSON.parse(raw)?.state?.projects?.length ?? 0;
  } catch {
    // A backup whose project slice won't parse is still restorable — the
    // count is a courtesy, not a gate.
  }
  return { projects, exportedAt: backup.exportedAt };
}

/**
 * Replace the workspace. The caller reloads afterwards: the stores hydrated
 * from the old contents at mount and will not notice a write underneath them.
 */
export function restoreBackup(backup: Backup) {
  for (const key of STORAGE_KEYS) localStorage.removeItem(key);
  for (const [key, value] of Object.entries(backup.data))
    if ((STORAGE_KEYS as readonly string[]).includes(key))
      localStorage.setItem(key, value);
}

/** The kit's binary assets out of a backup, if it carried any. */
export function backupBlobs(backup: Backup): Record<string, string> {
  return backup[BACKUP_BLOBS] ?? {};
}
