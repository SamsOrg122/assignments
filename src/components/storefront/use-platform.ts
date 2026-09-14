"use client";

import { useEffect, useState } from "react";
import { guessPlatform, type PlatformId } from "@/lib/browser";

/**
 * Which build this visitor wants, resolved after mount.
 *
 * One hook, imported by both the storefront's button and the download page's
 * list, because the two must agree: the big button offers one platform and
 * the list underneath hides that same one, and two copies of this would
 * eventually differ by a render. They already did — this file exists because
 * the storefront grew a second copy and nothing would have caught it.
 *
 * ── NEVER DURING RENDER ─────────────────────────────────────────────────
 * The server has no `navigator`, so a lazy initialiser that read it would
 * hand the server one label and the browser another. React repairs that by
 * throwing away the markup it was given, which on a landing page is the most
 * expensive thing you can do to a first paint. So the button draws the
 * commonest platform and corrects on the first commit, and the correction is
 * a word changing rather than a layout moving, because every label is the
 * same shape.
 *
 * The microtask is this repository's convention for a first-commit state
 * write: setting state straight from an effect body cascades a render, and
 * the lint says so.
 */
export function usePlatform(): PlatformId {
  const [platform, setPlatform] = useState<PlatformId>("windows");
  useEffect(() => {
    void Promise.resolve().then(() => setPlatform(guessPlatform()));
  }, []);
  return platform;
}
