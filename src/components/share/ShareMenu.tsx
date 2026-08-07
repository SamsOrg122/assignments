"use client";

/**
 * "Share" — one button, one link.
 *
 * The link is built on open rather than on mount: encoding a project costs a
 * compression pass, and every editor would pay it on every keystroke otherwise.
 * It is rebuilt each time the panel opens, so it always carries the document as
 * it is now — a stale link is worse than a slow one.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { Project } from "@/lib/types";
import { linkVerdict, shareLink, type LinkVerdict } from "@/lib/share";
import { isRemoteConfigured } from "@/lib/db";
import { useUI } from "@/lib/ui-store";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";

export function ShareMenu({ project }: { project: Project }) {
  const notify = useUI((s) => s.notify);
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<LinkVerdict | null>(null);
  const [copied, setCopied] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const build = useCallback(() => {
    setLink(null);
    shareLink(project).then(
      (url) => {
        setLink(url);
        setVerdict(linkVerdict(url));
      },
      () => notify("That project couldn't be turned into a link."),
    );
  }, [project, notify]);

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    // Built here rather than in an effect: opening the panel is the event
    // that should produce a link, and doing it in an effect would be a second
    // render pass for something the click already knew.
    setOpen(true);
    build();
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
    notify("View link copied");
    setTimeout(() => setCopied(false), 1600);
  };

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
          className="anim-pop absolute top-full right-0 z-50 mt-1.5 w-[320px] rounded-md border border-line-strong bg-surface p-3 shadow-[0_24px_70px_-12px_rgba(0,0,0,0.8)]"
        >
          <p className="text-[12.5px] font-medium text-fg">View link</p>
          <p className="mt-0.5 text-[11.5px] leading-relaxed text-fg-subtle">
            Anyone with this link can read {project.name} — not edit it.
          </p>

          <div className="mt-2.5 flex gap-1.5">
            <input
              ref={inputRef}
              readOnly
              value={link ?? "Building the link…"}
              aria-label="View link"
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

          <div className="mt-2.5 border-t border-line pt-2.5">
            <p className="text-[11px] leading-relaxed text-fg-subtle">
              {/*
                The one thing a person needs to know before they paste this
                somewhere: where the document actually goes. It goes in the
                link. Saying so is also the reason the link is long.
              */}
              The whole document travels inside the link, after the{" "}
              <code className="font-mono text-fg-muted">#</code>. Browsers never
              send that part to a server, so nothing is uploaded — and anyone
              who has the link has the document.
            </p>
            {!isRemoteConfigured() && (
              <p className="mt-1.5 text-[11px] leading-relaxed text-fg-subtle">
                Short links, expiry and revoking need an account. Those arrive
                with the backend.
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
              Open the view
            </a>
          )}
        </div>
      )}
    </span>
  );
}
