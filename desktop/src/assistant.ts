/**
 * Talking to the assistant, from a window that cannot talk to anything.
 *
 * There is no `fetch` in this file and there cannot be one. The window's
 * content policy is `default-src 'self'` with `connect-src` limited to
 * itself and the IPC bridge, and `capabilities/default.json` grants no HTTP
 * permission at all — so a request from here is refused twice over, by
 * design. That is not an obstacle to work around: it is the reason the
 * session token has never been in JavaScript, and the reason a bug in this
 * window cannot reach anybody's account.
 *
 * So: a question goes over the bridge, and the answer arrives as events.
 * Rust makes the call, applies what comes back to the note store, and tells
 * the window what happened.
 */

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

/**
 * What arrives while an answer is being given.
 *
 * Named to match the web app's own AI frames, so the two read loops stay
 * the same loop: `model` says who is answering, `text` is the reply
 * arriving in pieces, `error` is a sentence to show, `done` closes it. The
 * two of our own are the ones that did something — `did` changed a note,
 * `made` produced a document on its way to the account.
 */
export type Frame =
  | { type: "model"; value: string }
  | { type: "text"; value: string }
  | { type: "did"; value: string }
  | { type: "made"; value: string }
  | { type: "error"; value: string }
  | { type: "done" };

/** Ask. Resolves when the question is on its way, not when it is answered. */
export const ask = (prompt: string, noteId: string): Promise<void> =>
  invoke("assistant_ask", { prompt, noteId });

/** Forget anything in flight. Safe to call when there is nothing. */
export const cancel = (): Promise<void> => invoke("assistant_cancel");

/** Listen for frames. Returns the unsubscribe. */
export function onFrame(fn: (frame: Frame) => void): Promise<() => void> {
  return listen<Frame>("assistant:frame", (event) => fn(event.payload));
}
