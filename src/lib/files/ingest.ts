"use client";

/**
 * File ingestion — "give this to the AI".
 *
 * One seam, `ingestFile(file)`, returning extracted text. What it can read
 * locally it reads properly; what it can't, it says so about rather than
 * storing an empty record that quietly contributes nothing to context.
 *
 * The reading itself is `files/extract`, shared with the notepad's file
 * picker. This module is the part that is about *a message*: minting a
 * record, naming who attached it, and turning a failure into a status
 * somebody can see on the attachment rather than an exception.
 *
 * A server-side extractor — OCR for scanned pages, say — implements the same
 * interface and replaces `setFileExtractor`; nothing above this file changes.
 */

import { uid } from "../factories";
import { LOCAL_USER } from "../realtime";
import { canExtract, extractText } from "./extract";
import type { TeamFile } from "../team/types";

export interface FileExtractor {
  readonly name: string;
  extract(file: File): Promise<{ text: string; note?: string } | null>;
}

/** Anything larger is truncated — context has a budget, and so does storage. */
const MAX_TEXT = 60_000;

const localExtractor: FileExtractor = {
  name: "local",

  async extract(file) {
    if (!canExtract(file.type, file.name)) return null;
    return extractText(
      new Uint8Array(await file.arrayBuffer()),
      file.type,
      file.name,
      MAX_TEXT,
    );
  },
};

let extractor: FileExtractor = localExtractor;

export function setFileExtractor(next: FileExtractor | null) {
  extractor = next ?? localExtractor;
}

export function fileExtractorName(): string {
  return extractor.name;
}

export async function ingestFile(file: File): Promise<TeamFile> {
  const base = {
    id: uid(),
    name: file.name,
    mime: file.type || "application/octet-stream",
    size: file.size,
    uploadedBy: LOCAL_USER.id,
    at: Date.now(),
  };

  try {
    const result = await extractor.extract(file);
    if (!result)
      return {
        ...base,
        text: "",
        status: "unsupported",
        note: `${file.name.split(".").pop()?.toUpperCase() ?? "This type"} needs a server-side extractor`,
      };

    if (!result.text.trim())
      return {
        ...base,
        text: "",
        status: "failed",
        note: "No readable text found",
      };

    return { ...base, text: result.text, status: "ready", note: result.note };
  } catch (error) {
    return {
      ...base,
      text: "",
      status: "failed",
      note: error instanceof Error ? error.message : "Could not read the file",
    };
  }
}
