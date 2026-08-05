/**
 * Appearance types and constants.
 *
 * Deliberately NOT a `"use client"` module. The root layout is a Server
 * Component and inlines these values into the boot script; importing them from
 * a client module hands back a client *reference*, which serialises to
 * `undefined` and silently produces a script that reads
 * `localStorage.getItem(undefined)`. Keeping the plain data here means both
 * sides get the real values.
 */

export type ThemeMode = "dark" | "light" | "system";
export type AccentName = "blue" | "violet" | "teal" | "amber" | "rose" | "mono";
export type RadiusName = "sharp" | "default" | "soft";
export type DensityName = "comfortable" | "compact";
export type UIFont = "geist" | "system" | "mono";
export type MotionName = "full" | "reduced";

export interface Appearance {
  mode: ThemeMode;
  accent: AccentName;
  radius: RadiusName;
  density: DensityName;
  font: UIFont;
  motion: MotionName;
  /** Sidebar width in px. Dragging the edge writes here. */
  sidebarWidth: number;
}

/** Shared with the no-flash boot script in the layout. */
export const APPEARANCE_KEY = "assignments:appearance:v1";

export const DEFAULT_APPEARANCE: Appearance = {
  mode: "dark",
  accent: "blue",
  radius: "default",
  density: "comfortable",
  font: "geist",
  motion: "full",
  sidebarWidth: 228,
};

export const ACCENTS: Record<AccentName, { label: string; swatch: string }> = {
  blue: { label: "Electric", swatch: "#3d7dff" },
  violet: { label: "Violet", swatch: "#8b5cf6" },
  teal: { label: "Teal", swatch: "#14b8a6" },
  amber: { label: "Amber", swatch: "#e0a04a" },
  rose: { label: "Rose", swatch: "#f43f6e" },
  mono: { label: "Mono", swatch: "#ededed" },
};

/**
 * The boot script, as a string. Lives beside the constants it inlines so the
 * two can't drift, and runs before first paint to stop a stored light theme
 * flashing dark.
 */
export const APPEARANCE_BOOT_SCRIPT = `try{
  var d=${JSON.stringify(DEFAULT_APPEARANCE)};
  var s=(JSON.parse(localStorage.getItem(${JSON.stringify(APPEARANCE_KEY)})||"{}")||{}).state||{};
  var a=Object.assign({},d,s);
  var m=a.mode==="system"
    ? (matchMedia("(prefers-color-scheme: light)").matches?"light":"dark")
    : a.mode;
  var r=document.documentElement;
  r.dataset.theme=m; r.dataset.accent=a.accent; r.dataset.radius=a.radius;
  r.dataset.density=a.density; r.dataset.font=a.font; r.dataset.motion=a.motion;
  r.style.setProperty("--sidebar-w", a.sidebarWidth+"px");
  r.style.colorScheme=m;
}catch(e){}`;
