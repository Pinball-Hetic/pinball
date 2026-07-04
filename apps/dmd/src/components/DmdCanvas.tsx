import { useEffect, useMemo, useRef } from 'react'
import type { CSSProperties } from 'react'
import type { DmdDisplay } from '@pinball/shared-types'
import type { DmdMapContent } from '@pinball/dmd-core'
import { DmdRenderer, GRID_W, GRID_H, applyGlitch, MatrixRain, PALETTE_NORMAL, makeLayouts } from '@pinball/dmd-core'

const GLITCH_MS = 350

interface Props {
  display: DmdDisplay
  alternateWorld: boolean
  /** DMD content of the active map (provided by the page, derived from mapId).
   *  The component is mounted with key={mapId}: the LAYOUTS/PALETTE/BURST
   *  constants are recomputed on each remount, never during the component's life. */
  mapDmdContent: DmdMapContent
}

const canvasStyle: CSSProperties = {
  width: '100%',
  height: 'auto',
  display: 'block',
  imageRendering: 'pixelated',
}

// rAF loop reading refs: ZERO re-renders per frame (project rule — a re-render
// would unmount/remount the canvas). The LAYOUTS, ALTERNATE_PALETTE, BURST_MS
// constants are computed once per mount (the page uses key={mapId} to force a
// clean remount on every map change).
export default function DmdCanvas({ display, alternateWorld, mapDmdContent }: Props) {
  const LAYOUTS = useMemo(() => makeLayouts(mapDmdContent), [mapDmdContent])
  const NORMAL_PALETTE = useMemo(
    () => mapDmdContent.paletteNormal ?? PALETTE_NORMAL,
    [mapDmdContent],
  )
  const ALTERNATE_PALETTE = useMemo(
    () => mapDmdContent.paletteAlternateWorld ?? PALETTE_NORMAL,
    [mapDmdContent],
  )
  const BURST_MS = mapDmdContent.alternateWorldBurstMs ?? 1200
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const displayRef = useRef(display)
  const alternateWorldRef = useRef(alternateWorld)

  useEffect(() => {
    displayRef.current = display
  }, [display])
  useEffect(() => {
    alternateWorldRef.current = alternateWorld
  }, [alternateWorld])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const renderer = new DmdRenderer(canvas)
    const rain = new MatrixRain(GRID_W, GRID_H)
    let prevMode = displayRef.current.mode
    let prevClip: string | undefined =
      displayRef.current.mode === 'CINEMATIC' ? displayRef.current.clip : undefined
    let modeStartedAt = performance.now()
    let glitchUntil = 0
    let burstUntil = 0
    let raf = 0
    const loop = () => {
      const now = performance.now()
      const d = displayRef.current

      // Effect triggers on mode OR clip change (two consecutive CINEMATIC
      // clips keep mode='CINEMATIC' → the clock must still reset for the
      // new clip).
      const clipNow = d.mode === 'CINEMATIC' ? d.clip : undefined
      if (d.mode !== prevMode || clipNow !== prevClip) {
        modeStartedAt = now
        if (d.mode === 'EVENT' || d.mode === 'COMBO_FLASH') glitchUntil = now + GLITCH_MS
        if (d.mode === 'GAME_OVER') burstUntil = now + BURST_MS
        prevMode = d.mode
        prevClip = clipNow
      }

      const cinematic = d.mode === 'CINEMATIC'
      // CINEMATIC: clock relative to the mode's arrival (clip frames).
      const clock = cinematic ? now - modeStartedAt : now

      renderer.setPalette(alternateWorldRef.current ? ALTERNATE_PALETTE : NORMAL_PALETTE)
      renderer.clearGrid()
      LAYOUTS[d.mode](renderer.grid, d, clock)
      if (alternateWorldRef.current) rain.drawBackground(renderer.grid)
      // Glitch/burst do NOT apply during a clip (it stands on its own).
      if (!cinematic && now < glitchUntil) {
        applyGlitch(renderer.grid, GRID_W, GRID_H, (glitchUntil - now) / GLITCH_MS)
      }
      if (!cinematic && now < burstUntil) {
        rain.drawBurst(renderer.grid, (burstUntil - now) / BURST_MS)
      }
      renderer.render()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  return <canvas ref={canvasRef} width={1920} height={640} style={canvasStyle} />
}
