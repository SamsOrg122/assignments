"use client";

/**
 * "Will my work still be here tomorrow?"
 *
 * Answered rather than assumed. The panel reports what the browser actually
 * says about this origin's storage — not a reassuring sentence — and offers
 * the two things that change the answer: asking for persistent storage, and
 * taking a file away with you.
 *
 * It leads with the state because the state is the point. A backup button
 * nobody presses is worth nothing; "this browser may delete your work" is what
 * makes someone press it.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  BackupError,
  backupBlobs,
  describeBackup,
  estimate,
  exportWorkspace,
  formatBytes,
  parseBackup,
  persistenceState,
  requestPersistence,
  restoreBackup,
  type PersistenceState,
  type StorageUsage,
} from "@/lib/persistence";
import {
  forgetRescued,
  noRescued,
  rescuedPayloads,
  subscribeRescued,
} from "@/lib/persistence/versioned";
import { allBlobs, replaceBlobs } from "@/lib/kit/blobs";
import { useUI } from "@/lib/ui-store";
import { record } from "@/lib/admin";
import { useProjects } from "@/lib/store";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";
import { formatDateTime } from "@/lib/format";

const STATE_COPY: Record<PersistenceState, { label: string; body: string }> = {
  persisted: {
    label: "Protected",
    body:
      "This browser has marked your work as persistent — it won't be cleared to free up space. Clearing site data by hand still removes it.",
  },
  "best-effort": {
    label: "At risk",
    body:
      "Your work is stored here, but the browser may delete it if it needs room. One click asks it not to.",
  },
  unsupported: {
    label: "Unknown",
    body:
      "This browser won't say whether your work is safe from being cleared. Keep a backup file.",
  },
};

/**
 * Anything the app could not read, kept rather than deleted.
 *
 * Normally there is nothing here and this renders nothing. When there is, it
 * means a stored payload was damaged or a migration failed — and the one thing
 * that must not happen next is the bytes quietly disappearing. They are
 * offered back as a file, which a later version, or a person with a text
 * editor, can still do something with.
 */
function Rescued() {
  const notify = useUI((s) => s.notify);
  // Read through an external store, not during render: localStorage is absent
  // on the server, and a render that consults it disagrees with the markup
  // React already sent.
  const items = useSyncExternalStore(
    subscribeRescued,
    rescuedPayloads,
    noRescued,
  );
  if (!items.length) return null;

  return (
    <div className="rounded-md border border-warn/40 bg-warn/[0.07] p-3.5">
      <p className="text-[13px] text-fg">
        {items.length} piece{items.length === 1 ? "" : "s"} of unreadable data
        kept aside
      </p>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-fg-muted">
        Something stored here couldn&apos;t be read — a damaged payload, or an
        upgrade that didn&apos;t finish. It was copied instead of deleted. Save
        it somewhere before you clear it; a later version may be able to open
        it.
      </p>
      <ul className="mt-2.5 space-y-1.5">
        {items.map((item) => (
          <li
            key={item.key}
            className="flex flex-wrap items-center gap-2 font-mono text-[10.5px] text-fg-subtle"
          >
            <span className="text-fg-muted">{item.source}</span>
            <span>{formatBytes(item.bytes)}</span>
            <span>{formatDateTime(item.at)}</span>
            <button
              type="button"
              onClick={() => {
                const raw = localStorage.getItem(item.key) ?? "";
                const url = URL.createObjectURL(
                  new Blob([raw], { type: "application/json" }),
                );
                const a = document.createElement("a");
                a.href = url;
                a.download = `${item.source.replace(/[:]/g, "-")}-${item.at}.json`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              }}
              className="rounded-xs border border-line px-1.5 py-0.5 text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                forgetRescued(item.key);
                notify("Discarded");
              }}
              className="rounded-xs border border-line px-1.5 py-0.5 text-fg-subtle transition-colors hover:border-danger/60 hover:text-danger"
            >
              Discard
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SafeKeeping() {
  const notify = useUI((s) => s.notify);
  const [state, setState] = useState<PersistenceState | null>(null);
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [asking, setAsking] = useState(false);
  const [pending, setPending] = useState<{
    text: string;
    projects: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  /**
   * Storage state is an external system, so it is read through callbacks
   * rather than set synchronously in the effect body. The `live` flag matters
   * because both promises can settle after this panel has gone away.
   */
  const refresh = useCallback(() => {
    let live = true;
    void persistenceState().then((s) => live && setState(s));
    void estimate().then((u) => live && setUsage(u));
    return () => {
      live = false;
    };
  }, []);

  useEffect(refresh, [refresh]);

  const ask = async () => {
    setAsking(true);
    const next = await requestPersistence();
    setState(next);
    setAsking(false);
    notify(
      next === "persisted"
        ? "This browser will keep your work"
        : "The browser didn't grant it — keep a backup file",
    );
  };

  const onFile = async (file: File) => {
    setError(null);
    try {
      const text = await file.text();
      const backup = parseBackup(text);
      const { projects } = describeBackup(backup);
      // Parsed, but not applied. Replacing someone's whole workspace is not
      // something to do on a file-picker change event.
      setPending({ text, projects });
    } catch (e) {
      setError(
        e instanceof BackupError ? e.message : "That file couldn't be read.",
      );
    }
  };

  const copy = state ? STATE_COPY[state] : null;

  return (
    <div className="flex flex-col gap-3.5">
      {/* Where things stand. */}
      <div className="rounded-md border border-line bg-surface p-3.5">
        <p className="flex items-center gap-2 text-[13px] text-fg">
          <span
            className={cn(
              "size-1.5 rounded-full",
              state === "persisted"
                ? "bg-leaf"
                : state === "best-effort"
                  ? "bg-warn"
                  : "bg-fg-subtle",
            )}
          />
          {copy ? copy.label : "Checking…"}
          {usage && (
            <span className="ml-auto font-mono text-[10.5px] text-fg-subtle">
              {formatBytes(usage.workspaceBytes)} of work
              {usage.quota
                ? ` · ${formatBytes(usage.used)} of ${formatBytes(usage.quota)} used`
                : ""}
            </span>
          )}
        </p>
        {copy && (
          <p className="mt-2 text-[12.5px] leading-relaxed text-fg-muted">
            {copy.body}
          </p>
        )}

        {usage?.fraction != null && usage.fraction > 0.8 && (
          <p className="mt-2 text-[12px] text-warn">
            This browser&apos;s storage is {Math.round(usage.fraction * 100)}%
            full. Export a backup before it runs out.
          </p>
        )}

        {state === "best-effort" && (
          <button
            type="button"
            onClick={() => void ask()}
            disabled={asking}
            className="mt-3 flex items-center gap-2 rounded-sm bg-accent px-2.5 py-1.5 text-[12.5px] font-medium text-on-accent transition-[filter] duration-150 hover:brightness-110 disabled:opacity-60"
          >
            <Icon name="check" size={12} />
            {asking ? "Asking…" : "Ask the browser to keep it"}
          </button>
        )}
      </div>

      {/* The file. */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            // The project store writes to localStorage on change, so a
            // workspace nobody has edited yet has nothing stored. Hand the
            // live state over in the same envelope the middleware writes, so
            // the file is complete either way.
            void allBlobs()
              .catch(() => ({}))
              .then((blobs) =>
                exportWorkspace(
                  {
                    "assignments:projects:v1": JSON.stringify({
                      state: { projects: useProjects.getState().projects },
                      version: 0,
                    }),
                  },
                  blobs,
                ),
              )
              .then(({ filename }) => {
                notify(`Saved ${filename}`);
                refresh();
                // Somebody taking a copy of everything is the entry an admin
                // would come looking for. Best effort, and silent without a
                // database — see `lib/admin`.
                void record("workspace.exported", filename, {
                  projects: useProjects.getState().projects.length,
                });
              });
          }}
          className="flex items-center gap-2 rounded-sm border border-line px-2.5 py-1.5 text-[12.5px] text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg"
        >
          <Icon name="download" size={12} />
          Export a backup file
        </button>

        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-2 rounded-sm border border-line px-2.5 py-1.5 text-[12.5px] text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg"
        >
          <Icon name="file" size={12} />
          Restore from a file
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          aria-hidden="true"
          tabIndex={-1}
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            // Reset so picking the same file twice still fires a change.
            e.target.value = "";
            if (file) void onFile(file);
          }}
        />
      </div>

      <p className="font-mono text-[10px] leading-relaxed text-fg-subtle">
        One file holds every project, board, chat and setting. It never leaves
        this device, and it opens in any browser — which is how work moves
        between machines, between browsers, and between two addresses of this
        app, until accounts exist.
      </p>

      <Rescued />

      {error && <p className="text-[12px] text-danger">{error}</p>}

      {/* Confirm, because restoring replaces everything. */}
      {pending && (
        <div className="anim-slide-up rounded-md border border-warn/40 bg-warn/[0.07] p-3.5">
          <p className="text-[13px] text-fg">
            Restore {pending.projects} project
            {pending.projects === 1 ? "" : "s"} from this file?
          </p>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-fg-muted">
            Everything currently in this browser is replaced, including chat and
            settings. Export what&apos;s here first if you might want it back.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const backup = parseBackup(pending.text);
                restoreBackup(backup);
                // The kit's fonts and pictures live in IndexedDB, so they are
                // replaced separately — and the reload waits for them, or the
                // page would come back with a shelf full of broken entries.
                void replaceBlobs(backupBlobs(backup))
                  .catch(() => {})
                  .then(() => window.location.reload());
                return;
                // The stores read localStorage once, at mount, so a router
                // navigation would leave them showing the replaced workspace.
                // A full reload is the honest way to adopt a wholesale
                // replacement of everything underneath them.
                window.location.reload();
              }}
              className="rounded-sm bg-accent px-2.5 py-1.5 text-[12.5px] font-medium text-on-accent transition-[filter] duration-150 hover:brightness-110"
            >
              Replace everything
            </button>
            <button
              type="button"
              onClick={() => setPending(null)}
              className="rounded-sm border border-line px-2.5 py-1.5 text-[12.5px] text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
