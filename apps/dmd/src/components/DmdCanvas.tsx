import { useEffect, useMemo, useRef } from 'react'
import type { CSSProperties } from 'react'
import type { DmdDisplay } from '@pinball/shared-types'
import type { DmdMapContent } from '@pinball/dmd-core'
import { DmdRenderer, GRID_W, GRID_H, applyGlitch, MatrixRain, PALETTE_NORMAL, makeLayouts } from '@pinball/dmd-core'

const GLITCH_MS = 350

interface Props {
  display: DmdDisplay
  alternateWorld: boolean
  /** Contenu DMD de la map active (fourni par la page, dérivé du mapId). Le
   *  composant est monté avec key={mapId} : les constantes LAYOUTS/PALETTE/BURST
   *  sont recalculées à chaque remontage, jamais en cours de vie du composant. */
  mapDmdContent: DmdMapContent
}

const canvasStyle: CSSProperties = {
  width: '100%',
  height: 'auto',
  display: 'block',
  imageRendering: 'pixelated',
}

// Boucle rAF qui lit des refs : ZÉRO re-render par frame (règle projet —
// un re-render démonterait/remonterait le canvas). Les constantes LAYOUTS,
// ALTERNATE_PALETTE, BURST_MS sont calculées une fois par montage (la page
// utilise key={mapId} pour forcer un remontage propre à chaque changement de map).
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

      // Triggers d'effets sur changement de mode OU de clip (deux clips
      // CINEMATIC consécutifs gardent mode='CINEMATIC' → il faut quand même
      // remettre l'horloge à zéro pour le nouveau clip).
      const clipNow = d.mode === 'CINEMATIC' ? d.clip : undefined
      if (d.mode !== prevMode || clipNow !== prevClip) {
        modeStartedAt = now
        if (d.mode === 'EVENT' || d.mode === 'COMBO_FLASH') glitchUntil = now + GLITCH_MS
        if (d.mode === 'GAME_OVER') burstUntil = now + BURST_MS
        prevMode = d.mode
        prevClip = clipNow
      }

      const cinematic = d.mode === 'CINEMATIC'
      // CINEMATIC : horloge relative à l'arrivée du mode (frames du clip).
      const clock = cinematic ? now - modeStartedAt : now

      renderer.setPalette(alternateWorldRef.current ? ALTERNATE_PALETTE : NORMAL_PALETTE)
      renderer.clearGrid()
      LAYOUTS[d.mode](renderer.grid, d, clock)
      if (alternateWorldRef.current) rain.drawBackground(renderer.grid)
      // Glitch/burst NE s'appliquent PAS pendant un clip (il se suffit).
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
