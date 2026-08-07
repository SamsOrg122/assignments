"use client";

/**
 * "Share" — two links, one choice.
 *
 * **Can view** hands someone a reader. **Can edit** hands them the editor and
 * puts you both in the same live session: their pointer on your screen, your
 * changes on theirs.
 *
 * The link is built when the panel opens, not on mount: encoding a project
 * costs a compression pass and every editor would pay it on every keystroke
 * otherwise. It is rebuilt each time, so it always carries the document as it
 * is now — a stale link is worse than a slow one.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { Project } from "@/lib/types";
import {
  linkVerdict,
  shareLink,
  type LinkVerdict,
  type SharePermission,
} from "@/lib/share";
import { transportReach } from "@/lib/collab/transport";
import { useUI } from "@/lib/ui-store";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";

const MODES: Array<{
  value: SharePermission;
  label: string;
  blurb: (name: string) => string;
}> = [
  {
    value: "view",
    label: "Can view",
    blurb: (name) => `Opens ${name} as a reader. Nothing to change, nothing to break.`,
  },
  {
    value: "edit",
    label: "Can help",
    blurb: (name) =>
      `Opens ${name} in the editor, in a session with you — you'll see each other's pointer.`,
  },
];

export function ShareMenu({ project }: { project: Project }) {
  const notify = useUI((s) => s.notify);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<SharePermission>("view");
  const [link, setLink] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<LinkVerdict | null>(null);
  const [copied, setCopied] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const build = useCallback(
    (permission: SharePermission) => {
      setLink(null);
      shareLink(project, permission).then(
        (url) => {
          setLink(url);
          setVerdict(linkVerdict(url));
        },
        () => notify("That project couldn't be turned into a link."),
      );
    },
    [project, notify],
  );

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    // Built here rather than in an effect: opening the panel is the event that
    // should produce a link, and doing it in an effect would be a second
    // render pass for something the click already knew.
    setOpen(true);
    build(mode);
  };

  const choose = (next: SharePermission) => {
    setMode(next);
    setCopied(false);
    build(next);
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!panelRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // Clipboard access is refused on insecure origins and in some embedded
      // browsers. Selecting the text is a copy the user can finish themselves,
      // which beats a button that silently does nothing.
      inputRef.current?.select();
      notify("Press ⌘C to copy — the link is selected.");
      return;
    }
    setCopied(true);
    notify(mode === "edit" ? "Edit link copied" : "View link copied");
    setTimeout(() => setCopied(false), 1600);
  };

  const reach = transportReach();
  const active = MODES.find((m) => m.value === mode)!;

  return (
    <span className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className={cn(
          "flex items-center gap-1.5 rounded-sm border px-2 py-1 text-[11.5px] transition-colors duration-150",
          open
            ? "border-line-strong bg-surface-2 text-fg"
            : "border-line text-fg-muted hover:border-line-strong hover:text-fg",
        )}
      >
        <Icon name="link" size={11} />
        Share
      </button>

      {open && (
        <div
          ref={panelRef}
          className="anim-pop absolute top-full right-0 z-50 mt-1.5 w-[340px] rounded-md border border-line-strong bg-surface p-3 shadow-[0_24px_70px_-12px_rgba(0,0,0,0.8)]"
        >
          <div
            role="radiogroup"
            aria-label="What the link allows"
            className="flex gap-1 rounded-sm border border-line p-0.5"
          >
            {MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                role="radio"
                aria-checked={mode === m.value}
                onClick={() => choose(m.value)}
                className={cn(
                  "flex-1 rounded-xs px-2 py-1 text-[11.5px] transition-colors duration-150",
                  mode === m.value
                    ? "bg-surface-3 text-fg"
                    : "text-fg-subtle hover:text-fg-muted",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>

          <p className="mt-2 text-[11.5px] leading-relaxed text-fg-subtle">
            {active.blurb(project.name)}
          </p>

          <div className="mt-2.5 flex gap-1.5">
            <input
              ref={inputRef}
              readOnly
              value={link ?? "Building the link…"}
              aria-label={mode === "edit" ? "Edit link" : "View link"}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded-sm border border-line bg-canvas px-2 py-1.5 font-mono text-[10.5px] text-fg-muted outline-none focus:border-line-strong"
            />
            <button
              type="button"
              onClick={copy}
              disabled={!link}
              className="shrink-0 rounded-sm bg-accent px-2.5 py-1.5 text-[11.5px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>

          {verdict && (
            <p
              className={cn(
                "mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed",
                verdict.level === "fine" ? "text-fg-subtle" : "text-[#d8a33c]",
              )}
            >
              <Icon
                name={verdict.level === "fine" ? "check" : "minus"}
                size={10}
                className="mt-0.5 shrink-0"
              />
              <span>
                {verdict.characters.toLocaleString()} characters. {verdict.note}
              </span>
            </p>
          )}

          <div className="mt-2.5 space-y-1.5 border-t border-line pt-2.5 text-[11px] leading-relaxed text-fg-subtle">
            {/*
              The one thing a person needs to know before they paste this
              somewhere: where the document actually goes. It goes in the link.
              Saying so is also the reason the link is long.
            */}
            <p>
              The whole document travels inside the link, after the{" "}
              <code className="font-mono text-fg-muted">#</code>. Browsers never
              send that part to a server, so nothing is uploaded — and anyone
              who has the link has the document.
            </p>

            {mode === "view" ? (
              // Not a lock, and it would be dishonest to draw one. Said plainly
              // so nobody sends a view link believing it withholds something.
              <p>
                &ldquo;Can view&rdquo; picks which door the link opens, not what
                the recipient is able to read — they hold the document either
                way. Locking, expiry and revoking need an account.
              </p>
            ) : (
              <p>
                {reach
                  ? `Live changes and pointers travel between ${reach}.`
                  : "This browser can't open a live session, so the link opens an editable copy instead."}{" "}
                What they write arrives in your document and is saved with it.
                The session itself lasts only while you both have it open —
                nothing is stored between visits until there&apos;s a backend.
              </p>
            )}
          </div>

          {link && (
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2.5 flex items-center gap-1.5 text-[11.5px] text-accent transition-opacity hover:opacity-80"
            >
              <Icon name="play" size={10} />
              {mode === "edit" ? "Open a second window" : "Open the view"}
            </a>
          )}
        </div>
      )}
    </span>
  );
}
