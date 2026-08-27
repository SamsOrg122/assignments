"use client";

/**
 * Where a transcript stops being words and starts being things that exist.
 *
 * `/api/transcript` reads a recording once and answers with what it heard
 * decided, every fact carrying the sentence it came from. This file is what
 * happens next: a document in the library carrying the label `transcript`, an
 * event in the agenda, a task on the day it is due, an assignment on the
 * board — real rows, in the world the person is looking at, immediately.
 *
 * Three rules hold the whole file up.
 *
 * 1. **Nothing is filed from a transcript nobody spoke.** `lib/speech`'s
 *    `listen()` falls back to a mock that *invents* a monologue, complete with
 *    invented figures. The recorder refuses that path, but the refusal is not
 *    what this file relies on: a simulated recording still gets a document
 *    (the demo has to be demoable) and gets *nothing else* — no event, no
 *    task, no assignment, nothing pushed to the account. Every finding is
 *    still listed on the receipt, marked as withheld and why, so the demo
 *    shows the whole pipeline without a fabricated appointment ever reaching
 *    a real calendar. Three independent things have to agree that the words
 *    were real before anything is written: the recording's own provenance,
 *    the reading's `simulated` flag, and the absence of a `simulated` mark on
 *    every individual fact. `assertReal()` is then called immediately before
 *    the first write, as the gate that throws if this reasoning is ever
 *    edited away.
 *
 * 2. **Everything created is recorded, with the words it came from.** Each row
 *    written here is remembered in a `Landing` together with its quote, and
 *    handed to `components/transcript/Receipt` — which opens the moment this
 *    returns. A thing that appeared in somebody's calendar without them typing
 *    it has to be traceable to a sentence and removable in one press.
 *
 * 3. **Nothing is repaired.** A day that is not a real date, a figure with no
 *    numbers in it, an appointment with no title: dropped, with the reason,
 *    onto the same list the endpoint's own drops go on. The rule the study
 *    endpoint follows, for the same reason — a subtly wrong appointment is
 *    worse than a missing one, because a missing one is obvious.
 *
 * The document's transcript block is built from `stampedTranscriptOf()`
 * rather than from `recording.segments`, on purpose: that function welds
 * `SIMULATED_BANNER` to the front of fabricated words, and building the block
 * out of the segments myself would be a second place where the banner could
 * be forgotten.
 */

import { create } from "zustand";
import { createEvent, createTask, deleteEvent, deleteTask } from "@/lib/agenda";
import { clock, dateOf, keyOf, type DayKey } from "@/lib/agenda/model";
import { createAssignment, deleteAssignment } from "@/lib/assignments";
import {
  createChartBlock,
  createTableBlock,
  createTextBlock,
  escapeHtml,
  uid,
} from "@/lib/factories";
import { formatDate, formatNumber } from "@/lib/format";
import { currentWorld } from "@/lib/scope";
import { useProjects } from "@/lib/store";
import type { Block, ChartBlock, Column, Row, TableBlock } from "@/lib/types";
import {
  assertReal,
  clockOf,
  elapsedMs,
  isSimulated,
  linkRecording,
  stampedTranscriptOf,
  titleOf,
  wordCount,
  type Recording,
} from "@/lib/transcript";
import {
  setTranscriptSink,
  type TranscriptContext,
  type TranscriptOutcome,
} from "@/components/transcript/Recorder";

/* ── What the model found ────────────────────────────────────────────── */

/**
 * The shape `/api/transcript` answers in, declared here rather than imported
 * from the route.
 *
 * Structurally identical, so a `TranscriptReading` passes straight into
 * `land()` with no adapter — but every field is optional here and every union
 * is widened, because this file has to survive a reading that is a version
 * behind, hand-written in a test, or produced by something else entirely. A
 * type import would also tie a client module to a server route's file path
 * for no benefit at runtime, since types are erased.
 */
interface Marked {
  /** Present, and only ever `true`, on a fact read out of fabricated words. */
  simulated?: true;
  /** The words in the transcript this came from. The endpoint verifies it. */
  quote?: string;
}

/** A meeting arranged in the conversation: a day and a time. */
export interface FoundAppointment extends Marked {
  title: string;
  day: DayKey;
  /** Minutes from midnight, or `"HH:MM"` — both are accepted. */
  start: number | string;
  /** Defaults to an hour after `start`. */
  end?: number | string;
}

/** Something owed by a date. */
export interface FoundDeadline extends Marked {
  title: string;
  due: DayKey;
  /** Minutes from midnight, or `"HH:MM"`, when a time of day was said. */
  dueMinute?: number | string;
}

/** Something to do on a day, with no time attached. */
export interface FoundTask extends Marked {
  title: string;
  day: DayKey;
}

/** One number that was said, and what it was a number of. */
export interface FoundPoint {
  name: string;
  value: number;
}

/** One measured thing, and the numbers given for it. */
export interface FoundFigure extends Marked {
  label: string;
  series: FoundPoint[];
  /** "%", "hours", "students" — absent when nobody said one. */
  unit?: string;
}

/** One fact that did not survive checking, and why. */
export interface DroppedFact {
  title: string;
  why: string;
}

/** Everything one pass over one transcript produced. All of it optional. */
export interface Findings {
  title?: string;
  summary?: string;
  conclusion?: string;
  appointments?: FoundAppointment[];
  deadlines?: FoundDeadline[];
  tasks?: FoundTask[];
  figures?: FoundFigure[];
  /** True when these words were never spoken. Nothing is filed from them. */
  simulated?: boolean;
  /** Characters of the transcript the model was not shown. 0 normally. */
  skipped?: number;
  dropped?: DroppedFact[];
  /** Which model answered. Provenance, kept on the document. */
  model?: string;
}

/* ── What landed ─────────────────────────────────────────────────────── */

export type LandedKind = "document" | "figures" | "event" | "task" | "assignment";

export interface LandedItem {
  /** This row's own id — not the id of the thing it made. */
  id: string;
  kind: LandedKind;
  /** The event, task, assignment, project or block that was created. */
  targetId: string;
  /** A second block to take with it — the chart that reads the table. */
  alsoId?: string;
  title: string;
  /** Where it went, in words: a date, a time, a count. */
  detail: string;
  /** The transcript lines it came from, one per line. "" when none was given. */
  quote: string;
  /** Found, but deliberately not written. See `reason`. */
  withheld?: boolean;
  /** Why it was withheld, in one plain sentence. */
  reason?: string;
  /** Taken back out of the world by the receipt. */
  removed?: boolean;
}

export interface Landing {
  recordingId: string;
  projectId: string;
  title: string;
  /** True when nobody said any of this. Drives everything the receipt says. */
  simulated: boolean;
  words: number;
  /** How long the recording ran, as `mm:ss`. */
  length: string;
  /** Characters of the transcript the model never saw. */
  skipped: number;
  /** Which model read it, if it said. */
  model: string;
  /** Facts thrown away, here or by the endpoint, and why. */
  dropped: DroppedFact[];
  items: LandedItem[];
  at: number;
}

interface ReceiptState {
  landing: Landing | null;
  open: boolean;
}

/**
 * The receipt's state, outside React because `land()` is not a component and
 * the panel that reads this hosts itself. One landing at a time: a second
 * recording finishing replaces the first, and the first one's rows are already
 * in the agenda where they can be dealt with normally.
 */
export const useReceipt = create<ReceiptState>()(() => ({
  landing: null,
  open: false,
}));

export const closeReceipt = (): void => useReceipt.setState({ open: false });

/* ── Landing ─────────────────────────────────────────────────────────── */

/**
 * A model that loops can produce two hundred appointments from a sentence.
 * These are the ceilings past which the answer is not a meeting's worth of
 * decisions any more, and writing them all into a calendar would be the
 * damage rather than the feature.
 */
const MOST_APPOINTMENTS = 40;
const MOST_TASKS = 40;
const MOST_DEADLINES = 40;
const MOST_SERIES = 8;
const MOST_ROWS = 200;

/** One colour for everything one recording produced, so a week view shows the
 *  meeting's output as a set rather than as six unrelated blocks. */
const TRANSCRIPT_COLOUR = "blue" as const;

/**
 * Make the document, file the findings, open the receipt.
 *
 * Returns what the recording bar shows: the document to open and what it is
 * called. Throwing is safe — the bar keeps the transcript and offers it for
 * copying — but this only throws if the store itself does, because every
 * unusable finding is dropped rather than raised.
 */
export function land(
  recording: Recording,
  findings: Findings,
  context: TranscriptContext = { originProjectId: null },
): TranscriptOutcome {
  const simulated = simulatedAnywhere(recording, findings);
  const title = text(findings.title, 160) || titleOf(recording);
  const dropped: DroppedFact[] = (
    Array.isArray(findings.dropped) ? findings.dropped : []
  )
    .map((fact) => ({ title: text(fact?.title, 200), why: text(fact?.why, 300) }))
    .filter((fact) => fact.why);

  const figures = tableOf(findings.figures, dropped);
  const projectId = writeDocument(
    recording,
    title,
    findings,
    figures,
    simulated,
    context.originProjectId,
  );

  // Provenance, not a link anybody clicks: the recording remembers which
  // document was made from it, and the receipt uses it to undo the document.
  linkRecording(recording.id, projectId);

  const items: LandedItem[] = [
    {
      id: uid(),
      kind: "document",
      targetId: projectId,
      title,
      detail: "in your library, labelled transcript",
      quote: "",
    },
  ];

  if (figures) {
    items.push({
      id: uid(),
      kind: "figures",
      targetId: figures.table.id,
      alsoId: figures.chart?.id,
      title: figures.table.title ?? "Figures",
      detail: `${figures.table.rows.length} rows, and a chart reading them`,
      quote: figures.quotes.join("\n"),
    });
  }

  const scope = currentWorld();

  // The gate. Everything below this line writes to somebody's real calendar,
  // real assignments and real account, so the last thing that happens before
  // the first write is the check that throws on fabricated words. Simulated
  // recordings never get here — they are listed as withheld instead — and this
  // call is what makes that a fact rather than an intention.
  if (!simulated) assertReal(recording);

  for (const found of listOf(findings.appointments, MOST_APPOINTMENTS, dropped)) {
    const appointment = appointmentRow(found, dropped);
    if (!appointment) continue;
    if (simulated) {
      items.push(withheld(appointment.item));
      continue;
    }
    const event = createEvent({
      title: appointment.title,
      day: appointment.day,
      start: appointment.start,
      end: appointment.end,
      color: TRANSCRIPT_COLOUR,
      notes: noteOf(appointment.item.quote, title, recording.day),
      scope,
    });
    items.push({ ...appointment.item, targetId: event.id });
  }

  for (const found of listOf(findings.tasks, MOST_TASKS, dropped)) {
    const taskTitle = text(found.title, 200);
    const day = dayOf(found.day);
    if (!taskTitle || !day) {
      dropped.push({
        title: taskTitle || "a task",
        why: taskTitle ? "the day it gave was not a real date" : "it had no title",
      });
      continue;
    }
    const item: LandedItem = {
      id: uid(),
      kind: "task",
      targetId: "",
      title: taskTitle,
      detail: `on ${formatDate(dateOf(day))}`,
      quote: text(found.quote, 400),
    };
    if (simulated) {
      items.push(withheld(item));
      continue;
    }
    // A task carries no notes field, so its quote lives on the receipt only.
    // Deliberate: an agenda task is one line by design, and widening the type
    // to hold provenance would change what a task is for every other caller.
    const task = createTask({ title: taskTitle, day, scope });
    items.push({ ...item, targetId: task.id });
  }

  for (const found of listOf(findings.deadlines, MOST_DEADLINES, dropped)) {
    const dueTitle = text(found.title, 200);
    const due = dayOf(found.due);
    if (!dueTitle || !due) {
      dropped.push({
        title: dueTitle || "a deadline",
        why: dueTitle ? "the date it gave was not a real day" : "it had no title",
      });
      continue;
    }
    const dueMinute = minuteOf(found.dueMinute, null);
    const item: LandedItem = {
      id: uid(),
      kind: "assignment",
      targetId: "",
      title: dueTitle,
      detail:
        `due ${formatDate(dateOf(due))}` +
        (dueMinute === null ? "" : `, ${clock(dueMinute)}`),
      quote: text(found.quote, 400),
    };
    if (simulated) {
      items.push(withheld(item));
      continue;
    }
    const assignment = createAssignment({
      title: dueTitle,
      due,
      dueMinute: dueMinute ?? undefined,
      // The quote goes in the notes as well as on the receipt: the receipt is
      // for the next minute, the notes are for the week after, when somebody
      // asks where this deadline came from. `projectId` is deliberately not
      // set — that field means "the document being written for it", and a
      // transcript is not that document.
      notes: noteOf(item.quote, title, recording.day),
      scope,
    });
    items.push({ ...item, targetId: assignment.id });
  }

  useReceipt.setState({
    landing: {
      recordingId: recording.id,
      projectId,
      title,
      simulated,
      words: wordCount(recording),
      length: clockOf(elapsedMs(recording, recording.endedAt ?? Date.now())),
      skipped: Math.max(
        0,
        typeof findings.skipped === "number" ? Math.round(findings.skipped) : 0,
      ),
      model: text(findings.model, 120),
      dropped,
      items,
      at: Date.now(),
    },
    open: true,
  });
  showReceipt();
  return { projectId, title };
}

/**
 * Wire the recorder's document seam to this file.
 *
 * `read` is the model pass — one call, one transcript, one answer. Registering
 * from here rather than importing the model pass into this file keeps the
 * direction of dependency honest: this module knows how to write things down
 * and nothing about how they were found.
 */
export function landRecordings(
  read: (recording: Recording) => Promise<Findings>,
): void {
  setTranscriptSink(async (recording, context) =>
    land(recording, await read(recording), context),
  );
}

/**
 * Was any of this fabricated?
 *
 * Three independent answers, and any one of them saying yes is enough. The
 * recording knows what opened the microphone; the reading knows what it was
 * told; and each individual fact carries its own mark, which is the one that
 * survives a reading being taken apart and put back together by something in
 * between.
 */
function simulatedAnywhere(recording: Recording, findings: Findings): boolean {
  if (isSimulated(recording) || findings.simulated === true) return true;
  const marked = (list: Marked[] | undefined): boolean =>
    Array.isArray(list) && list.some((item) => item?.simulated);
  return (
    marked(findings.appointments) ||
    marked(findings.deadlines) ||
    marked(findings.tasks) ||
    marked(findings.figures)
  );
}

/* ── Undoing ─────────────────────────────────────────────────────────── */

/**
 * Take one landed thing back out of the world.
 *
 * The row stays on the receipt, marked, rather than vanishing: somebody
 * pressing this three times in a row needs to see which three they pressed.
 * Removal is final — an event deleted here is a tombstone in the account, and
 * putting it back would be a new row with a new id pretending to be the old
 * one.
 */
export function unland(itemId: string): void {
  const landing = useReceipt.getState().landing;
  const item = landing?.items.find((i) => i.id === itemId);
  if (!landing || !item || item.removed || item.withheld) return;

  switch (item.kind) {
    case "event":
      deleteEvent(item.targetId);
      break;
    case "task":
      deleteTask(item.targetId);
      break;
    case "assignment":
      deleteAssignment(item.targetId);
      break;
    case "figures": {
      // The chart first: it reads the table through `sourceId`, and removing
      // the table first would leave it unbound for a frame.
      const projects = useProjects.getState();
      if (item.alsoId) projects.removeBlock(landing.projectId, item.alsoId);
      projects.removeBlock(landing.projectId, item.targetId);
      break;
    }
    case "document":
      useProjects.getState().deleteProject(item.targetId);
      // The recording no longer points at a document that is not there.
      linkRecording(landing.recordingId, undefined);
      break;
  }

  useReceipt.setState({
    landing: {
      ...landing,
      items: landing.items.map((i) =>
        i.id === itemId ? { ...i, removed: true } : i,
      ),
    },
  });
}

/* ── The document ────────────────────────────────────────────────────── */

interface Figures {
  table: TableBlock;
  chart: ChartBlock | null;
  /** The transcript lines the numbers came from, deduplicated. */
  quotes: string[];
}

function writeDocument(
  recording: Recording,
  title: string,
  findings: Findings,
  figures: Figures | null,
  simulated: boolean,
  originProjectId: string | null,
): string {
  const projects = useProjects.getState();
  const projectId = projects.addProject("doc", title);
  projects.setLabels(projectId, ["transcript"]);

  const from = originProjectId
    ? (projects.projects.find((p) => p.id === originProjectId)?.name ?? null)
    : null;
  const blocks: Block[] = [
    createTextBlock(headHtml(recording, title, findings, simulated, from)),
  ];

  const summary = paragraphs(text(findings.summary, 8_000));
  if (summary) blocks.push(createTextBlock(`<h2>Summary</h2>${summary}`));

  const conclusion = paragraphs(text(findings.conclusion, 8_000));
  if (conclusion) blocks.push(createTextBlock(`<h2>Conclusion</h2>${conclusion}`));

  if (figures) {
    blocks.push(figures.table);
    if (figures.chart) blocks.push(figures.chart);
  }

  blocks.push(createTextBlock(`<h2>Transcript</h2>${transcriptHtml(recording)}`));

  // One commit rather than a block at a time: a document arriving in six
  // writes is six renders and six entries for anything watching the store.
  projects.setBlocks(projectId, blocks);
  return projectId;
}

/** The title, and the plain facts of where the words came from. */
function headHtml(
  recording: Recording,
  title: string,
  findings: Findings,
  simulated: boolean,
  from: string | null,
): string {
  const when = `${formatDate(dateOf(recording.day))}, ${clock(recording.startMinute)}`;
  const length = clockOf(elapsedMs(recording, recording.endedAt ?? Date.now()));
  const words = formatNumber(wordCount(recording));
  const origin = simulated
    ? `Simulated ${when} · ${length} · ${words} words. Nobody said any of this, and nothing was filed from it.`
    : `Recorded ${when} · ${length} · ${words} words. Written from speech recognition, so it mishears.`;
  // Which model read it, and what the recorder was started from. Provenance
  // that outlives the receipt: the panel is gone in a minute, the document is
  // what somebody opens in a month.
  const model = text(findings.model, 120);
  const rest = [
    from ? `Started from “${from}”.` : "",
    model ? `Read by ${model}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return `<h1>${escapeHtml(title)}</h1><p>${escapeHtml(
    rest ? `${origin} ${rest}` : origin,
  )}</p>`;
}

/**
 * The transcript, one paragraph per utterance, stamped.
 *
 * Built from `stampedTranscriptOf()` rather than from the segments, so a
 * simulated recording carries its banner into the document by construction
 * rather than by this function remembering to add one.
 */
function transcriptHtml(recording: Recording): string {
  const lines = stampedTranscriptOf(recording)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return "<p>Nothing was heard.</p>";
  return lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("");
}

/* ── Figures ─────────────────────────────────────────────────────────── */

/**
 * The numbers as a table, and a chart bound to it.
 *
 * The endpoint answers with a list of measured things, each with its own
 * named points ("sign-ups": June 24, July 31). One table holds all of them:
 * a first column of point names in the order they were first said, then a
 * column per figure. Where a figure has no number for a name the cell is
 * empty — a gap is a gap, and filling it with a zero would be inventing a
 * figure, which is the one thing this whole feature may not do.
 *
 * `createTableBlock()` is used for its shape and then emptied: its seeded
 * rows are demo data ("Alpha", "Beta", "Gamma") and leaving even one of them
 * in a document made from a real meeting would be a fabricated number.
 *
 * The chart holds the table's `id` in `sourceId` and column ids for its axes —
 * it never copies the values — so editing a number in the table redraws the
 * chart on the next commit.
 */
function tableOf(
  found: FoundFigure[] | undefined,
  dropped: DroppedFact[],
): Figures | null {
  if (!Array.isArray(found) || found.length === 0) return null;

  const usable: Array<{
    label: string;
    points: FoundPoint[];
    unit: string;
    quote: string;
  }> = [];
  for (const figure of found.slice(0, MOST_SERIES)) {
    const label = text(figure?.label, 60);
    const points = (Array.isArray(figure?.series) ? figure.series : [])
      .filter(
        (point) =>
          typeof point?.value === "number" &&
          Number.isFinite(point.value) &&
          text(point?.name, 60),
      )
      .map((point) => ({ name: text(point.name, 60), value: point.value }));
    if (!label || points.length === 0) {
      dropped.push({
        title: label || "a set of figures",
        why: label
          ? "none of its numbers came through as numbers"
          : "it had no name",
      });
      continue;
    }
    usable.push({ label, points, unit: text(figure?.unit, 16), quote: text(figure?.quote, 400) });
  }
  if (usable.length === 0) return null;

  const names: string[] = [];
  for (const figure of usable)
    for (const point of figure.points)
      if (!names.includes(point.name) && names.length < MOST_ROWS)
        names.push(point.name);

  const first: Column = { id: uid(), name: "Item", type: "text" };
  const columns: Column[] = [
    first,
    ...usable.map((figure) => ({
      id: uid(),
      name: figure.unit ? `${figure.label} (${figure.unit})` : figure.label,
      type: "number" as const,
    })),
  ];

  const rows: Row[] = names.map((name) => ({
    id: uid(),
    cells: {
      [first.id]: name,
      ...Object.fromEntries(
        usable.map((figure, i) => [
          columns[i + 1].id,
          figure.points.find((point) => point.name === name)?.value ?? null,
        ]),
      ),
    },
  }));

  const label = usable.length === 1 ? usable[0].label : "Figures";
  const table: TableBlock = {
    ...createTableBlock(),
    title: label,
    columns,
    rows,
  };
  const chart: ChartBlock = {
    ...createChartBlock(table),
    title: label,
    // Bars, not a line: the points are named things ("June", "target", "now"),
    // and a line drawn between named things claims a continuity nobody said.
    kind: "bar",
    xColumnId: first.id,
    yColumnIds: columns.slice(1).map((column) => column.id),
  };

  const quotes = [...new Set(usable.map((figure) => figure.quote).filter(Boolean))];
  return { table, chart, quotes };
}

/* ── Reading one finding ─────────────────────────────────────────────── */

interface AppointmentRow {
  item: LandedItem;
  title: string;
  day: DayKey;
  start: number;
  end: number;
}

function appointmentRow(
  found: FoundAppointment,
  dropped: DroppedFact[],
): AppointmentRow | null {
  const title = text(found.title, 200);
  const day = dayOf(found.day);
  const start = minuteOf(found.start, null);
  if (!title || !day || start === null) {
    dropped.push({
      title: title || "an appointment",
      why: !title
        ? "it had no title"
        : !day
          ? "the day it gave was not a real date"
          : "it had no time of day",
    });
    return null;
  }
  // An hour is the length of the meeting nobody said the end of. Five minutes
  // is the floor, so an end that came back at or before the start still makes
  // a block somebody can see rather than a line of zero height.
  const end = Math.min(
    24 * 60,
    Math.max(start + 5, minuteOf(found.end, start + 60) ?? start + 60),
  );
  return {
    item: {
      id: uid(),
      kind: "event",
      targetId: "",
      title,
      detail: `${formatDate(dateOf(day))}, ${clock(start)}–${clock(end)}`,
      quote: text(found.quote, 400),
    },
    title,
    day,
    start,
    end,
  };
}

/** The note left on the row itself, so the origin outlives the receipt. */
function noteOf(quote: string, documentTitle: string, day: DayKey): string {
  const when = formatDate(dateOf(day));
  return quote
    ? `Heard in “${documentTitle}”, ${when}: “${quote}”`
    : `From “${documentTitle}”, ${when}.`;
}

const withheld = (item: LandedItem): LandedItem => ({
  ...item,
  withheld: true,
  reason: "Not filed — the transcript was simulated, so nobody asked for this.",
});

/* ── Reading the model's answers defensively ─────────────────────────── */

/** Trimmed, capped, and "" for anything that is not a string. */
function text(value: unknown, cap: number): string {
  return typeof value === "string" ? value.trim().slice(0, cap) : "";
}

/** The first `most` real entries, with anything past the ceiling counted. */
function listOf<T>(
  value: T[] | undefined,
  most: number,
  dropped: DroppedFact[],
): T[] {
  if (!Array.isArray(value)) return [];
  const kept = value.filter((item): item is T => Boolean(item)).slice(0, most);
  if (value.length > kept.length)
    dropped.push({
      title: `${value.length - kept.length} more`,
      why: `only the first ${most} of one kind are filed from one recording`,
    });
  return kept;
}

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A day key, or null.
 *
 * The shape check is not enough on its own: a model will answer "2026-02-31"
 * with a straight face, and `dateOf` would roll it into March rather than
 * refusing. Round-tripping through the agenda's own parser is what catches it,
 * and a date that does not survive the round trip is dropped rather than
 * corrected — nobody can guess which day was meant.
 */
function dayOf(value: unknown): DayKey | null {
  const key = text(value, 10);
  if (!DAY_KEY.test(key)) return null;
  return keyOf(dateOf(key)) === key ? key : null;
}

/** Minutes from midnight, from a number or from `"HH:MM"`. */
function minuteOf(value: unknown, fallback: number | null): number | null {
  if (typeof value === "number" && Number.isFinite(value))
    return clampMinute(Math.round(value));
  if (typeof value === "string") {
    const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
    if (match) {
      const minutes = Number(match[1]) * 60 + Number(match[2]);
      if (Number(match[2]) < 60 && minutes <= 24 * 60) return clampMinute(minutes);
    }
  }
  return fallback;
}

const clampMinute = (minutes: number): number =>
  Math.max(0, Math.min(24 * 60, minutes));

/** Escaped paragraphs from plain text the model wrote. */
function paragraphs(source: string): string {
  return source
    .split(/\n{2,}/)
    .map((block) => block.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block)}</p>`)
    .join("");
}

/* ── Putting the panel on screen ─────────────────────────────────────── */

/**
 * The receipt hosts itself.
 *
 * `AppShell` belongs to the recording bar and has no slot for this panel, and
 * a receipt that is never mounted is the same as no receipt at all — so the
 * panel opens its own root next to the app's. Dynamically imported, because
 * this module is plain logic that a test or a server component can read
 * without dragging React DOM in behind it.
 */
function showReceipt(): void {
  if (typeof document === "undefined") return;
  void import("@/components/transcript/Receipt").then((module) => {
    module.hostReceipt();
  });
}
