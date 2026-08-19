import { useEffect, useRef } from "react";
import { createAutosave, type Autosave } from "./autosave";

/**
 * `createAutosave` with a React lifetime around it.
 *
 * The writer is swapped rather than the autosave rebuilt, so a re-render
 * cannot drop a pending write on the floor — and the unmount flush is what
 * keeps the last keystroke when the window goes away.
 */
export function useAutosave(
  write: (body: string) => Promise<void>,
  delay = 800,
): Autosave {
  const saver = useRef<Autosave | null>(null);
  saver.current ??= createAutosave(write, delay);
  saver.current.setWriter(write);

  const held = saver.current;
  useEffect(() => () => void held.flush(), [held]);

  return held;
}
