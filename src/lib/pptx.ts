/**
 * PowerPoint import.
 *
 * A .pptx is a ZIP of XML parts. We unzip it, read `ppt/slides/slideN.xml` in
 * numeric order, and pull the text runs out of each shape. That gets titles,
 * bullets and speaker notes faithfully — which is what survives a rebuild in
 * another tool anyway.
 *
 * What it deliberately does NOT do: reproduce the original theme, images,
 * positioning or animations. Those are bound to PowerPoint's layout model, and
 * a half-copy would look broken. The import says so rather than pretending.
 */

import { unzipSync, strFromU8 } from "fflate";
import { uid } from "./factories";
import type { Slide } from "./types";

export interface ImportedDeck {
  slides: Slide[];
  /** Anything the importer knowingly dropped. */
  skipped: string[];
  slideCount: number;
}

/** Text inside one `<a:p>` paragraph, joined across its runs. */
function paragraphText(paragraphXml: string): string {
  const runs = [...paragraphXml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)].map(
    (m) => decodeXml(m[1]),
  );
  return runs.join("").replace(/\s+/g, " ").trim();
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&");
}

/**
 * Shapes in a slide, each as its paragraphs. The title placeholder is tagged in
 * its `<p:nvSpPr>`, which is how we tell a heading from a bullet without
 * guessing by position.
 */
function readShapes(xml: string): Array<{ isTitle: boolean; lines: string[] }> {
  const shapes: Array<{ isTitle: boolean; lines: string[] }> = [];

  for (const m of xml.matchAll(/<p:sp>([\s\S]*?)<\/p:sp>/g)) {
    const shape = m[1];
    const isTitle = /type="(?:ctr)?[Tt]itle"/.test(shape);
    const lines = [...shape.matchAll(/<a:p>([\s\S]*?)<\/a:p>/g)]
      .map((p) => paragraphText(p[1]))
      .filter(Boolean);
    if (lines.length) shapes.push({ isTitle, lines });
  }

  return shapes;
}

/** Slide files sort lexicographically, which puts slide10 before slide2. */
function slideOrder(a: string, b: string): number {
  const n = (s: string) => Number(/slide(\d+)\.xml$/.exec(s)?.[1] ?? 0);
  return n(a) - n(b);
}

export function importPptx(data: Uint8Array): ImportedDeck {
  const files = unzipSync(data);
  const names = Object.keys(files);

  const slideNames = names
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort(slideOrder);

  if (slideNames.length === 0)
    throw new Error("No slides found — is this a .pptx?");

  const noteNames = new Set(
    names.filter((n) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(n)),
  );

  const skipped: string[] = [];
  if (names.some((n) => /^ppt\/media\//.test(n)))
    skipped.push("images and media");
  if (names.some((n) => /^ppt\/embeddings\//.test(n)))
    skipped.push("embedded objects");
  if (names.some((n) => /^ppt\/charts?\//i.test(n))) skipped.push("charts");
  if (names.some((n) => /^ppt\/theme\//.test(n)))
    skipped.push("the original theme");

  const slides: Slide[] = slideNames.map((name, index) => {
    const xml = strFromU8(files[name]);
    const shapes = readShapes(xml);

    const titleShape = shapes.find((s) => s.isTitle);
    // Without a tagged title, the first line of the first shape is the closest
    // honest guess — and it's what the deck reads as anyway.
    const bodyShapes = shapes.filter((s) => s !== titleShape);

    const title =
      titleShape?.lines.join(" ") ||
      bodyShapes[0]?.lines[0] ||
      `Slide ${index + 1}`;

    const bullets = (titleShape ? bodyShapes : bodyShapes.slice(1))
      .flatMap((s) => s.lines)
      .filter((line) => line !== title);

    // Notes live in a parallel part with the same number.
    const noteName = `ppt/notesSlides/notesSlide${
      /slide(\d+)\.xml$/.exec(name)?.[1]
    }.xml`;
    let note: string | undefined;
    if (noteNames.has(noteName)) {
      const noteXml = strFromU8(files[noteName]);
      const text = readShapes(noteXml)
        .flatMap((s) => s.lines)
        .join(" ")
        .trim();
      // The notes part repeats the slide number as a placeholder shape.
      if (text && text !== String(index + 1)) note = text;
    }

    return {
      id: uid(),
      title,
      bullets: bullets.length ? bullets : [],
      ...(note ? { note } : {}),
    };
  });

  return { slides, skipped, slideCount: slides.length };
}

/** Read a File from an <input type="file"> and import it. */
export async function importPptxFile(file: File): Promise<ImportedDeck> {
  const buffer = await file.arrayBuffer();
  return importPptx(new Uint8Array(buffer));
}
