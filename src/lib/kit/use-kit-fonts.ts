"use client";

/**
 * Hand the kit's fonts back to the browser, every load.
 *
 * `FontFace` registrations don't survive a reload, so without this a document
 * set in a font you brought would quietly fall back to the default after every
 * refresh — which reads as the font having been lost rather than merely not
 * loaded yet.
 */

import { useEffect } from "react";
import { hydrateKit, loadKitFonts, useKit } from ".";

export function useKitFonts() {
  const assets = useKit((s) => s.assets);

  // Rehydrate once; the store uses `skipHydration` like every other one here.
  useEffect(hydrateKit, []);

  // Then register whatever it turned out to hold, and anything added since.
  useEffect(() => {
    void loadKitFonts();
  }, [assets]);
}
