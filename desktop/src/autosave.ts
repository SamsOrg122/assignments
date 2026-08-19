/**
 * Save what changed, shortly after it stops changing.
 *
 * Plain functions rather than a hook, because the interesting behaviour here
 * has nothing to do with React and everything to do with ordering — and
 * ordering is exactly what a hook makes hard to test. `useAutosave` next door
 * is six lines wrapping this.
 *
 * The debounce is the easy half. Three things are the hard half, and each one
 * is a real way to lose the last sentence somebody typed:
 *
 *  1. **Flush must write, not cancel.** Switching notes, deleting one, or
 *     quitting all make the pending timer's window vanish. That write has to
 *     happen now.
 *  2. **Flush must wait for a write already in flight.** Otherwise "flushed,
 *     now quit" quits during a write that started a millisecond earlier.
 *  3. **A keystroke arriving mid-write must schedule its own save.** If the
 *     in-flight write cleared the pending value when it *finished*, that
 *     keystroke would be wiped by a write that never contained it.
 */

export interface Autosave {
  /** Note that the body changed; write it `delay` ms after the last change. */
  schedule(body: string): void;
  /** Write anything pending now, and wait for any write already running. */
  flush(): Promise<void>;
  /** Swap the writer without losing what is pending. */
  setWriter(write: (body: string) => Promise<void>): void;
  /** Whether anything is waiting to be written. For tests and for the UI. */
  pending(): boolean;
}

export function createAutosave(
  write: (body: string) => Promise<void>,
  delay = 800,
): Autosave {
  let writer = write;
  let waiting: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running: Promise<void> | null = null;

  const writeNow = async (body: string) => {
    const done = (async () => {
      try {
        await writer(body);
      } finally {
        running = null;
      }
    })();
    running = done;
    await done;
  };

  const flush = async (): Promise<void> => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    // Wait for a write that is already going before deciding there is
    // nothing to do — reason 2 above.
    if (running) await running.catch(() => {});

    const body = waiting;
    if (body === null) return;
    // Cleared *before* the await, not after — reason 3.
    waiting = null;
    await writeNow(body).catch(() => {});

    // A keystroke that arrived while that write was in flight left something
    // waiting. A flush promises the disk is current when it resolves, so keep
    // going until it is.
    if (waiting !== null) await flush();
  };

  return {
    schedule(body) {
      waiting = body;
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void flush();
      }, delay);
    },
    flush,
    setWriter(next) {
      writer = next;
    },
    pending: () => waiting !== null || running !== null,
  };
}
