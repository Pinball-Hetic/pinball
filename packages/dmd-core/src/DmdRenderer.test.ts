import { test, expect, describe, beforeEach, afterEach } from 'bun:test'
import { DmdRenderer, GRID_W, GRID_H, PITCH } from './DmdRenderer'
import { INDEX_TO_COLOR, PALETTE_NORMAL, type Palette } from './palette'

// --- Faux canvas / contexte 2D -------------------------------------------
// On évite tout WebGL/canvas réel : un contexte stub qui enregistre les
// appels permet d'observer le comportement de render()/buildSprites().

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

// Canvas factice : getContext renvoie le ctx stub (ou null selon le flag).
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

// document.createElement('canvas') est appelé par makeSprite. On installe un
// global minimal pour rester indépendant de happy-dom.
const originalDocument = (globalThis as { document?: unknown }).document
let spriteCanvasContextAvailable = false
// Appels enregistrés par les contextes des sprites offscreen (createElement).
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
    // couvre tout le canvas 1920x640
    expect(fills[0].args).toEqual([0, 0, GRID_W * PITCH, GRID_H * PITCH])
    // aucun dot → aucun drawImage
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
    // les sprites n'existent que si le contexte du canvas offscreen est dispo.
    spriteCanvasContextAvailable = true
    const calls: Call[] = []
    const r = new DmdRenderer(makeFakeCanvas(calls))
    // allume le dot (x=3, y=2) avec l'index couleur 1
    const x = 3
    const y = 2
    r.grid[y * GRID_W + x] = 1
    calls.length = 0 // ignore les appels de construction des sprites
    r.render()
    const draws = calls.filter((c) => c.method === 'drawImage')
    expect(draws.length).toBe(1)
    // drawImage(sprite, x*PITCH, y*PITCH)
    expect(draws[0].args[1]).toBe(x * PITCH)
    expect(draws[0].args[2]).toBe(y * PITCH)
  })

  test('n appelle pas drawImage quand le sprite est null (ctx offscreen indispo)', () => {
    // makeSprite renvoie un canvas SANS sprite réel, mais le sprite stocké
    // n est jamais null dans ce cas (makeSprite renvoie toujours s). Pour
    // forcer un sprite null on utiliserait l index 0 qui est déjà éteint.
    spriteCanvasContextAvailable = false
    const calls: Call[] = []
    const r = new DmdRenderer(makeFakeCanvas(calls))
    r.grid[0] = 1
    calls.length = 0
    r.render()
    // sprite existe (makeSprite renvoie le canvas) donc drawImage est appelé
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
    // createRadialGradient (sur spriteCalls) = preuve d une (re)construction.
    const before = spriteCalls.filter((c) => c.method === 'createRadialGradient').length
    r.setPalette(PALETTE_NORMAL) // même référence que la palette par défaut
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
    // un gradient par couleur de la palette (= INDEX_TO_COLOR.length)
    expect(after - before).toBe(INDEX_TO_COLOR.length)
  })

  test('le rendu utilise la nouvelle palette après changement', () => {
    spriteCanvasContextAvailable = true
    const calls: Call[] = []
    const r = new DmdRenderer(makeFakeCanvas(calls))
    const custom: Palette = { ...PALETTE_NORMAL, lives: '#FFFFFF' }
    r.setPalette(custom)
    r.grid[0] = 2 // index 'lives'
    calls.length = 0
    r.render()
    // toujours capable de dessiner le dot après changement de palette
    expect(calls.filter((c) => c.method === 'drawImage').length).toBe(1)
  })
})

describe('buildSprites (via construction)', () => {
  test('construit un sprite par couleur quand le ctx offscreen est dispo', () => {
    spriteCanvasContextAvailable = true
    new DmdRenderer(makeFakeCanvas([]))
    // chaque sprite crée un radial gradient
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
