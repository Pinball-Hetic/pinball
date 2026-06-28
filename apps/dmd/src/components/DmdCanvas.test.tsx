import { test, expect, afterEach, beforeEach, describe, mock } from 'bun:test'
import { render, cleanup, act } from '@testing-library/react'
import type { DmdDisplay } from '@pinball/shared-types'

// --- Espions partages, remplis par le mock de @pinball/dmd-core. ---
const calls = {
  rendererCtor: 0,
  setPalette: [] as unknown[],
  clearGrid: 0,
  render: 0,
  layoutCalls: [] as Array<{ mode: string }>,
  applyGlitch: 0,
  drawBurst: 0,
  drawBackground: 0,
}

const PALETTE_NORMAL = { p: 'normal' }
const PALETTE_ALT = { p: 'alt' }

class FakeRenderer {
  grid = new Uint8Array(10)
  constructor() {
    calls.rendererCtor++
  }
  setPalette(p: unknown) {
    calls.setPalette.push(p)
  }
  clearGrid() {
    calls.clearGrid++
  }
  render() {
    calls.render++
  }
}

class FakeMatrixRain {
  drawBackground() {
    calls.drawBackground++
  }
  drawBurst() {
    calls.drawBurst++
  }
}

// makeLayouts retourne un Record mode -> fn ; on enregistre l'appel.
const makeLayouts = () =>
  new Proxy(
    {},
    {
      get: () => (_g: Uint8Array, d: DmdDisplay) => {
        calls.layoutCalls.push({ mode: d.mode })
      },
    },
  )

mock.module('@pinball/dmd-core', () => ({
  DmdRenderer: FakeRenderer,
  MatrixRain: FakeMatrixRain,
  GRID_W: 96,
  GRID_H: 32,
  PALETTE_NORMAL,
  makeLayouts,
  applyGlitch: () => {
    calls.applyGlitch++
  },
}))

// rAF deterministe : execute le callback exactement une fois (une frame).
let rafCb: FrameRequestCallback | null = null
beforeEach(() => {
  calls.rendererCtor = 0
  calls.setPalette = []
  calls.clearGrid = 0
  calls.render = 0
  calls.layoutCalls = []
  calls.applyGlitch = 0
  calls.drawBurst = 0
  calls.drawBackground = 0
  rafCb = null
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    // Capture le premier callback ; ne reboucle pas (evite la boucle infinie).
    if (rafCb === null) rafCb = cb
    return 1
  }) as typeof requestAnimationFrame
  globalThis.cancelAnimationFrame = (() => {}) as typeof cancelAnimationFrame
})

afterEach(cleanup)

const score = (): DmdDisplay =>
  ({
    mode: 'SCORE',
    player: 'P1',
    score: 100,
    combo: 1,
    multiplier: 1,
    mapState: {} as never,
    alternateWorld: false,
  }) as unknown as DmdDisplay

// Importe le composant apres le mock.module.
const { default: DmdCanvas } = await import('./DmdCanvas')

function frame() {
  expect(rafCb).not.toBeNull()
  rafCb!(performance.now())
}

describe('DmdCanvas', () => {
  test('monte un canvas 1920x640', () => {
    const { container } = render(
      <DmdCanvas display={score()} alternateWorld={false} mapDmdContent={{}} />,
    )
    const canvas = container.querySelector('canvas') as HTMLCanvasElement
    expect(canvas).not.toBeNull()
    expect(canvas.getAttribute('width')).toBe('1920')
    expect(canvas.getAttribute('height')).toBe('640')
  })

  test('instancie le renderer et planifie une frame', () => {
    render(<DmdCanvas display={score()} alternateWorld={false} mapDmdContent={{}} />)
    expect(calls.rendererCtor).toBe(1)
    expect(rafCb).not.toBeNull()
  })

  test('une frame : clear + layout + render dans cet ordre logique', () => {
    render(<DmdCanvas display={score()} alternateWorld={false} mapDmdContent={{}} />)
    frame()
    expect(calls.clearGrid).toBe(1)
    expect(calls.render).toBe(1)
    expect(calls.layoutCalls).toEqual([{ mode: 'SCORE' }])
  })

  test('monde normal : palette normale, pas de fond matrix', () => {
    render(<DmdCanvas display={score()} alternateWorld={false} mapDmdContent={{}} />)
    frame()
    expect(calls.setPalette[0]).toBe(PALETTE_NORMAL)
    expect(calls.drawBackground).toBe(0)
  })

  test('alternateWorld : dessine le fond matrix', () => {
    render(<DmdCanvas display={score()} alternateWorld={true} mapDmdContent={{}} />)
    frame()
    expect(calls.drawBackground).toBe(1)
  })

  test('mapDmdContent.paletteAlternateWorld utilisee en alternateWorld', () => {
    render(
      <DmdCanvas
        display={score()}
        alternateWorld={true}
        mapDmdContent={{ paletteAlternateWorld: PALETTE_ALT as never }}
      />,
    )
    frame()
    expect(calls.setPalette[0]).toBe(PALETTE_ALT)
  })

  test('transition vers GAME_OVER declenche un burst', () => {
    const go = {
      mode: 'GAME_OVER',
      player: 'P1',
      finalScore: 42,
      alternateWorld: false,
    } as unknown as DmdDisplay
    // Demarre en SCORE puis transitionne : le burst se declenche au changement
    // de mode (prevMode != mode), pas au montage initial.
    const { rerender } = render(
      <DmdCanvas display={score()} alternateWorld={false} mapDmdContent={{}} />,
    )
    act(() => {
      rerender(<DmdCanvas display={go} alternateWorld={false} mapDmdContent={{}} />)
    })
    frame()
    expect(calls.drawBurst).toBe(1)
  })

  test('transition vers EVENT declenche un glitch', () => {
    const ev = {
      mode: 'EVENT',
      label: 'HIT',
      points: 5,
      player: 'P1',
      score: 1,
      combo: 1,
      multiplier: 1,
      mapState: {},
      alternateWorld: false,
    } as unknown as DmdDisplay
    const { rerender } = render(
      <DmdCanvas display={score()} alternateWorld={false} mapDmdContent={{}} />,
    )
    act(() => {
      rerender(<DmdCanvas display={ev} alternateWorld={false} mapDmdContent={{}} />)
    })
    frame()
    expect(calls.applyGlitch).toBe(1)
  })

  test('SCORE stable ne declenche ni glitch ni burst', () => {
    render(<DmdCanvas display={score()} alternateWorld={false} mapDmdContent={{}} />)
    frame()
    expect(calls.applyGlitch).toBe(0)
    expect(calls.drawBurst).toBe(0)
  })
})
