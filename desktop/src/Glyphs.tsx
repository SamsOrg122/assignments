/**
 * The bar's glyphs, drawn here rather than imported.
 *
 * ── WHY THESE EXIST WHEN THE PLAN SAID "WORDS, NOT GLYPHS" ───────────────
 *
 * docs/desktop.md argues for words on the slots and the argument is right:
 * *"a glyph for note is guessable and a glyph for record is guessable, but
 * nothing in the world signals paste whatever is on my clipboard right now"*.
 * That is about comprehension and it stands — the words stay.
 *
 * What it does not settle is what four identical grey words in a row look
 * like, and the answer turned out to be: a debug menu. Nothing said "press
 * me", nothing distinguished one from another before you had read all four,
 * and the eye had no anchor to land on. A glyph beside a word is not a
 * substitute for the word; it is the thing that makes a row of them scannable
 * at a glance instead of readable in a second.
 *
 * So: 16px, 1.5px stroke, `currentColor`, no fills. They inherit the slot's
 * colour, which means the whole state model — muted, hover, active — is
 * carried by one property and the icons cannot drift out of step with their
 * labels.
 *
 * No icon library. Four paths are four paths, and a dependency for them would
 * be larger than the binary they live in deserves.
 */

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function Svg({ children }: { children: React.ReactNode }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="glyph"
    >
      {children}
    </svg>
  );
}

/** A pen over a line: writing, not "a document". */
function Note() {
  return (
    <Svg>
      <path {...STROKE} d="M11.2 2.4 13.6 4.8 6 12.4l-3 .6.6-3z" />
      <path {...STROKE} d="M2.4 14.4h11.2" />
    </Svg>
  );
}

/** A microphone, the one glyph in this set nobody has to learn. */
function Record() {
  return (
    <Svg>
      <rect {...STROKE} x="6" y="1.6" width="4" height="7.2" rx="2" />
      <path {...STROKE} d="M3.6 7.2a4.4 4.4 0 0 0 8.8 0" />
      <path {...STROKE} d="M8 11.6v2.8" />
    </Svg>
  );
}

/** Two sheets, one behind the other: a copy of something that already exists. */
function Keep() {
  return (
    <Svg>
      <rect {...STROKE} x="5.6" y="5.6" width="8.4" height="8.4" rx="1.6" />
      <path {...STROKE} d="M2.8 10.4H2.4a.8.8 0 0 1-.8-.8V2.4a.8.8 0 0 1 .8-.8h7.2a.8.8 0 0 1 .8.8v.4" />
    </Svg>
  );
}

/** An arrow going down into a tray: the direction is the whole meaning. */
function Drop() {
  return (
    <Svg>
      <path {...STROKE} d="M8 1.6v7.2" />
      <path {...STROKE} d="m5.2 6.4 2.8 2.8 2.8-2.8" />
      <path {...STROKE} d="M2 10.8v1.6a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-1.6" />
    </Svg>
  );
}

/** Ask: a spark, matching the web app's assistant. */
function Ask() {
  return (
    <Svg>
      <path {...STROKE} d="M8 2.2 9.4 6.6 13.8 8l-4.4 1.4L8 13.8l-1.4-4.4L2.2 8l4.4-1.4z" />
    </Svg>
  );
}

/** The notes list. */
function List() {
  return (
    <Svg>
      <path {...STROKE} d="M3 4.4h10M3 8h10M3 11.6h6.4" />
    </Svg>
  );
}

/** A new note. */
function Plus() {
  return (
    <Svg>
      <path {...STROKE} d="M8 3.2v9.6M3.2 8h9.6" />
    </Svg>
  );
}

/** Put away: down and out of the way, not "close" and not "minimise to a bar
 *  that is already a bar". A chevron pointing up says where it goes. */
function Away() {
  return (
    <Svg>
      <path {...STROKE} d="m4.4 9.6 3.6-3.6 3.6 3.6" />
    </Svg>
  );
}

/** By slot id, so `slots.json` stays the only place a slot is declared. */
export const SLOT_GLYPH: Record<string, () => React.ReactElement> = {
  note: Note,
  record: Record,
  keep: Keep,
  drop: Drop,
};

export { Ask, Away, List, Plus };
