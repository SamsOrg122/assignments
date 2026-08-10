"use client";

/**
 * Making someone else's HTML safe to render.
 *
 * A view link carries a whole document, and anyone can craft one. The moment
 * this app renders text from a link it did not write, that HTML is hostile
 * input: `<img src=x onerror=…>` in a shared "thesis" would run in the
 * recipient's session, on our origin, next to their own work in localStorage.
 *
 * So nothing arriving from outside is trusted. This walks the parsed tree and
 * rebuilds it from an allowlist — unknown elements are unwrapped rather than
 * dropped, so the words survive even when the markup doesn't, and every
 * attribute has to be named here to live.
 *
 * Allowlist, not blocklist. A blocklist is a list of the attacks someone has
 * already thought of.
 */

/** Elements a document is allowed to be made of. */
const ALLOWED = new Set([
  "p", "br", "strong", "b", "em", "i", "u", "s", "code", "pre",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li", "blockquote", "hr",
  "table", "thead", "tbody", "tr", "th", "td", "caption",
  "span", "figure", "figcaption", "img", "a", "sup", "sub", "mark",
  // Proposed changes, so a document under review survives a share link.
  "ins", "del",
]);

/** Attributes, per element. Everything else — every `on*` — is discarded. */
const ATTRS: Record<string, Set<string>> = {
  a: new Set(["href", "title"]),
  img: new Set(["src", "alt", "width", "height"]),
  // A note's text rides on its marker, and a cross-reference's words ride on
  // its span. Dropping these would let a document survive a share link with
  // every note number intact and every note gone — the sort of failure that
  // only surfaces when somebody prints it.
  sup: new Set(["data-footnote", "data-note", "title", "class", "id", "data-n"]),
  span: new Set(["data-citation", "data-ref", "data-label", "class"]),
  ins: new Set(["data-suggest", "data-by", "class"]),
  del: new Set(["data-suggest", "data-by", "class"]),
  th: new Set(["colspan", "rowspan"]),
  td: new Set(["colspan", "rowspan"]),
};

/**
 * `javascript:` is the obvious one; `data:` is the one people forget, because
 * `data:text/html` is a whole document with scripts in it. Images are the
 * exception — the entire picture story in this app is data URLs — so those are
 * allowed only where the payload is declared to be an image.
 */
function safeUrl(value: string, kind: "link" | "image"): string | null {
  const url = value.trim();
  // Whitespace and control characters are used to smuggle "java\nscript:"
  // past a naive prefix check — browsers strip them before resolving.
  const flat = url.replace(/[\s\u0000-\u001f]/g, "").toLowerCase();
  if (kind === "image")
    return flat.startsWith("data:image/") ||
      flat.startsWith("https://") ||
      flat.startsWith("http://")
      ? url
      : null;
  if (
    flat.startsWith("http://") ||
    flat.startsWith("https://") ||
    flat.startsWith("mailto:") ||
    flat.startsWith("#")
  )
    return url;
  return null;
}

/**
 * Clean a fragment of document HTML.
 *
 * Parsed with DOMParser into a *detached* document, which never runs scripts
 * and never loads a resource — so nothing has happened by the time we start
 * deciding what to keep.
 */
export function sanitizeHtml(html: string): string {
  if (typeof DOMParser === "undefined") return "";
  const doc = new DOMParser().parseFromString(
    `<body>${html}</body>`,
    "text/html",
  );
  clean(doc.body);
  return doc.body.innerHTML;
}

function clean(parent: Element): void {
  for (const node of Array.from(parent.childNodes)) {
    if (node.nodeType === 3) continue; // Text is always fine.
    if (node.nodeType !== 1) {
      // Comments and anything exotic: gone. A comment can hide a conditional
      // that older engines execute.
      node.remove();
      continue;
    }

    const el = node as Element;
    const tag = el.tagName.toLowerCase();

    if (tag === "script" || tag === "style" || tag === "iframe" || tag === "object" || tag === "embed") {
      el.remove();
      continue;
    }

    if (!ALLOWED.has(tag)) {
      // Unwrap: keep the children, lose the element. A stray <div> from a
      // paste shouldn't cost the paragraph inside it.
      clean(el);
      el.replaceWith(...Array.from(el.childNodes));
      continue;
    }

    const permitted = ATTRS[tag];
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (!permitted?.has(name)) {
        el.removeAttribute(attr.name);
        continue;
      }
      if (name === "href" || name === "src") {
        const safe = safeUrl(attr.value, name === "src" ? "image" : "link");
        if (safe === null) el.removeAttribute(attr.name);
        else el.setAttribute(name, safe);
      }
    }

    // A picture whose source was refused is not a picture — leaving the
    // element behind renders a browser's broken-image glyph, which reads as
    // "this document is damaged" rather than "that was never allowed".
    if (tag === "img" && !el.getAttribute("src")) {
      el.remove();
      continue;
    }

    // Same for a link with nowhere to go: keep the words, lose the anchor.
    if (tag === "a" && !el.getAttribute("href")) {
      clean(el);
      el.replaceWith(...Array.from(el.childNodes));
      continue;
    }

    // Links out of a shared document open elsewhere, and never get a handle
    // on the window they came from.
    if (tag === "a") {
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", "noopener noreferrer nofollow");
    }

    clean(el);
  }
}

/** A data URL that is genuinely an image, for the parts of the model that aren't HTML. */
export function safeImageSrc(value: unknown): string {
  return typeof value === "string" ? (safeUrl(value, "image") ?? "") : "";
}
