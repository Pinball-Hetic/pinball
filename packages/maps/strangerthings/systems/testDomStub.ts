// Shared, complete DOM stub for the map's tests. No happy-dom in this package,
// yet several systems touch document/Image at import time (GlowSprite builds a
// radial canvas; CameraBillboardSprite's TextureLoader creates an <img>). bun
// test shares one module singleton across files, so a per-file partial stub
// would poison the global for whichever file runs next (order-dependent, green
// on macOS / red on CI). One idempotent, complete stub removes that race.

type StubContext = {
  createRadialGradient: () => { addColorStop: () => void };
  fillRect: () => void;
  drawImage: () => void;
  getImageData: () => { data: number[] };
  fillStyle: unknown;
};

// One element that satisfies both the canvas path (getContext) and the <img>
// path (addEventListener/src) so createElement and createElementNS can share it.
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
      // ImageLoader waits for load/error; simulate a failed decode so its error
      // path runs and resolves (loader catch → texture null).
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
