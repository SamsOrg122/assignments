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
    /* The tint and the outline are gone; the sentence carries it in warn ink
       and weight, which is the pair that survives both themes. */
    <div>
      <p className="text-body font-medium text-warn">
        {items.length} piece{items.length === 1 ? "" : "s"} of unreadable data
        kept aside
      </p>
      <p className="mt-(--space-1) max-w-[68ch] text-body text-fg-muted">
        Something stored here couldn&apos;t be read — a damaged payload, or an
        upgrade that didn&apos;t finish. It was copied instead of deleted. Save
        it somewhere before you clear it; a later version may be able to open
        it.
      </p>
      <ul className="mt-(--space-3) space-y-(--space-2)">
        {items.map((item) => (
          <li
            key={item.key}
            className="flex flex-wrap items-center gap-(--space-2) text-meta text-fg-subtle"
          >
            {/* A storage key is an id you would quote to somebody, so it
                keeps the mono face; the size and the date beside it are
                facts and go sans with every other fact on the page. */}
            <span className="text-meta text-fg-subtle">{item.source}</span>
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
              className="rounded-xs bg-surface-2 px-1.5 py-0.5 font-medium text-fg transition-colors hover:bg-surface-3"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                forgetRescued(item.key);
                notify("Discarded");
              }}
              className="rounded-xs bg-surface-2 px-1.5 py-0.5 font-medium text-danger transition-colors hover:bg-surface-3"
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
    <div className="flex flex-col gap-(--space-3)">
      {/* Where things stand. The dot's colour and the word beside it are the
          answer; the card around them was a third statement of the same
          thing at 1.1:1, which is to say no statement at all. */}
      <div>
        <p className="flex items-center gap-(--space-2) text-body text-fg">
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
            <span className="ml-auto text-meta text-fg-subtle">
              {formatBytes(usage.workspaceBytes)} of work
              {usage.quota
                ? ` · ${formatBytes(usage.used)} of ${formatBytes(usage.quota)} used`
                : ""}
            </span>
          )}
        </p>
        {copy && (
          <p className="mt-(--space-2) max-w-[68ch] text-body text-fg-muted">
            {copy.body}
          </p>
        )}

        {usage?.fraction != null && usage.fraction > 0.8 && (
          <p className="mt-(--space-2) max-w-[68ch] text-body text-warn">
            This browser&apos;s storage is {Math.round(usage.fraction * 100)}%
            full. Export a backup before it runs out.
          </p>
        )}

        {state === "best-effort" && (
          <button
            type="button"
            onClick={() => void ask()}
            disabled={asking}
            className="mt-(--space-3) flex items-center gap-2 rounded-sm bg-surface-2 px-2.5 py-1.5 text-body font-medium text-fg transition-colors duration-150 hover:bg-surface-3 disabled:opacity-60"
          >
            <Icon name="check" size={12} />
            {asking ? "Asking…" : "Ask the browser to keep it"}
          </button>
        )}
      </div>

      {/* The file. Both of these write something, so both get the shape. */}
      <div className="flex flex-wrap items-center gap-(--space-3)">
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
          className="flex items-center gap-2 rounded-sm bg-surface-2 px-2.5 py-1.5 text-body font-medium text-fg transition-colors duration-150 hover:bg-surface-3"
        >
          <Icon name="download" size={12} />
          Export a backup file
        </button>

        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-2 rounded-sm bg-surface-2 px-2.5 py-1.5 text-body font-medium text-fg transition-colors duration-150 hover:bg-surface-3"
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

      {/* Prose about what the file is for. It was 10px monospace, which is
          the face for things you paste, and this is a sentence. */}
      <p className="max-w-[68ch] text-body text-fg-muted">
        One file holds every project, board, chat and setting. It never leaves
        this device, and it opens in any browser — which is how work moves
        between machines, between browsers, and between two addresses of this
        app, until accounts exist.
      </p>

      <Rescued />

      {error && <p className="text-body text-danger">{error}</p>}

      {/* Confirm, because restoring replaces everything. */}
      {pending && (
        <div className="anim-slide-up">
          {/* The question is in warn ink at weight and the button that
              answers it is in danger ink. Both of those survive a theme
              change; the 1.1:1 tint that used to be the third signal did
              not, and it was the one drawing a box. */}
          <p className="text-body font-medium text-warn">
            Restore {pending.projects} project
            {pending.projects === 1 ? "" : "s"} from this file?
          </p>
          <p className="mt-(--space-1) max-w-[68ch] text-body text-fg-muted">
            Everything currently in this browser is replaced, including chat and
            settings. Export what&apos;s here first if you might want it back.
          </p>
          <div className="mt-(--space-3) flex items-center gap-(--space-3)">
            <button
              type="button"
              onClick={() => {
                const backup = parseBackup(pending.text);
                restoreBackup(backup);
                // The kit's fonts and pictures live in IndexedDB, so they are
                // replaced separately — and the reload waits for them, or the
                // page would come back with a shelf full of broken entries.
                //
                // A full reload rather than a router navigation: the stores
                // read localStorage once, at mount, so navigating would leave
                // them showing the workspace that was just replaced.
                void replaceBlobs(backupBlobs(backup))
                  .catch(() => {})
                  .then(() => window.location.reload());
              }}
              className="rounded-sm bg-surface-2 px-2.5 py-1.5 text-body font-medium text-danger transition-colors duration-150 hover:bg-surface-3"
            >
              Replace everything
            </button>
            <button
              type="button"
              onClick={() => setPending(null)}
              className="text-body text-fg-muted underline decoration-line-strong underline-offset-2 transition-colors duration-150 hover:text-fg"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
