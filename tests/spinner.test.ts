import { describe, expect, it } from 'vitest';
import { createProgress, noopProgress } from '../src/spinner';

/** A fake WriteStream that records everything written to it. */
function fakeStream(isTTY: boolean) {
  const writes: string[] = [];
  const stream = {
    isTTY,
    write: (chunk: string) => {
      writes.push(chunk);
      return true;
    },
  } as unknown as NodeJS.WriteStream;
  return { stream, writes };
}

describe('createProgress (non-TTY)', () => {
  it('announces once on start and stays quiet through updates', () => {
    const { stream, writes } = fakeStream(false);
    const p = createProgress(stream);
    p.start('waiting…');
    p.update('still going');
    p.clear();
    p.stop('done.');
    // No per-update spam: only the start line and the final line.
    expect(writes).toEqual(['waiting…\n', 'done.\n']);
  });

  it('stop without a final line writes nothing extra', () => {
    const { stream, writes } = fakeStream(false);
    const p = createProgress(stream);
    p.start('waiting…');
    p.stop();
    expect(writes).toEqual(['waiting…\n']);
  });
});

describe('createProgress (TTY)', () => {
  it('renders a frame on start and clears its line for permanent output', () => {
    const { stream, writes } = fakeStream(true);
    const p = createProgress(stream);
    p.start('waiting…');
    expect(writes[0]).toBe('\r\x1b[2K⠋ waiting…');

    // update() only changes the label; it does not write on its own.
    p.update('batch running…');
    expect(writes).toHaveLength(1);

    // clear() wipes the line so a caller can print above the spinner.
    p.clear();
    expect(writes[1]).toBe('\r\x1b[2K');

    // stop() clears again and prints the final line.
    p.stop('collected 30.');
    expect(writes[2]).toBe('\r\x1b[2K');
    expect(writes[3]).toBe('collected 30.\n');
  });
});

describe('noopProgress', () => {
  it('never throws and produces no output', () => {
    expect(() => {
      noopProgress.start('x');
      noopProgress.update('y');
      noopProgress.clear();
      noopProgress.stop('z');
    }).not.toThrow();
  });
});
