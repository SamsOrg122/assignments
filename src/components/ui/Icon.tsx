/**
 * Hand-rolled icon set.
 *
 * A dependency would bring hundreds of icons drawn to someone else's optical
 * weight. These are all 16px on a 16 grid, 1.5 stroke, so they sit evenly next
 * to the type scale.
 */

import type { SVGProps } from "react";

export type IconName =
  | "search"
  | "plus"
  | "text"
  | "table"
  | "chart"
  | "slides"
  | "code"
  | "sparkle"
  | "grip"
  | "trash"
  | "copy"
  | "chevron-down"
  | "chevron-right"
  | "chevron-left"
  | "dots"
  | "check"
  | "x"
  | "play"
  | "panel-left"
  | "home"
  | "arrow-right"
  | "arrow-up"
  | "settings"
  | "download"
  | "corner-down-left"
  | "file"
  | "sort"
  | "users"
  | "refresh";

const PATHS: Record<IconName, React.ReactNode> = {
  search: (
    <>
      <circle cx="7.5" cy="7.5" r="4.5" />
      <path d="m11 11 3 3" />
    </>
  ),
  plus: <path d="M8 3.5v9M3.5 8h9" />,
  text: <path d="M4 4h8M8 4v8M6.5 12h3" />,
  table: (
    <>
      <rect x="2.5" y="3" width="11" height="10" rx="1.5" />
      <path d="M2.5 6.5h11M6.5 6.5V13" />
    </>
  ),
  chart: <path d="M3 13V7M8 13V3.5M13 13v-4" />,
  slides: (
    <>
      <rect x="2" y="3" width="12" height="8" rx="1.5" />
      <path d="M8 11v2M6 13.5h4" />
    </>
  ),
  code: <path d="m5.5 5.5-3 2.5 3 2.5M10.5 5.5l3 2.5-3 2.5" />,
  sparkle: (
    <path d="M8 2.5 9.3 6.2 13 7.5 9.3 8.8 8 12.5 6.7 8.8 3 7.5l3.7-1.3zM12.5 11.5l.5 1.4 1.4.6-1.4.5-.5 1.4-.5-1.4-1.4-.5 1.4-.6z" />
  ),
  grip: (
    <>
      <circle cx="6" cy="4" r=".9" fill="currentColor" stroke="none" />
      <circle cx="10" cy="4" r=".9" fill="currentColor" stroke="none" />
      <circle cx="6" cy="8" r=".9" fill="currentColor" stroke="none" />
      <circle cx="10" cy="8" r=".9" fill="currentColor" stroke="none" />
      <circle cx="6" cy="12" r=".9" fill="currentColor" stroke="none" />
      <circle cx="10" cy="12" r=".9" fill="currentColor" stroke="none" />
    </>
  ),
  trash: <path d="M3.5 4.5h9M6.5 4.5V3h3v1.5M5 4.5l.6 8h4.8l.6-8" />,
  copy: (
    <>
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
      <path d="M10.5 5.5v-1a1.5 1.5 0 0 0-1.5-1.5H4a1.5 1.5 0 0 0-1.5 1.5v5A1.5 1.5 0 0 0 4 11h1" />
    </>
  ),
  "chevron-down": <path d="m4 6.5 4 4 4-4" />,
  "chevron-right": <path d="m6.5 4 4 4-4 4" />,
  "chevron-left": <path d="m9.5 4-4 4 4 4" />,
  dots: (
    <>
      <circle cx="3.5" cy="8" r=".9" fill="currentColor" stroke="none" />
      <circle cx="8" cy="8" r=".9" fill="currentColor" stroke="none" />
      <circle cx="12.5" cy="8" r=".9" fill="currentColor" stroke="none" />
    </>
  ),
  check: <path d="m3.5 8.5 3 3 6-7" />,
  x: <path d="m4 4 8 8M12 4l-8 8" />,
  play: <path d="M5.5 3.5v9l7-4.5z" />,
  "panel-left": (
    <>
      <rect x="2.5" y="3" width="11" height="10" rx="1.5" />
      <path d="M6.5 3v10" />
    </>
  ),
  home: <path d="M3 7.5 8 3l5 4.5V13H3zM6.5 13V9.5h3V13" />,
  "arrow-right": <path d="M3 8h10M9 4l4 4-4 4" />,
  "arrow-up": <path d="M8 13V3M4 7l4-4 4 4" />,
  settings: (
    <>
      <circle cx="8" cy="8" r="2" />
      <path d="M8 2v1.5M8 12.5V14M14 8h-1.5M3.5 8H2M12.2 3.8l-1 1M4.8 11.2l-1 1M12.2 12.2l-1-1M4.8 4.8l-1-1" />
    </>
  ),
  download: <path d="M8 2.5v8M5 7.5l3 3 3-3M3 13.5h10" />,
  "corner-down-left": <path d="M12 3v5.5H4M6.5 6 4 8.5 6.5 11" />,
  file: <path d="M4 2.5h5l3 3v8H4zM9 2.5v3h3" />,
  sort: <path d="M4.5 3v10M2.5 11l2 2 2-2M11.5 13V3M9.5 5l2-2 2 2" />,
  users: (
    <>
      <circle cx="6" cy="6" r="2.2" />
      <path d="M2.5 13c0-2 1.6-3.2 3.5-3.2S9.5 11 9.5 13" />
      <path d="M10.5 4.2a2.2 2.2 0 0 1 0 4.2M11.5 9.9c1.3.3 2 1.4 2 3.1" />
    </>
  ),
  refresh: <path d="M13 8a5 5 0 1 1-1.6-3.7M13 3v2.5h-2.5" />,
};

interface IconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 16, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
