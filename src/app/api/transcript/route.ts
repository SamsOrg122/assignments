/**
 * Reading a meeting back: one model call over a transcript, one shape of answer.
 *
 * Built as a sibling of `/api/study`, deliberately and almost line for line —
 * same rotation and cool-down, same request guard, same per-account allowance,
 * same forced tool call, no streaming. Not because copying is tidy, but because
 * the two endpoints answer the same kind of question ("here is some text, give
 * me one structured object back") and two different implementations of that
 * would drift into disagreeing about who is allowed to spend money.
 *
 * What is different here is what happens to the answer *afterwards*. A study
 * card that is subtly wrong wastes somebody's revision hour. An appointment
 * that is subtly wrong puts them in the wrong room on the wrong day, or —
 * worse — puts a meeting nobody arranged into a calendar other people read. So
 * this file is much stricter about its output than `/api/study` is:
 *
 *   - every extracted fact must carry the words it came from, and this route
 *     checks that *all* of those words are actually in the transcript, in that
 *     order and next to each other, before it passes the fact on. A quote the
 *     model composed is a fabrication with a citation stapled to it, which is
 *     worse than no citation at all — and a quote that is half heard and half
 *     composed is the same thing with the first half vouching for the second;
 *   - every date is validated against the calendar and against a window around
 *     today, and anything outside it is dropped rather than repaired;
 *   - nothing is repaired — not a date, not a chart with a number missing out
 *     of the middle of it. Facts are dropped whole, and every drop is named in
 *     `dropped` and counted in `droppedTotal`, so the surface can say so out
 *     loud instead of quietly filing four things when the model found six.
 *
 * `runtime` is not exported: "nodejs" is the default and the Edge runtime is
 * deprecated, so the export is now noise the docs ask you to delete. The older
 * routes still carry it; this one does not, rather than copy it forward.
 */

import {
  coolDown,
  describeFailure,
  rotation,
  shouldRotate,
  type Attempt,
} from "@/lib/ai/openrouter/models";
import { overLimit, readBody } from "@/lib/api/guard";
import { chargeOne, overAllowance, whoIsAsking } from "@/lib/api/who";
import { dateOf, keyOf, type DayKey } from "@/lib/agenda/model";
import { daysBetween } from "@/lib/assignments/model";
import { SIMULATED_BANNER } from "@/lib/transcript/model";

export const dynamic = "force-dynamic";

const endpoint = () =>
  (process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1").replace(/\/+$/, "") +
  "/chat/completions";

/**
 * Longer than the other two endpoints' 120s, because the prompt is bigger than
 * theirs by an order of magnitude — an hour of speech is tens of thousands of
 * words, and a model reading all of it before its first token is slow.
 *
 * The platform's own function ceiling still applies on top of this and is
 * usually lower; if a deployment sees this endpoint cut off at a round number
 * of seconds, that ceiling is what it hit, not this.
 */
const TIMEOUT_MS = 180_000;

/**
 * Four a minute. Filing a meeting is something a person does once when the
 * meeting ends, not something they hold down — the only honest reason to want
 * a second one inside a minute is that the first attempt failed, and four
 * leaves room for three retries.
 */
const TRANSCRIPT_LIMIT = { name: "transcript", limit: 4, windowMs: 60_000 };

/**
 * Sized for the thing this is actually for: an hour of continuous speech.
 *
 * A person speaks around 150 words a minute, so an hour is roughly 9,000 words
 * — call it 60,000 characters, and rather more with a timestamp on every line.
 * A two-hour lecture is double that. One megabyte covers both with room to
 * spare while still being far below what somebody with a loop wants to post.
 *
 * WHEN IT IS EXCEEDED: `readBody` refuses with 413 before the body is read into
 * memory, and nothing is charged. That is the right answer rather than a
 * truncation, because a request this large is not a long meeting, it is a
 * mistake or an attack — a real transcript that long has already been cut down
 * by the ceiling below on its way in.
 */
const MAX_REQUEST_BYTES = 1024 * 1024;

/**
 * How much of the transcript the model is shown.
 *
 * Comfortably inside every context window in the rotation, with room for the
 * instructions and the answer.
 *
 * WHEN IT IS EXCEEDED: the middle is dropped, not the end — see `fit`. The
 * amount dropped comes back as `skipped` so the surface can tell the person
 * that part of their recording was not read. It is never silent.
 */
const TRANSCRIPT_CEILING = 240_000;

/** Of what is kept, how much comes from the start. See `fit` for why. */
const HEAD_SHARE = 0.4;

/** Ceilings on the answer, so one confused reply cannot return a novel. */
const MOST_APPOINTMENTS = 40;
const MOST_DEADLINES = 40;
const MOST_TASKS = 60;
const MOST_FIGURES = 8;
const MOST_POINTS = 24;
const MOST_DROPPED = 40;

/**
 * How far from today a resolved date is allowed to land.
 *
 * This is not a policy about what people may schedule. It catches one specific
 * and common failure: a model that cannot work out what "next Tuesday" meant
 * does not usually say so — it anchors the date to the year its training data
 * ends in, and returns a confident-looking day two years in the past. Nothing
 * downstream can tell that apart from a real date, so it is caught here.
 *
 * A year back covers a meeting minuted late; three years forward covers a
 * viva date set at the start of a PhD.
 */
const EARLIEST_DAYS = -400;
const LATEST_DAYS = 1_100;

/** If a start time was given and no end was, the appointment is an hour long. */
const ASSUMED_LENGTH = 60;

const END_OF_DAY = 24 * 60;

/* ── What comes back ─────────────────────────────────────────────────── */

/**
 * `simulated` is present, and only ever `true`, on facts read out of a
 * fabricated transcript — the same convention `Segment` uses, for the same
 * reason: a mark that only exists at the top of the response stops existing
 * the moment somebody destructures one appointment out of the array.
 */
interface Marked {
  simulated?: true;
}

/**
 * What a `quote` on any of the types below is, stated once because a person
 * reads these strings believing they are reading the transcript.
 *
 * It is the model's string, not a slice of the transcript — but `checkQuote`
 * has proved that every word of it appears in the transcript, in this order,
 * with nothing between them and nothing after them that was not also there.
 * What may differ is punctuation, capitalisation, spacing and Unicode
 * compatibility forms, because `flatten` normalises all four away on both
 * sides before comparing.
 *
 * So: the words are the transcript's, character for character it may not be.
 * It is not returned as the matched span because there is no honest span to
 * return — `flatten` is a lossy many-to-one collapse with no offsets to map
 * back through, and the region it matched can begin mid-line and run across a
 * timestamp and a speaker label that were never spoken.
 */
type VerifiedQuote = string;

export interface TranscriptAppointment extends Marked {
  title: string;
  day: DayKey;
  /** Minutes from midnight. */
  start: number;
  end: number;
  /** The words this came from. See `VerifiedQuote` for what is proved. */
  quote: VerifiedQuote;
}

export interface TranscriptDeadline extends Marked {
  title: string;
  due: DayKey;
  /** Minutes from midnight. Absent when no time of day was said. */
  dueMinute?: number;
  quote: VerifiedQuote;
}

export interface TranscriptTask extends Marked {
  title: string;
  day: DayKey;
  quote: VerifiedQuote;
}

export interface TranscriptPoint {
  name: string;
  value: number;
}

export interface TranscriptFigure extends Marked {
  label: string;
  series: TranscriptPoint[];
  /** "%", "hours", "students" — absent when nobody said one. */
  unit?: string;
  quote: VerifiedQuote;
}

/** One fact that did not survive checking, and the reason, for the surface. */
export interface DroppedFact {
  /**
   * "more" is the one row that is not a fact: it stands for the drops past
   * `MOST_DROPPED` that there was no room to name. Without it a capped list
   * reads as a complete one, which is the same silent understatement this
   * route exists to prevent.
   */
  kind: "appointment" | "deadline" | "task" | "figure" | "more";
  /** What the model called it, so a person can tell which one went. */
  title: string;
  why: string;
}

export interface TranscriptReading {
  title: string;
  summary: string;
  conclusion: string;
  appointments: TranscriptAppointment[];
  deadlines: TranscriptDeadline[];
  tasks: TranscriptTask[];
  figures: TranscriptFigure[];
  /**
   * True when these words were never spoken. Nothing derived from a reading
   * with this set may be written to the agenda, the assignments or the
   * account — `assertReal` in `@/lib/transcript` is the gate that enforces it.
   */
  simulated: boolean;
  /** Characters of the transcript the model was not shown. 0 normally. */
  skipped: number;
  /**
   * Everything thrown away, in order, capped at `MOST_DROPPED` rows — and when
   * it is capped the last row is a `"more"` row saying how many are missing,
   * so this array never reads as complete when it is not.
   */
  dropped: DroppedFact[];
  /**
   * How many facts were thrown away altogether. Equal to the number of real
   * rows in `dropped` unless the cap was hit, so a caller can tell "forty
   * dropped" from "forty and then we stopped counting them out".
   */
  droppedTotal: number;
  /** Which model answered. Useful in a bug report, useless otherwise. */
  model: string;
}

/* ── Reading the request ─────────────────────────────────────────────── */

interface Body {
  text?: unknown;
  today?: unknown;
  simulated?: unknown;
}

const asString = (value: unknown, cap: number): string =>
  typeof value === "string" ? value.slice(0, cap).trim() : "";

/**
 * A day key that is also a real day.
 *
 * The shape test alone accepts 2026-02-31 and 2026-13-01. Round-tripping
 * through the calendar rejects both, because `dateOf` rolls them forward and
 * `keyOf` then reports where they actually landed.
 */
function validDay(value: unknown): DayKey | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return keyOf(dateOf(value)) === value ? value : null;
}

const asMinute = (value: unknown, most: number): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const minute = Math.round(value);
  return minute >= 0 && minute <= most ? minute : null;
};

/**
 * Both sides of a quote comparison, reduced to the part that is the words.
 *
 * Punctuation, quote marks, dashes and runs of whitespace go, because a
 * recogniser and a model disagree about all four constantly and none of those
 * disagreements mean the words are different. Letters are kept whatever
 * alphabet they are in — stripping to ASCII would flatten a Greek or Cyrillic
 * transcript to nothing and then every quote in it would "match".
 */
const flatten = (text: string): string =>
  text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s.,;:!?'"“”‘’«»()[\]{}…·•*_/\\|+=@#~^&%$—–\-]+/g, " ")
    .trim();

/**
 * The transcript in the form quotes are checked against: flattened, and padded
 * with a space at each end.
 *
 * The padding is what makes a match land on whole words. Without it "meet next
 * tue" is a substring of "meet next tuesday", and a day truncated into another
 * day would pass the only check there is.
 *
 * Built once per request rather than per quote, because it is a quarter of a
 * megabyte and there can be a hundred and fifty quotes.
 */
const searchable = (text: string): string => ` ${flatten(text)} `;

/**
 * The simulated banner reduced to its words, because that is what a sniff can
 * actually rely on.
 *
 * `SIMULATED_BANNER` is bracketed and carries an em dash. Anything between
 * `transcriptOf()` and here that normalises punctuation — a clipboard round
 * trip, an editor, a caller that tidies text before posting — defeats an exact
 * substring match on it while leaving the words untouched, and the fabricated
 * transcript then arrives looking real. Matching the flattened form survives
 * all of that, and this file already owns `flatten`.
 *
 * It errs towards marking: a real meeting where somebody reads this sentence
 * out loud gets stamped simulated. That is the harmless direction — the mark
 * only ever blocks filing, and `assertReal` is what a person argues with.
 */
const SIMULATED_MARK = flatten(SIMULATED_BANNER);

/** The fewest words that can count as evidence. See `checkQuote`. */
const SHORTEST_QUOTE = 3;

/**
 * Was this actually said? Returns the problem, or null when it was.
 *
 * `spoken` must come from `searchable`. The whole quote has to appear in it —
 * every word, in order, adjacent, on word boundaries. Nothing less.
 *
 * Two failures, kept apart because they mean different things to a person
 * reading the drop list.
 *
 * Too short: "Tuesday", or "by Friday", appears in almost any transcript, so
 * matching it proves nothing. A quote that short is not weak evidence, it is
 * an absence of evidence dressed as some — and the whole reason the quote is
 * required is that somebody has to be able to check the fact against it.
 *
 * Not found: the words were composed rather than heard. There is deliberately
 * no partial credit here, and there used to be — an opening run of words was
 * accepted on the theory that a model which elides ("we'll meet Tuesday ... at
 * two") still starts with real words. It does, and that is exactly the danger:
 * the real opening vouches for whatever follows it. Against the transcript
 * "so uh let's meet next Tuesday, at two, in the small room" that fallback
 * accepted "meet next Thursday", "Tuesday at nine" and "at two thirty" — a
 * fabricated day or time each time, carrying a citation. Every one of those is
 * now thrown away, and the whole item with it.
 *
 * The cost is a true item lost when a model elides against instructions. That
 * is the right way round: a missing appointment is an annoyance somebody in
 * the room notices, and it is named in `dropped` where they can see it. An
 * invented one is in their calendar with a quote under it that reads as proof.
 */
function checkQuote(spoken: string, quote: string): string | null {
  const flat = flatten(quote);
  const words = flat ? flat.split(" ") : [];
  if (words.length < SHORTEST_QUOTE)
    return "the quote was one or two words, which matches almost anything and checks nothing";

  if (spoken.includes(` ${flat} `)) return null;

  return "the words it quoted are not in the transcript, or not all of them are";
}

/**
 * Fit the transcript into the ceiling by dropping the middle.
 *
 * Not the end. In a meeting the decisions are at the end — "so, Tuesday at
 * two, and you'll send the draft by Friday" is the last thing anybody says —
 * and an extractor that reads the first hour and stops has thrown away
 * precisely the part it exists for. The start earns its 40% because that is
 * where the subject is established, which is what the title and summary need.
 *
 * The gap is marked in the text rather than silently closed, so the model can
 * see that words are missing and is told not to invent what was in them.
 */
function fit(text: string): { shown: string; skipped: number } {
  if (text.length <= TRANSCRIPT_CEILING) return { shown: text, skipped: 0 };

  const head = Math.floor(TRANSCRIPT_CEILING * HEAD_SHARE);
  const tail = TRANSCRIPT_CEILING - head;
  const skipped = text.length - TRANSCRIPT_CEILING;

  return {
    shown:
      text.slice(0, head) +
      `\n\n[gap: ${skipped} characters of the middle of this recording are missing here. ` +
      "Nothing from the gap is available to you. Do not guess what was said in it.]\n\n" +
      text.slice(text.length - tail),
    skipped,
  };
}

/* ── The one thing the model is allowed to do ────────────────────────── */

const QUOTE = {
  type: "string",
  description:
    "The words from the transcript this came from, copied exactly as they appear there. " +
    "Not a paraphrase, not a translation, not tidied up, nothing left out of the middle. " +
    "A whole clause — never one or two words. " +
    "Every word of this is checked against the transcript, and the whole item is thrown away " +
    "unless all of them are found there together. Getting the first few words right is not enough.",
};

const TOOL = {
  type: "function" as const,
  function: {
    name: "read_back",
    description: "Return what this conversation was, and what was decided in it.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        title: {
          type: "string",
          description:
            "What this conversation was, in a few words. Name the subject and the people or the group where the transcript says them. Never a date on its own.",
        },
        summary: {
          type: "string",
          description: "What was discussed. A few sentences.",
        },
        conclusion: {
          type: "string",
          description:
            "What was decided, and what was left open. If nothing was decided, say that plainly — it is a real answer, not a gap to fill.",
        },
        appointments: {
          type: "array",
          description: "Meetings arranged in this conversation: a day and a time.",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              title: { type: "string", description: "What the meeting is. A few words." },
              day: { type: "string", description: "YYYY-MM-DD, resolved against today." },
              start: { type: "number", description: "Minutes from midnight. 09:30 is 570." },
              end: {
                type: "number",
                description:
                  "Minutes from midnight. Leave it out if no end time was said; an hour is assumed.",
              },
              quote: QUOTE,
            },
            required: ["title", "day", "start", "quote"],
          },
        },
        deadlines: {
          type: "array",
          description:
            "Things owed to somebody by a date — a chapter, a report, a form, a submission.",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              title: { type: "string", description: "What is owed, and to whom if it was said." },
              due: { type: "string", description: "YYYY-MM-DD, resolved against today." },
              dueMinute: {
                type: "number",
                description:
                  "Minutes from midnight, only if a time of day was actually said. Leave it out otherwise.",
              },
              quote: QUOTE,
            },
            required: ["title", "due", "quote"],
          },
        },
        tasks: {
          type: "array",
          description:
            "Things somebody agreed to do on a day, with no clock time and nothing handed in.",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              title: { type: "string", description: "The action, starting with the verb." },
              day: { type: "string", description: "YYYY-MM-DD, resolved against today." },
              quote: QUOTE,
            },
            required: ["title", "day", "quote"],
          },
        },
        figures: {
          type: "array",
          description:
            "Numbers and targets that were actually said out loud, grouped so they can be compared.",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              label: {
                type: "string",
                description: "What these numbers are, in the words the conversation used.",
              },
              series: {
                type: "array",
                description:
                  "Two or more points. One number on its own is a sentence, not a chart, and it is already in the summary.",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    name: {
                      type: "string",
                      description: "What this number is of — a month, a group, 'now', 'target'.",
                    },
                    value: { type: "number" },
                  },
                  required: ["name", "value"],
                },
              },
              unit: {
                type: "string",
                description: "'%', 'hours', 'students'. Leave it out if nobody said one.",
              },
              quote: QUOTE,
            },
            required: ["label", "series", "quote"],
          },
        },
      },
      required: ["title", "summary", "conclusion", "appointments", "deadlines", "tasks", "figures"],
    },
  },
};

/**
 * The instructions, and why each one is here.
 *
 * Today's date is stated first because everything else depends on it: a
 * transcript is full of "next Tuesday" and "the 14th" and "over twee weken",
 * and without an anchor those are unresolvable. The weekday is given as well
 * as the date, because "next Tuesday" cannot be worked out from a number alone.
 *
 * The instruction that matters most is the one about dropping: a model that is
 * unsure will produce *something* unless it is told, in as many words, that
 * nothing is the correct answer. Here nothing genuinely is — a meeting that is
 * missing from the calendar is noticed by the person who was in the room; a
 * meeting that is in the calendar on the wrong day is not noticed by anyone
 * until they are in the wrong place.
 */
function systemPrompt(today: DayKey): string {
  const weekday = dateOf(today).toLocaleDateString("en-GB", { weekday: "long" });

  return [
    "You read the transcript of a conversation that has just happened and pull out what was actually said in it.",
    "",
    `Today is ${weekday} ${today}. Resolve every date against that.`,
    "",
    "THE THREE PIECES OF WRITING",
    "",
    "title: what this conversation was, in a few words — the subject, and the group or the people if the transcript names them. Somebody scanning a shelf of documents should be able to tell which meeting this was. Never 'Transcript of 12 March': the date is already on the document.",
    "summary: what was discussed. A few sentences. Follow the conversation, not a template.",
    "conclusion: what was decided, and what was left open. If nothing was decided, say so — 'nothing was settled; they agreed to talk again' is a true and useful conclusion. Do not invent a decision to fill the space.",
    "",
    "THE QUOTES",
    "",
    "Every appointment, deadline, task and figure carries the words it came from. Copy them out of the transcript exactly as they appear — the speech is disfluent and that is fine, leave the disfluency in. Do not paraphrase, do not translate, do not tidy the grammar, do not put an ellipsis in the middle.",
    "Quote a whole clause, not a word or two — a quote short enough to appear in any conversation proves nothing about this one.",
    "The quote is checked against the transcript word for word. Every word of it has to be there, in that order, next to each other. An item whose quote starts with real words and then drifts into words nobody said is thrown away exactly like one that was composed from nothing — the item goes with it, however good the item looks.",
    "So quote something short and real rather than something long and nearly right. If you cannot find a clause you can copy, leave the item out.",
    "",
    "THE DATES",
    "",
    "Times are minutes from midnight: 09:30 is 570, 14:00 is 840.",
    "'half three' means 15:30 in English and 14:30 in Dutch ('half vier' is 15:30). Use the language the transcript is in.",
    "'next Tuesday' is the Tuesday of the coming week; a bare 'Tuesday' is the next Tuesday to arrive; 'the 14th' is the 14th of this month if it has not passed and of next month if it has; 'in two weeks' is fourteen days from today.",
    "If you cannot work out which day was meant — the recogniser garbled it, two people said different days, nobody ever said one — leave the item out. Do not pick the likeliest day. A missing appointment is an annoyance; an appointment on the wrong day sends somebody to the wrong place, and nobody finds out until they are standing there.",
    "",
    "WHICH LIST",
    "",
    "appointments: a meeting that was arranged, with a day and a time. This goes into a calendar.",
    "deadlines: something owed to somebody by a date — a chapter, a report, a form. Include a time only if one was said.",
    "tasks: something somebody agreed to do on a day, with no time attached and nothing handed in.",
    "Nothing belongs in two lists. If it was arranged as a meeting it is an appointment, even if somebody has to bring something to it.",
    "",
    "THE NUMBERS",
    "",
    `figures are numbers people actually said — counts, percentages, targets, before-and-after. Label them in the conversation's own words. Between two and ${MOST_POINTS} points to a figure: a single number is a sentence and belongs in your summary instead, and a figure with more points than that is thrown away whole rather than cut short. Every point needs a name and a number. Never compute a number nobody said, and never round one.`,
    "",
    "THE WHOLE RULE UNDERNEATH ALL OF THIS",
    "",
    "Only what is in the transcript. Nothing from your own knowledge, nothing filled in, nothing smoothed over. Empty lists are a good answer for a conversation that decided nothing.",
    "If you see a line marked [gap: ...], words are missing there. Do not guess what was in them.",
    "Write the title, summary and conclusion in the language the transcript is in.",
  ].join("\n");
}

/* ── The route ───────────────────────────────────────────────────────── */

export async function POST(request: Request) {
  const refused = overLimit(request, TRANSCRIPT_LIMIT);
  if (refused) return refused;

  const read = await readBody(request, MAX_REQUEST_BYTES);
  if ("tooLarge" in read) return read.tooLarge;

  const key = process.env.OPENROUTER_API_KEY;
  if (!key)
    return Response.json(
      {
        error:
          "No model is configured on this deployment, so a recording can't be read back. Set OPENROUTER_API_KEY. The transcript itself is safe — nothing has been lost.",
      },
      { status: 501 },
    );

  const who = await whoIsAsking(request);
  if (!who.ok) return who.response;

  const charge = await chargeOne(who.caller);
  if (!charge.allowed) return overAllowance();

  let body: Body;
  try {
    body = JSON.parse(read.text) as Body;
  } catch {
    return Response.json({ error: "Expected JSON." }, { status: 400 });
  }

  /*
   * Today comes from the caller and is checked, never taken on trust and never
   * replaced with this server's own clock. Two reasons, and both of them are
   * wrong answers rather than crashes:
   *
   *   - the server's day is not the speaker's day. A meeting recorded at 00:30
   *     in Amsterdam happens on a date that UTC has not reached yet, and every
   *     "tomorrow" in it would resolve one day early;
   *   - a day key is a string somebody can type. `validDay` rejects the shapes
   *     that are not days at all, so a malformed one becomes a 400 here rather
   *     than a plausible-looking wrong date in a calendar.
   */
  const today = validDay(body.today);
  if (!today)
    return Response.json(
      {
        error:
          "This needs today's date as YYYY-MM-DD to work out what 'next Tuesday' meant. Without it every relative date in the recording is a guess.",
      },
      { status: 400 },
    );

  const transcript = asString(body.text, MAX_REQUEST_BYTES);
  if (transcript.length < 40)
    return Response.json(
      { error: "There isn't enough there to read back." },
      { status: 400 },
    );

  /*
   * Simulated is decided here, from two independent signals, and the caller
   * can only ever turn it on.
   *
   * The banner check is the one that matters: `transcriptOf()` welds
   * SIMULATED_BANNER to the front of a fabricated transcript, so a caller that
   * forgets the flag — or a future caller that only ever passes a string — is
   * still caught. It is matched on its words rather than character for
   * character; see `SIMULATED_MARK` for why that is not a nicety.
   *
   * This route does not refuse a simulated transcript, because a demo path
   * nobody can run end to end is a demo path that rots; what it does instead
   * is stamp every single row it returns, so the mark survives a consumer that
   * pulls one appointment out of the array and forgets the rest of the
   * response existed. `assertReal` in @/lib/transcript remains the gate
   * that actually stops it reaching a calendar.
   */
  const simulated =
    body.simulated === true || flatten(transcript).includes(SIMULATED_MARK);
  const mark: Marked = simulated ? { simulated: true } : {};

  const { shown, skipped } = fit(transcript);
  const spoken = searchable(shown);

  const messages = [
    { role: "system" as const, content: systemPrompt(today) },
    { role: "user" as const, content: shown },
  ];

  const attempts: Attempt[] = [];

  for (const model of rotation()) {
    const upstream = new AbortController();
    const stop = () => upstream.abort();
    request.signal.addEventListener("abort", stop);
    const timeout = setTimeout(stop, TIMEOUT_MS);

    try {
      const response = await fetch(endpoint(), {
        method: "POST",
        signal: upstream.signal,
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "X-Title": "Tougather transcript",
        },
        body: JSON.stringify({
          model,
          messages,
          tools: [TOOL],
          // Forced, like `/api/study`: there is one thing to do here, and an
          // answer in prose is an answer nothing downstream can read.
          tool_choice: { type: "function", function: { name: "read_back" } },
          // Lower than study's 0.2. Most of this is extraction, not writing,
          // and somebody who re-runs a failed attempt should get the same
          // appointments back rather than a second opinion about their week.
          temperature: 0.1,
        }),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        attempts.push({ model, problem: describeFailure(response.status, text) });
        if (!shouldRotate(response.status, text)) break;
        coolDown(model);
        continue;
      }

      const payload = (await response.json()) as {
        choices?: Array<{
          message?: { tool_calls?: Array<{ function?: { arguments?: string } }> };
        }>;
      };
      const args = payload.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
      if (!args) {
        attempts.push({ model, problem: "answered without reading anything back" });
        coolDown(model);
        continue;
      }

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(args) as Record<string, unknown>;
      } catch {
        attempts.push({ model, problem: "answered with something unreadable" });
        coolDown(model);
        continue;
      }

      const title = asString(parsed.title, 200);
      const summary = asString(parsed.summary, 6_000);
      const conclusion = asString(parsed.conclusion, 6_000);

      // The three pieces of writing are the minimum. Everything else can
      // legitimately be empty — a conversation that decided nothing has no
      // appointments — but a reading with no title is not a reading.
      if (!title || !summary || !conclusion) {
        attempts.push({ model, problem: "left out the title, the summary or the conclusion" });
        coolDown(model);
        continue;
      }

      const dropped: DroppedFact[] = [];
      // Counted separately from the list it fills, because the list is capped
      // and the count is not. A caller that only had the list could not tell
      // forty drops from four hundred.
      let droppedTotal = 0;
      const drop = (kind: DroppedFact["kind"], name: string, why: string) => {
        droppedTotal += 1;
        if (dropped.length < MOST_DROPPED)
          dropped.push({ kind, title: name || "(no title)", why });
      };

      /**
       * The two checks every dated fact has to pass, in one place so an
       * appointment and a deadline cannot come to disagree about them.
       *
       * Returns null when the fact should be dropped; it has already been
       * recorded in `dropped` by then.
       */
      const checkDated = (
        kind: DroppedFact["kind"],
        item: Record<string, unknown>,
        dayField: "day" | "due",
      ): { name: string; day: DayKey; quote: string } | null => {
        const name = asString(item.title, 200);
        if (!name) {
          drop(kind, "", "it came back with no title");
          return null;
        }

        const day = validDay(item[dayField]);
        if (!day) {
          drop(kind, name, "the date it gave was not a real date");
          return null;
        }

        const away = daysBetween(today, day);
        if (away < EARLIEST_DAYS || away > LATEST_DAYS) {
          drop(kind, name, `it landed on ${day}, which is nowhere near today — the date was not resolved`);
          return null;
        }

        const quote = asString(item.quote, 600);
        const wrong = checkQuote(spoken, quote);
        if (wrong) {
          drop(kind, name, wrong);
          return null;
        }

        return { name, day, quote };
      };

      const list = (value: unknown): Record<string, unknown>[] =>
        Array.isArray(value) ? (value as Record<string, unknown>[]) : [];

      /* Appointments. */
      const appointments: TranscriptAppointment[] = [];
      for (const item of list(parsed.appointments)) {
        // Over the cap it is recorded as dropped rather than silently cut, so
        // `dropped` is a complete account of what did not come back.
        if (appointments.length >= MOST_APPOINTMENTS) {
          drop("appointment", asString(item?.title, 200), `more than ${MOST_APPOINTMENTS} appointments came back`);
          continue;
        }
        const checked = checkDated("appointment", item ?? {}, "day");
        if (!checked) continue;

        const start = asMinute(item.start, END_OF_DAY - 1);
        if (start === null) {
          drop("appointment", checked.name, "no usable start time — that makes it a task, not a meeting");
          continue;
        }

        // A stated start with no stated end is the normal way people arrange a
        // meeting ("Tuesday at two"), so an hour is assumed rather than the
        // appointment thrown away. This is a guess about a duration, not about
        // a date: the day and the time both came out of the quote, and a
        // person moving the end of an event they can see is a different
        // problem from a person never being told the event exists.
        //
        // An end at or before the start gets the same treatment. An agenda
        // event is minutes from midnight on one day, so it cannot express a
        // meeting that runs past midnight anyway — an hour ending at 24:00 is
        // the closest true thing this can say.
        const stated = asMinute(item.end, END_OF_DAY);
        const end =
          stated !== null && stated > start
            ? stated
            : Math.min(END_OF_DAY, start + ASSUMED_LENGTH);

        appointments.push({
          ...mark,
          title: checked.name,
          day: checked.day,
          start,
          end,
          quote: checked.quote,
        });
      }

      /* Deadlines. */
      const deadlines: TranscriptDeadline[] = [];
      for (const item of list(parsed.deadlines)) {
        if (deadlines.length >= MOST_DEADLINES) {
          drop("deadline", asString(item?.title, 200), `more than ${MOST_DEADLINES} deadlines came back`);
          continue;
        }
        const checked = checkDated("deadline", item ?? {}, "due");
        if (!checked) continue;

        // No time given stays no time given. The assignment list already knows
        // what to do with that (it sorts as end of day); inventing 09:00 would
        // read as though somebody had said it.
        const dueMinute = asMinute(item.dueMinute, END_OF_DAY);

        deadlines.push({
          ...mark,
          title: checked.name,
          due: checked.day,
          ...(dueMinute === null ? {} : { dueMinute }),
          quote: checked.quote,
        });
      }

      /* Tasks. */
      const tasks: TranscriptTask[] = [];
      for (const item of list(parsed.tasks)) {
        if (tasks.length >= MOST_TASKS) {
          drop("task", asString(item?.title, 200), `more than ${MOST_TASKS} tasks came back`);
          continue;
        }
        const checked = checkDated("task", item ?? {}, "day");
        if (!checked) continue;
        tasks.push({
          ...mark,
          title: checked.name,
          day: checked.day,
          quote: checked.quote,
        });
      }

      /* Figures. */
      const figures: TranscriptFigure[] = [];
      for (const item of list(parsed.figures)) {
        const raw = item ?? {};
        if (figures.length >= MOST_FIGURES) {
          drop("figure", asString(raw.label, 160), `more than ${MOST_FIGURES} figures came back`);
          continue;
        }
        const label = asString(raw.label, 160);
        if (!label) {
          drop("figure", "", "it came back with no label");
          continue;
        }

        const quote = asString(raw.quote, 600);
        const wrong = checkQuote(spoken, quote);
        if (wrong) {
          drop("figure", label, wrong);
          continue;
        }

        // A figure is one claim made of several numbers, so it survives whole
        // or not at all. Quietly cutting a point out of the middle of a series
        // — or off the end of it — is a repair, and it is the worst kind: the
        // chart still draws, still looks complete, and now says something
        // nobody said. In a before-and-after the point that would vanish is
        // the last one, which is the target the whole figure was about.
        const points = list(raw.series);
        if (points.length > MOST_POINTS) {
          drop(
            "figure",
            label,
            `it came back with ${points.length} numbers and the chart holds ${MOST_POINTS} — keeping the first ${MOST_POINTS} would have quietly cut off the end of the series`,
          );
          continue;
        }

        const series: TranscriptPoint[] = [];
        let unusable = false;
        for (const point of points) {
          const name = asString(point?.name, 120);
          const value = point?.value;
          if (!name || typeof value !== "number" || !Number.isFinite(value)) {
            unusable = true;
            break;
          }
          series.push({ name, value });
        }
        if (unusable) {
          drop(
            "figure",
            label,
            "one of its numbers came back with no label or no usable value, and a chart with a hole in it reads as complete",
          );
          continue;
        }

        // Two points minimum. One number is a fact, and a fact belongs in the
        // summary; a chart with one bar tells a reader nothing they did not
        // already have and takes up a screen doing it.
        if (series.length < 2) {
          drop("figure", label, "fewer than two numbers, so there is nothing to compare");
          continue;
        }

        const unit = asString(raw.unit, 40);
        figures.push({
          ...mark,
          label,
          series,
          ...(unit ? { unit } : {}),
          quote,
        });
      }

      // A capped list that reads as complete is the understatement this route
      // exists to prevent, so the last row stops being a fact and starts being
      // the count of the ones there was no room for.
      if (droppedTotal > dropped.length) {
        // The last named row gives up its place, so the total stays MOST_DROPPED
        // and the count is never fewer than two.
        dropped.pop();
        const unnamed = droppedTotal - dropped.length;
        dropped.push({
          kind: "more",
          title: `${unnamed} more`,
          why: `the list stops at ${MOST_DROPPED} rows — these were thrown away too, and are not named`,
        });
      }

      const reading: TranscriptReading = {
        title,
        summary,
        conclusion,
        appointments,
        deadlines,
        tasks,
        figures,
        simulated,
        skipped,
        dropped,
        droppedTotal,
        model,
      };

      return Response.json(reading);
    } catch (error) {
      attempts.push({
        model,
        problem: upstream.signal.aborted
          ? "took too long"
          : String((error as Error).message ?? error),
      });
      coolDown(model);
    } finally {
      clearTimeout(timeout);
      request.signal.removeEventListener("abort", stop);
    }
  }

  // Every model named, and what each one said — and a reminder that the
  // recording itself is still on disk, because the first thing a person thinks
  // when this fails is that they have lost the hour they just recorded.
  return Response.json(
    {
      error:
        attempts.length === 0
          ? "No model is configured."
          : `No model could read that recording back. The transcript is still saved. ${attempts
              .map((a) => `${a.model}: ${a.problem}`)
              .join("; ")}`,
    },
    { status: 502 },
  );
}
