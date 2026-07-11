/**
 * A tiny terminal spinner for long waits (e.g. polling an LLM batch).
 *
 * On a TTY it animates a braille frame on a single line, redrawn on its own
 * ~80ms timer so it spins smoothly regardless of how often the caller polls.
 * When stdout is not a TTY (piped, redirected, CI) it degrades to a single
 * line on `start` and stays quiet — no per-poll spam.
 *
 * `clear()` lets a caller print a permanent line safely: wipe the spinner's
 * line, write the message, and the next timer tick redraws the spinner below.
 */

export interface Progress {
  /** Begin (or re-label) the spinner with an initial line of text. */
  start(text: string): void;
  /** Change the spinner's label without printing a new line. */
  update(text: string): void;
  /** Wipe the current spinner line so a permanent line can be printed. */
  clear(): void;
  /** Stop the spinner, clear its line, and optionally print a final line. */
  stop(finalText?: string): void;
}

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
/** Carriage return + "erase entire line". */
const CLEAR_LINE = '\r\x1b[2K';

/** A Progress that does nothing — the default when no reporter is supplied. */
export const noopProgress: Progress = {
  start() {},
  update() {},
  clear() {},
  stop() {},
};

export function createProgress(stream: NodeJS.WriteStream = process.stdout): Progress {
  // Non-interactive output: announce once, then stay silent.
  if (!stream.isTTY) {
    return {
      start: (t) => {
        stream.write(t + '\n');
      },
      update: () => {},
      clear: () => {},
      stop: (t) => {
        if (t) stream.write(t + '\n');
      },
    };
  }

  let frame = 0;
  let text = '';
  let timer: ReturnType<typeof setInterval> | null = null;

  const render = () => {
    stream.write(`${CLEAR_LINE}${FRAMES[frame]} ${text}`);
    frame = (frame + 1) % FRAMES.length;
  };

  return {
    start(t) {
      text = t;
      if (timer) return;
      render();
      timer = setInterval(render, 80);
      // Don't let the spinner keep the process alive on its own.
      timer.unref();
    },
    update(t) {
      text = t;
    },
    clear() {
      if (timer) stream.write(CLEAR_LINE);
    },
    stop(final) {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      stream.write(CLEAR_LINE);
      if (final) stream.write(final + '\n');
    },
  };
}
