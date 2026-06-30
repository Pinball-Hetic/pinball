// Découpage PUR d'un flux d'octets/strings en lignes (séparateur `\n`). Aucune
// dépendance IO : `push(chunk)` accumule, émet chaque ligne complète via le
// callback injecté, et garde un garde-fou contre une ligne sans newline qui
// gonflerait le buffer (>8192 → reset). Testable sans device série.

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
      if (buf.length > OVERFLOW_LIMIT) buf = ''; // garde-fou contre une ligne sans newline
    },
  };
}
