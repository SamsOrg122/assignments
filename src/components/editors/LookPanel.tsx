"use client";

/**
 * The Design popover: pick the page the whole document sits on.
 *
 * Lives in the shared top bar so every kind of project has it, and applies
 * instantly — a backdrop you have to imagine before committing to is a
 * backdrop nobody tries. "None" is a first-class tile, because the plain
 * app page is the default look, not the absence of one.
 */

import { BACKDROPS, LOOK_ACCENTS, type ProjectLook } from "@/lib/looks";
import { useProjects } from "@/lib/store";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";

export function LookPanel({
  projectId,
  look,
  onClose,
}: {
  projectId: string;
  look: ProjectLook | undefined;
  onClose: () => void;
}) {
  const setLook = useProjects((s) => s.setProjectLook);

  const pick = (backdrop: string | null) => {
    if (!backdrop) {
      // Dropping the backdrop drops the whole look: an accent with no page
      // of its own is the app's job again.
      setLook(projectId, undefined);
      return;
    }
    setLook(projectId, { ...(look ?? {}), backdrop });
  };

  const accent = (hex: string | undefined) => {
    if (!look) return;
    setLook(projectId, hex ? { ...look, accent: hex } : { backdrop: look.backdrop });
  };

  return (
    <div
      role="dialog"
      aria-label="Design"
      className="absolute top-full right-0 z-40 mt-2 w-[340px] rounded-lg border border-line bg-surface p-3 shadow-xl"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="label-mono">Backdrop</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close design panel"
          className="rounded-xs p-0.5 text-fg-subtle transition-colors duration-150 hover:text-fg"
        >
          <Icon name="x" size={12} />
        </button>
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        <button
          type="button"
          onClick={() => pick(null)}
          aria-pressed={!look}
          className={cn(
            "grid aspect-[4/3] place-items-center rounded-md border text-fg-subtle transition-colors duration-150",
            !look
              ? "border-accent bg-accent-soft text-fg"
              : "border-line hover:border-line-strong hover:text-fg",
          )}
          title="None — the app's own page"
        >
          <Icon name="minus" size={13} />
        </button>
        {BACKDROPS.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => pick(b.id)}
            aria-pressed={look?.backdrop === b.id}
            title={b.name}
            className={cn(
              "relative aspect-[4/3] overflow-hidden rounded-md border transition-transform duration-150 hover:scale-[1.04]",
              look?.backdrop === b.id
                ? "border-accent ring-1 ring-accent"
                : "border-line",
            )}
            style={{ background: b.css }}
          >
            <span
              className={cn(
                "absolute inset-x-0 bottom-0 truncate px-1 pb-0.5 text-left font-mono text-[8.5px] tracking-wide uppercase",
                b.dark ? "text-white/75" : "text-black/55",
              )}
            >
              {b.name}
            </span>
          </button>
        ))}
      </div>

      <div className={cn("mt-3", !look && "pointer-events-none opacity-40")}>
        <span className="label-mono">Accent</span>
        <div className="mt-1.5 flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => accent(undefined)}
            aria-pressed={!look?.accent}
            title="The app's accent"
            className={cn(
              "grid size-6 place-items-center rounded-full border text-[9px] font-medium",
              !look?.accent ? "border-fg text-fg" : "border-line text-fg-subtle",
            )}
          >
            A
          </button>
          {LOOK_ACCENTS.map((hex) => (
            <button
              key={hex}
              type="button"
              onClick={() => accent(hex)}
              aria-pressed={look?.accent === hex}
              aria-label={`Accent ${hex}`}
              className={cn(
                "size-6 rounded-full border transition-transform duration-150 hover:scale-110",
                look?.accent === hex ? "border-fg" : "border-transparent",
              )}
              style={{ backgroundColor: hex }}
            />
          ))}
        </div>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-fg-subtle">
        The page changes; your text stays on its own sheet, so it is always
        readable. Travels with the document, share links included.
      </p>
    </div>
  );
}
