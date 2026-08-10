"use client";

/**
 * Page setup.
 *
 * The controls a course handbook actually names: paper, orientation, margins
 * in millimetres, a header, a footer, page numbers. Margins have presets
 * because "2.5 cm all round" is what most handbooks say, and a number field
 * you have to fill in four times is how people get it wrong.
 *
 * The panel says out loud which settings a browser cannot print. CSS has
 * margin boxes for running headers and page numbers; no shipping engine
 * implements them, so those reach paper through the Word export and nowhere
 * else. A setting that quietly does nothing is worse than one that explains
 * itself.
 */

import { useProjects } from "@/lib/store";
import {
  DEFAULT_PAGE,
  paperLabel,
  textWidth,
  wordOnly,
  type PageSetup,
  type PaperSize,
} from "@/lib/page";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";

const SIZES: PaperSize[] = ["a4", "letter", "legal"];

const MARGIN_PRESETS: Array<{ label: string; mm: number }> = [
  { label: "Narrow", mm: 15 },
  { label: "Normal", mm: 25 },
  { label: "Wide", mm: 35 },
];

const NUMBER_OPTIONS: Array<{ value: PageSetup["numbers"]; label: string }> = [
  { value: "none", label: "None" },
  { value: "footer-right", label: "Bottom right" },
  { value: "footer-centre", label: "Bottom centre" },
  { value: "header-right", label: "Top right" },
];

export function PagePanel({
  projectId,
  page,
  onClose,
}: {
  projectId: string;
  page?: PageSetup;
  onClose: () => void;
}) {
  const setPage = useProjects((s) => s.setPage);
  const current = { ...DEFAULT_PAGE, ...page };
  const set = (patch: Partial<PageSetup>) => setPage(projectId, patch);

  return (
    <div className="anim-pop absolute top-full right-0 z-40 mt-1.5 w-[320px] rounded-md border border-line-strong bg-surface p-3 shadow-[0_24px_70px_-12px_rgba(0,0,0,0.8)] print:hidden">
      <div className="mb-2.5 flex items-center gap-2">
        <Icon name="file" size={11} className="text-fg-subtle" />
        <span className="text-[12px] text-fg">Page</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close page setup"
          className="ml-auto rounded-xs p-0.5 text-fg-subtle transition-colors hover:text-fg"
        >
          <Icon name="x" size={11} />
        </button>
      </div>

      <Row label="Paper">
        <div className="flex gap-1">
          {SIZES.map((size) => (
            <Choice
              key={size}
              active={current.size === size}
              onClick={() => set({ size })}
            >
              {paperLabel(size)}
            </Choice>
          ))}
        </div>
      </Row>

      <Row label="Direction">
        <div className="flex gap-1">
          <Choice
            active={current.orientation === "portrait"}
            onClick={() => set({ orientation: "portrait" })}
          >
            Portrait
          </Choice>
          <Choice
            active={current.orientation === "landscape"}
            onClick={() => set({ orientation: "landscape" })}
          >
            Landscape
          </Choice>
        </div>
      </Row>

      <Row label="Margins">
        <div className="flex gap-1">
          {MARGIN_PRESETS.map((preset) => (
            <Choice
              key={preset.label}
              active={
                current.margins.top === preset.mm &&
                current.margins.left === preset.mm
              }
              onClick={() =>
                set({
                  margins: {
                    top: preset.mm,
                    right: preset.mm,
                    bottom: preset.mm,
                    left: preset.mm,
                  },
                })
              }
            >
              {preset.label}
            </Choice>
          ))}
        </div>
      </Row>

      <div className="mt-1.5 grid grid-cols-4 gap-1.5">
        {(["top", "right", "bottom", "left"] as const).map((side) => (
          <label key={side} className="flex flex-col gap-0.5">
            <span className="font-mono text-[9.5px] text-fg-subtle capitalize">
              {side}
            </span>
            <input
              type="number"
              min={0}
              max={80}
              value={current.margins[side]}
              aria-label={`${side} margin in millimetres`}
              onChange={(e) =>
                set({
                  margins: {
                    ...current.margins,
                    [side]: Math.max(0, Math.min(80, Number(e.target.value) || 0)),
                  },
                })
              }
              className="w-full rounded-sm border border-line bg-surface-2 px-1.5 py-1 text-[12px] text-fg outline-none focus:border-accent"
            />
          </label>
        ))}
      </div>
      <p className="mt-1.5 font-mono text-[9.5px] text-fg-subtle">
        millimetres · {Math.round(textWidth(current))}mm of text
      </p>

      <div className="my-2.5 h-px bg-line" />

      <Row label="Numbers">
        <select
          value={current.numbers}
          aria-label="Page numbers"
          onChange={(e) =>
            set({ numbers: e.target.value as PageSetup["numbers"] })
          }
          className="w-full rounded-sm border border-line bg-surface-2 px-1.5 py-1 text-[12px] text-fg outline-none focus:border-accent"
        >
          {NUMBER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </Row>

      <div className="mt-1.5 flex flex-col gap-1.5">
        <input
          value={current.header ?? ""}
          onChange={(e) => set({ header: e.target.value })}
          placeholder="Header — repeated at the top"
          aria-label="Page header"
          className="w-full rounded-sm border border-line bg-surface-2 px-2 py-1 text-[12px] text-fg outline-none focus:border-accent"
        />
        <input
          value={current.footer ?? ""}
          onChange={(e) => set({ footer: e.target.value })}
          placeholder="Footer — repeated at the foot"
          aria-label="Page footer"
          className="w-full rounded-sm border border-line bg-surface-2 px-2 py-1 text-[12px] text-fg outline-none focus:border-accent"
        />
      </div>

      {wordOnly(current) && (
        <p className="mt-2 rounded-sm border border-warn/35 bg-warn/[0.07] p-2 text-[11.5px] leading-relaxed text-fg-muted">
          Headers, footers and page numbers appear in the Word file. A browser
          cannot print them — the CSS for it exists and no browser implements
          it — so they are deliberately absent from PDF rather than silently
          missing.
        </p>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-1.5 flex items-center gap-2">
      <span className="w-[62px] shrink-0 text-[11.5px] text-fg-subtle">
        {label}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function Choice({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-sm border px-2 py-1 text-[11.5px] transition-colors duration-150",
        active
          ? "border-accent bg-accent-soft text-fg"
          : "border-line text-fg-muted hover:border-line-strong hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}
