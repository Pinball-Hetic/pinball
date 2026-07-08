// Must stay one shared, complete, idempotent stub: bun test shares a module
// singleton across files, so a per-file partial stub poisons the global for
// the next file to run (order-dependent, green on macOS / red on CI).

type StubContext = {
  createRadialGradient: () => { addColorStop: () => void };
  fillRect: () => void;
  drawImage: () => void;
  getImageData: () => { data: number[] };
  fillStyle: unknown;
};

function makeStubElement() {
  const listeners: Record<string, Array<() => void>> = {};
  return {
    width: 0,
    height: 0,
    style: {},
    setAttribute: () => {},
    removeAttribute: () => {},
    addEventListener: (type: string, cb: () => void) => {
      (listeners[type] ??= []).push(cb);
      // Fire error immediately so ImageLoader's load/error wait resolves (→ texture null).
      if (type === 'error') queueMicrotask(() => cb());
    },
    removeEventListener: () => {},
    getContext: (): StubContext => ({
      createRadialGradient: () => ({ addColorStop: () => {} }),
      fillRect: () => {},
      drawImage: () => {},
      getImageData: () => ({ data: [] }),
      fillStyle: undefined,
    }),
    set src(_v: string) {},
  };
}

type StubGlobal = {
  document?: {
    createElement: (tag: string) => unknown;
    createElementNS: (ns: string, tag: string) => unknown;
  };
  Image?: unknown;
};

export function installDomStub(): void {
  const g = globalThis as StubGlobal;
  if (typeof g.document === 'undefined') {
    g.document = { createElement: makeStubElement, createElementNS: makeStubElement };
  }
  if (typeof g.Image === 'undefined') {
    g.Image = class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_v: string) {
        queueMicrotask(() => this.onerror?.());
      }
    };
  }
}
