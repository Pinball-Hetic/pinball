// Splits a byte/string stream into lines (`\n` separator). No IO dependency:
// `push(chunk)` accumulates, emits each complete line via the injected
// callback, and guards against a newline-less line inflating the buffer
// (>8192 → reset). Testable without a serial device.

const OVERFLOW_LIMIT = 8192;

export interface LineBuffer {
  push(chunk: string | Buffer): void;
}

export function createLineBuffer(onLine: (line: string) => void): LineBuffer {
  let buf = '';
  return {
    push(chunk) {
      buf += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        onLine(line);
      }
      if (buf.length > OVERFLOW_LIMIT) buf = ''; // guard against a line without newline
    },
  };
}
