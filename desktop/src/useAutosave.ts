import { useEffect, useState } from "react";
import { createAutosave, type Autosave } from "./autosave";

/**
 * `createAutosave` with a React lifetime around it.
 *
 * Three things, and each one is a rule React actually enforces rather than a
 * style preference:
 *
 *  - The autosave is built **once**, through `useState`'s lazy initialiser.
 *    An earlier version kept it in a ref and read that ref during render,
 *    which React's own lint calls out: a ref read while rendering is a value
 *    that can be stale or torn under concurrent rendering.
 *  - The writer is swapped **in an effect**, not during render. Swapping
 *    rather than rebuilding is what stops a re-render dropping a write that
 *    is already queued.
 *  - The unmount flush is what keeps the last keystroke when the window goes
 *    away.
 *
 * There are no refs here at all, which is the point: every version of this
 * file that reached for one was reaching past a rule that exists for a
 * reason.
 */
export function useAutosave(
  write: (body: string) => Promise<void>,
  delay = 800,
): Autosave {
  // Built once, for the component's whole life.
  const [saver] = useState(() => createAutosave(write, delay));

  // Kept current afterwards. A caller passing a fresh closure each render is
  // the normal case, and the autosave must not still be writing through last
  // render's copy of it.
  useEffect(() => {
    saver.setWriter(write);
  }, [saver, write]);

  useEffect(() => () => void saver.flush(), [saver]);

  return saver;
}
