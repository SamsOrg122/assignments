/**
 * The card a shared link unfurls into.
 *
 * There wasn't one, so every link posted anywhere — a group chat, a class
 * channel, the place this actually spreads — arrived as a bare URL next to a
 * grey box. For a tool that travels by somebody telling somebody else, that
 * is the first impression, and it was blank.
 *
 * One file under the marketing route group gives all twenty pages a card at
 * once; `pageMetadata` needs no change, which is what the note in `seo.ts`
 * pointed at.
 *
 * Drawn with `next/og` rather than exported from a design tool. It renders at
 * request time from the same palette the app uses, so it cannot drift out of
 * step with the product the way a checked-in PNG does — and there is no
 * binary in the repository that somebody has to remember to re-cut.
 */

import { ImageResponse } from "next/og";

export const alt = "Tougather — one place for the work, and it plants trees";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/* The notepad's own palette. Written out rather than imported from the
   stylesheet: this runs on the edge, where there is no CSS to read. */
const VOID = "#16171a";
const SLAB = "#212327";
const INK = "#f4f1ea";
const INK_2 = "#b5b1a9";
const BRASS = "#d9b168";

export default function Card() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: VOID,
          padding: 72,
          // The same low warm light the sign-in screen's wood sits in, so a
          // shared link and the page it opens look like the same product.
          backgroundImage: `radial-gradient(1000px 520px at 22% 8%, rgba(217,177,104,0.16), transparent 70%)`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: 13,
              background: INK,
              color: VOID,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 27,
              fontWeight: 600,
            }}
          >
            T
          </div>
          <div style={{ fontSize: 27, color: INK, fontWeight: 500 }}>Tougather</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div
            style={{
              fontSize: 68,
              lineHeight: 1.08,
              color: INK,
              letterSpacing: -2,
              maxWidth: 900,
            }}
          >
            Documents, spreadsheets, slides and notes — in one place.
          </div>
          <div style={{ fontSize: 27, color: INK_2, maxWidth: 800, lineHeight: 1.4 }}>
            Works offline, works without an account, and a share of what it
            makes goes into the ground.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 9, height: 9, borderRadius: 9, background: BRASS }} />
          <div style={{ fontSize: 23, color: INK_2 }}>tougather.com</div>
          <div
            style={{
              marginLeft: "auto",
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: SLAB,
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 999,
              padding: "10px 20px",
              fontSize: 20,
              color: INK_2,
            }}
          >
            Free to start
          </div>
        </div>
      </div>
    ),
    size,
  );
}
