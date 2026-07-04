import { test, expect, describe, beforeEach, afterEach } from 'bun:test'
import {
  DmdRenderer,
  documentSpriteFactory,
  GRID_W,
  GRID_H,
  PITCH,
  type SpriteFactory,
} from './DmdRenderer'
import { INDEX_TO_COLOR, PALETTE_NORMAL, type Palette } from './palette'

// --- Fake canvas / 2D context ---------------------------------------------
// Avoid any real WebGL/canvas: a stub context that records calls lets us
// observe render()/buildSprites() behavior.

type Call = { method: string; args: unknown[] }

function makeFakeCtx(calls: Call[]): CanvasRenderingContext2D {
  const ctx = {
    fillStyle: '' as string,
    fillRect: (...args: unknown[]) => calls.push({ method: 'fillRect', args }),
    drawImage: (...args: unknown[]) => calls.push({ method: 'drawImage', args }),
    createRadialGradient: (...args: unknown[]) => {
      calls.push({ method: 'createRadialGradient', args })
      return { addColorStop: () => {} }
    },
  }
  return ctx as unknown as CanvasRenderingContext2D
}

// Fake canvas: getContext returns the stub ctx (or null depending on the flag).
function makeFakeCanvas(
  calls: Call[],
  opts: { contextAvailable?: boolean } = {},
): HTMLCanvasElement {
  const available = opts.contextAvailable ?? true
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => (available ? makeFakeCtx(calls) : null),
  }
  return canvas as unknown as HTMLCanvasElement
}

// document.createElement('canvas') is called by makeSprite. Install a minimal
// global to stay independent of happy-dom.
const originalDocument = (globalThis as { document?: unknown }).document
let spriteCanvasContextAvailable = false
// Calls recorded by the offscreen sprite contexts (createElement).
let spriteCalls: Call[] = []

beforeEach(() => {
  spriteCalls = []
  ;(globalThis as { document?: unknown }).document = {
    createElement: (tag: string) => {
      if (tag !== 'canvas') throw new Error('unexpected tag ' + tag)
      return {
        width: 0,
        height: 0,
        getContext: () =>
          spriteCanvasContextAvailable ? makeFakeCtx(spriteCalls) : null,
      }
    },
  }
})

afterEach(() => {
  if (originalDocument === undefined) {
    delete (globalThis as { document?: unknown }).document
  } else {
    (globalThis as { document?: unknown }).document = originalDocument
  }
  spriteCanvasContextAvailable = false
})

describe('constantes de grille', () => {
  test('dimensions logiques et pitch', () => {
    expect(GRID_W).toBe(96)
    expect(GRID_H).toBe(32)
    expect(PITCH).toBe(20)
  })
})

describe('DmdRenderer construction', () => {
  test('alloue une grille GRID_W * GRID_H à zéro', () => {
    const r = new DmdRenderer(makeFakeCanvas([]))
    expect(r.grid).toBeInstanceOf(Uint8Array)
    expect(r.grid.length).toBe(GRID_W * GRID_H)
    expect(r.grid.every((v) => v === 0)).toBe(true)
  })

  test('dimensionne le canvas en pixels physiques', () => {
    const canvas = makeFakeCanvas([])
    new DmdRenderer(canvas)
    expect(canvas.width).toBe(GRID_W * PITCH) // 1920
    expect(canvas.height).toBe(GRID_H * PITCH) // 640
  })

  test('lève si le contexte 2D est indisponible', () => {
    expect(() => new DmdRenderer(makeFakeCanvas([], { contextAvailable: false }))).toThrow(
      'DmdRenderer: 2D context unavailable',
    )
  })
})

describe('clearGrid', () => {
  test('remet toute la grille à zéro', () => {
    const r = new DmdRenderer(makeFakeCanvas([]))
    r.grid.fill(7)
    r.clearGrid()
    expect(r.grid.every((v) => v === 0)).toBe(true)
  })
})

describe('render', () => {
  test('applique le decay phosphore (fillRect plein écran) sans dot allumé', () => {
    const calls: Call[] = []
    const r = new DmdRenderer(makeFakeCanvas(calls))
    r.clearGrid()
    r.render()
    const fills = calls.filter((c) => c.method === 'fillRect')
    expect(fills.length).toBe(1)
    // covers the whole 1920x640 canvas
    expect(fills[0].args).toEqual([0, 0, GRID_W * PITCH, GRID_H * PITCH])
    // no dot → no drawImage
    expect(calls.some((c) => c.method === 'drawImage')).toBe(false)
  })

  test('saute les dots éteints (index 0) et ne dessine rien', () => {
    const calls: Call[] = []
    const r = new DmdRenderer(makeFakeCanvas(calls))
    r.grid.fill(0)
    r.render()
    expect(calls.filter((c) => c.method === 'drawImage').length).toBe(0)
  })

  test('dessine un sprite à la position pixel attendue pour un dot allumé', () => {
    // sprites only exist if the offscreen canvas context is available.
    spriteCanvasContextAvailable = true
    const calls: Call[] = []
    const r = new DmdRenderer(makeFakeCanvas(calls))
    // light dot (x=3, y=2) with color index 1
    const x = 3
    const y = 2
    r.grid[y * GRID_W + x] = 1
    calls.length = 0 // ignore sprite-construction calls
    r.render()
    const draws = calls.filter((c) => c.method === 'drawImage')
    expect(draws.length).toBe(1)
    // drawImage(sprite, x*PITCH, y*PITCH)
    expect(draws[0].args[1]).toBe(x * PITCH)
    expect(draws[0].args[2]).toBe(y * PITCH)
  })

  test('n appelle pas drawImage quand le sprite est null (ctx offscreen indispo)', () => {
    // makeSprite returns a canvas WITHOUT a real sprite, but the stored
    // sprite is never null in that case (makeSprite always returns s). To
    // force a null sprite we would use index 0, which is already off.
    spriteCanvasContextAvailable = false
    const calls: Call[] = []
    const r = new DmdRenderer(makeFakeCanvas(calls))
    r.grid[0] = 1
    calls.length = 0
    r.render()
    // sprite exists (makeSprite returns the canvas) so drawImage is called
    expect(calls.filter((c) => c.method === 'drawImage').length).toBe(1)
  })

  test('dessine un sprite par dot allumé distinct', () => {
    spriteCanvasContextAvailable = true
    const calls: Call[] = []
    const r = new DmdRenderer(makeFakeCanvas(calls))
    r.grid[0] = 1
    r.grid[1] = 2
    r.grid[2] = 3
    calls.length = 0
    r.render()
    expect(calls.filter((c) => c.method === 'drawImage').length).toBe(3)
  })
})

describe('setPalette', () => {
  test('ne reconstruit pas les sprites si palette identique (no-op)', () => {
    spriteCanvasContextAvailable = true
    const r = new DmdRenderer(makeFakeCanvas([]))
    // createRadialGradient (on spriteCalls) = proof of a (re)construction.
    const before = spriteCalls.filter((c) => c.method === 'createRadialGradient').length
    r.setPalette(PALETTE_NORMAL) // same reference as the default palette
    const after = spriteCalls.filter((c) => c.method === 'createRadialGradient').length
    expect(after).toBe(before)
  })

  test('reconstruit les sprites pour une nouvelle palette', () => {
    spriteCanvasContextAvailable = true
    const r = new DmdRenderer(makeFakeCanvas([]))
    const custom: Palette = { ...PALETTE_NORMAL, score: '#010203' }
    const before = spriteCalls.filter((c) => c.method === 'createRadialGradient').length
    r.setPalette(custom)
    const after = spriteCalls.filter((c) => c.method === 'createRadialGradient').length
    // one gradient per palette color (= INDEX_TO_COLOR.length)
    expect(after - before).toBe(INDEX_TO_COLOR.length)
  })

  test('le rendu utilise la nouvelle palette après changement', () => {
    spriteCanvasContextAvailable = true
    const calls: Call[] = []
    const r = new DmdRenderer(makeFakeCanvas(calls))
    const custom: Palette = { ...PALETTE_NORMAL, lives: '#FFFFFF' }
    r.setPalette(custom)
    r.grid[0] = 2 // 'lives' index
    calls.length = 0
    r.render()
    // still able to draw the dot after a palette change
    expect(calls.filter((c) => c.method === 'drawImage').length).toBe(1)
  })
})

describe('buildSprites (via construction)', () => {
  test('construit un sprite par couleur quand le ctx offscreen est dispo', () => {
    spriteCanvasContextAvailable = true
    new DmdRenderer(makeFakeCanvas([]))
    // each sprite creates one radial gradient
    expect(
      spriteCalls.filter((c) => c.method === 'createRadialGradient').length,
    ).toBe(INDEX_TO_COLOR.length)
  })

  test('ne crée aucun gradient quand le ctx offscreen est null', () => {
    spriteCanvasContextAvailable = false
    new DmdRenderer(makeFakeCanvas([]))
    expect(
      spriteCalls.filter((c) => c.method === 'createRadialGradient').length,
    ).toBe(0)
  })
})

describe('SpriteFactory injectée (sans document global)', () => {
  test('buildSprites appelle la factory une fois par couleur, dans l ordre', () => {
    // No need for the global document: the factory is injected. Remove the
    // stub to prove it is never touched.
    delete (globalThis as { document?: unknown }).document
    const seen: string[] = []
    const fakeFactory: SpriteFactory = (color) => {
      seen.push(color)
      return null
    }
    new DmdRenderer(makeFakeCanvas([]), fakeFactory)
    expect(seen.length).toBe(INDEX_TO_COLOR.length)
    expect(seen).toEqual(INDEX_TO_COLOR.map((c) => PALETTE_NORMAL[c]))
  })

  test('render dessine pour chaque sprite non-null renvoyé par la factory', () => {
    delete (globalThis as { document?: unknown }).document
    const fakeSprite = { width: PITCH, height: PITCH } as HTMLCanvasElement
    const fakeFactory: SpriteFactory = () => fakeSprite
    const calls: Call[] = []
    const r = new DmdRenderer(makeFakeCanvas(calls), fakeFactory)
    r.grid[0] = 1
    calls.length = 0
    r.render()
    const draws = calls.filter((c) => c.method === 'drawImage')
    expect(draws.length).toBe(1)
    expect(draws[0].args[0]).toBe(fakeSprite)
  })

  test('render saute les dots dont la factory renvoie null', () => {
    delete (globalThis as { document?: unknown }).document
    const fakeFactory: SpriteFactory = () => null
    const calls: Call[] = []
    const r = new DmdRenderer(makeFakeCanvas(calls), fakeFactory)
    r.grid[0] = 1
    calls.length = 0
    r.render()
    expect(calls.filter((c) => c.method === 'drawImage').length).toBe(0)
  })

  test('setPalette repasse les nouvelles couleurs à la factory', () => {
    delete (globalThis as { document?: unknown }).document
    const seen: string[] = []
    const fakeFactory: SpriteFactory = (color) => {
      seen.push(color)
      return null
    }
    const r = new DmdRenderer(makeFakeCanvas([]), fakeFactory)
    seen.length = 0
    const custom: Palette = { ...PALETTE_NORMAL, score: '#010203' }
    r.setPalette(custom)
    expect(seen).toEqual(INDEX_TO_COLOR.map((c) => custom[c]))
  })
})

describe('documentSpriteFactory (impl par défaut)', () => {
  test('dimensionne le canvas offscreen à PITCH et crée le gradient halo', () => {
    spriteCanvasContextAvailable = true
    const sprite = documentSpriteFactory(PALETTE_NORMAL.score)
    expect(sprite).not.toBeNull()
    expect(sprite?.width).toBe(PITCH)
    expect(sprite?.height).toBe(PITCH)
    const grads = spriteCalls.filter((c) => c.method === 'createRadialGradient')
    expect(grads.length).toBe(1)
    expect(grads[0].args).toEqual([PITCH / 2, PITCH / 2, 0, PITCH / 2, PITCH / 2, PITCH / 2])
  })

  test('renvoie le canvas sans gradient quand le ctx 2D est indisponible', () => {
    spriteCanvasContextAvailable = false
    const sprite = documentSpriteFactory(PALETTE_NORMAL.score)
    expect(sprite).not.toBeNull()
    expect(
      spriteCalls.filter((c) => c.method === 'createRadialGradient').length,
    ).toBe(0)
  })
})
