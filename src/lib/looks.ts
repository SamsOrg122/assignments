/**
 * A project's look: the page it is presented on.
 *
 * The typography panel styles the text and the paper setting tints the sheet;
 * this is the layer behind both — the backdrop the whole document sits on,
 * and an accent of its own. The content always stays on its sheet (the
 * floating card the editors draw when a backdrop is set), so a wild backdrop
 * never has to negotiate contrast with a paragraph: the sheet keeps the
 * app's — or the chosen paper's — own colours.
 *
 * Presets rather than a colour-picker wall. Each backdrop is one CSS
 * `background` value, self-contained in absolute colours so it looks the
 * same in the app's light and dark themes. Unknown ids render as no backdrop
 * at all, which is what makes the stored string safe to receive from share
 * links and, later, the community.
 */

export interface ProjectLook {
  /** A backdrop id from BACKDROPS. */
  backdrop: string;
  /** Accent hex for this project's view only. Absent = the app's accent. */
  accent?: string;
}

export interface Backdrop {
  id: string;
  name: string;
  /** A complete CSS `background` value — layers allowed. */
  css: string;
  /** True when tile labels need light text. */
  dark: boolean;
}

export const BACKDROPS: Backdrop[] = [
  {
    id: "aurora",
    name: "Aurora",
    dark: true,
    css: "radial-gradient(900px 520px at 12% -8%, rgba(45, 212, 191, 0.32), transparent 60%), radial-gradient(820px 480px at 88% 4%, rgba(129, 140, 248, 0.38), transparent 62%), radial-gradient(600px 420px at 55% 110%, rgba(236, 72, 153, 0.16), transparent 60%), #0b1020",
  },
  {
    id: "dusk",
    name: "Dusk",
    dark: true,
    css: "linear-gradient(160deg, #1b1036 0%, #3b1d5a 46%, #71337a 100%)",
  },
  {
    id: "ocean",
    name: "Ocean",
    dark: true,
    css: "linear-gradient(165deg, #06263f 0%, #0b4f6c 55%, #0f7a7a 100%)",
  },
  {
    id: "ember",
    name: "Ember",
    dark: true,
    css: "radial-gradient(760px 460px at 82% 108%, rgba(249, 115, 22, 0.42), transparent 62%), radial-gradient(560px 380px at 10% 96%, rgba(190, 24, 93, 0.25), transparent 60%), #16130f",
  },
  {
    id: "midnight",
    name: "Midnight",
    dark: true,
    css: "radial-gradient(1100px 640px at 50% -18%, rgba(70, 82, 110, 0.45), transparent 70%), #07080c",
  },
  {
    id: "blueprint",
    name: "Blueprint",
    dark: true,
    css: "repeating-linear-gradient(0deg, rgba(148, 190, 255, 0.09) 0 1px, transparent 1px 28px), repeating-linear-gradient(90deg, rgba(148, 190, 255, 0.09) 0 1px, transparent 1px 28px), #0d2137",
  },
  {
    id: "night-dots",
    name: "Night dots",
    dark: true,
    css: "radial-gradient(rgba(255, 255, 255, 0.14) 1px, transparent 1.5px) 0 0 / 20px 20px repeat, #101116",
  },
  {
    id: "vapor",
    name: "Vapor",
    dark: true,
    css: "repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.07) 0 1px, transparent 1px 34px), linear-gradient(180deg, #241b4d 0%, #6b2a70 58%, #d96d5a 100%)",
  },
  {
    id: "forest",
    name: "Forest",
    dark: true,
    css: "linear-gradient(170deg, #0d2318 0%, #14532d 70%, #1f6a3c 100%)",
  },
  {
    id: "sunrise",
    name: "Sunrise",
    dark: false,
    css: "linear-gradient(160deg, #ffe9d6 0%, #ffd3d8 48%, #e6d9ff 100%)",
  },
  {
    id: "meadow",
    name: "Meadow",
    dark: false,
    css: "linear-gradient(165deg, #eaf7e2 0%, #d1eedd 55%, #c2e6ef 100%)",
  },
  {
    id: "candy",
    name: "Candy",
    dark: false,
    css: "linear-gradient(150deg, #ffe0ef 0%, #e8e6ff 52%, #d8f2ff 100%)",
  },
  {
    id: "sand",
    name: "Sand",
    dark: false,
    css: "linear-gradient(170deg, #f7efe0 0%, #efe0c8 60%, #e7d3b3 100%)",
  },
  {
    id: "fog",
    name: "Fog",
    dark: false,
    css: "linear-gradient(180deg, #eef1f6 0%, #dfe5ee 100%)",
  },
  {
    id: "graph",
    name: "Graph paper",
    dark: false,
    css: "repeating-linear-gradient(0deg, rgba(30, 64, 175, 0.10) 0 1px, transparent 1px 24px), repeating-linear-gradient(90deg, rgba(30, 64, 175, 0.10) 0 1px, transparent 1px 24px), #f6f8fb",
  },
  {
    id: "day-dots",
    name: "Day dots",
    dark: false,
    css: "radial-gradient(rgba(20, 20, 40, 0.16) 1px, transparent 1.5px) 0 0 / 20px 20px repeat, #f4f4f0",
  },
];

/** Accents worth offering next to the app's own. */
export const LOOK_ACCENTS = [
  "#5b8dff",
  "#9d7bff",
  "#ef7bae",
  "#ff7062",
  "#e8a34b",
  "#55c07d",
  "#3fbdb0",
  "#8a93a6",
];

export function backdropOf(look: ProjectLook | undefined): Backdrop | null {
  if (!look?.backdrop) return null;
  return BACKDROPS.find((b) => b.id === look.backdrop) ?? null;
}

/**
 * The inline style a look puts on an editor's page container: the backdrop,
 * and the accent re-pointed for this view only. Undefined when the project
 * has no effective look, so the editor renders exactly as before.
 */
export function lookStyle(
  look: ProjectLook | undefined,
): Record<string, string> | undefined {
  const backdrop = backdropOf(look);
  if (!backdrop && !look?.accent) return undefined;
  const style: Record<string, string> = {};
  if (backdrop) style.background = backdrop.css;
  if (look?.accent) style["--color-accent"] = look.accent;
  return style;
}

/**
 * A look from outside — a share link, a community post — reduced to what can
 * safely be stored. Ids are clipped, not checked against the list: a look
 * from a newer version simply renders as no backdrop here, and starts
 * working the day this build learns its id.
 */
export function sanitizeLook(raw: unknown): ProjectLook | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const shape = raw as { backdrop?: unknown; accent?: unknown };
  const backdrop =
    typeof shape.backdrop === "string" ? shape.backdrop.slice(0, 32) : "";
  if (!backdrop) return undefined;
  const accent =
    typeof shape.accent === "string" && /^#[0-9a-fA-F]{6}$/.test(shape.accent)
      ? shape.accent
      : undefined;
  return accent ? { backdrop, accent } : { backdrop };
}
