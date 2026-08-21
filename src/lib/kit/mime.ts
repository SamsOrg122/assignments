"use client";

/**
 * What kind of thing a file is, for something to draw when there is no
 * picture of it.
 *
 * Deliberately mirrors `mime_of` in `desktop/src-tauri/src/lib.rs`, which is
 * the only place a desktop-dropped file's type is ever decided — and which
 * returns an empty string for anything it does not recognise rather than
 * guessing. This does the same: an unknown type gets the generic file icon
 * and the word "File", not a confident wrong label.
 *
 * The extension is consulted only when the mime is missing or generic.
 * Browsers report `application/octet-stream` for plenty of things they can
 * name perfectly well from the suffix, and the desktop reports `""`.
 */

import type { IconName } from "@/components/ui/Icon";

export type Family =
  | "image"
  | "pdf"
  | "doc"
  | "sheet"
  | "deck"
  | "text"
  | "archive"
  | "font"
  | "audio"
  | "video"
  | "other";

const BY_EXTENSION: Record<string, Family> = {
  pdf: "pdf",
  doc: "doc",
  docx: "doc",
  rtf: "doc",
  odt: "doc",
  pages: "doc",
  csv: "sheet",
  tsv: "sheet",
  xls: "sheet",
  xlsx: "sheet",
  ods: "sheet",
  numbers: "sheet",
  ppt: "deck",
  pptx: "deck",
  odp: "deck",
  key: "deck",
  txt: "text",
  md: "text",
  json: "text",
  xml: "text",
  yml: "text",
  yaml: "text",
  zip: "archive",
  gz: "archive",
  tar: "archive",
  rar: "archive",
  "7z": "archive",
  woff: "font",
  woff2: "font",
  ttf: "font",
  otf: "font",
  png: "image",
  jpg: "image",
  jpeg: "image",
  gif: "image",
  webp: "image",
  svg: "image",
  avif: "image",
  heic: "image",
  mp3: "audio",
  wav: "audio",
  m4a: "audio",
  ogg: "audio",
  mp4: "video",
  mov: "video",
  webm: "video",
  mkv: "video",
};

const extensionOf = (filename: string): string =>
  filename.includes(".") ? (filename.split(".").pop() ?? "").toLowerCase() : "";

export function familyOf(mime: string, filename = ""): Family {
  const type = (mime ?? "").toLowerCase();

  if (type.startsWith("image/")) return "image";
  if (type.startsWith("audio/")) return "audio";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("font/")) return "font";
  if (type === "application/pdf") return "pdf";
  if (type.startsWith("text/")) return "text";
  if (type.includes("wordprocessing") || type === "application/msword") return "doc";
  if (type.includes("spreadsheet") || type === "application/vnd.ms-excel")
    return "sheet";
  if (type.includes("presentation") || type === "application/vnd.ms-powerpoint")
    return "deck";
  if (type.includes("zip") || type.includes("compressed") || type.includes("tar"))
    return "archive";
  if (type === "application/json") return "text";

  // Nothing useful from the type — which for a desktop drop is the normal
  // case, since Rust reports "" rather than inventing one.
  return BY_EXTENSION[extensionOf(filename)] ?? "other";
}

const ICONS: Record<Family, IconName> = {
  image: "image",
  pdf: "file",
  doc: "text",
  sheet: "table",
  deck: "slides",
  text: "quote",
  archive: "group",
  font: "type",
  audio: "mic",
  video: "play",
  other: "file",
};

export const iconFor = (mime: string, filename = ""): IconName =>
  ICONS[familyOf(mime, filename)];

const LABELS: Record<Family, string> = {
  image: "Picture",
  pdf: "PDF",
  doc: "Document",
  sheet: "Spreadsheet",
  deck: "Slides",
  text: "Text",
  archive: "Archive",
  font: "Font",
  audio: "Audio",
  video: "Video",
  other: "File",
};

export const labelFor = (mime: string, filename = ""): string =>
  LABELS[familyOf(mime, filename)];
