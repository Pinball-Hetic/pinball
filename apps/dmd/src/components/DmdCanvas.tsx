import { useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import type { DmdDisplay } from '@pinball/shared-types'
import { DmdRenderer, GRID_W, GRID_H } from '@/dmd/DmdRenderer'
import { layouts } from '@/dmd/layouts'
import { applyGlitch, MatrixRain } from '@/dmd/effects'

const GLITCH_MS = 350
const BURST_MS = 1200

interface Props {
  display: DmdDisplay
  upsideDown: boolean
}

const canvasStyle: CSSProperties = {
  width: '100%',
  height: 'auto',
  display: 'block',
  imageRendering: 'pixelated',
}

// Boucle rAF qui lit des refs : ZÉRO re-render par frame (règle projet —
// un re-render démonterait/remonterait le canvas).
export default function DmdCanvas({ display, upsideDown }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const displayRef = useRef(display)
  const upsideDownRef = useRef(upsideDown)

  useEffect(() => {
    displayRef.current = display
  }, [display])
  useEffect(() => {
    upsideDownRef.current = upsideDown
  }, [upsideDown])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const renderer = new DmdRenderer(canvas)
    const rain = new MatrixRain(GRID_W, GRID_H)
    let prevMode = displayRef.current.mode
    let glitchUntil = 0
    let burstUntil = 0
    let raf = 0
    const loop = () => {
      const now = performance.now()
      const d = displayRef.current

      // Triggers d'effets sur changement de mode.
      if (d.mode !== prevMode) {
        if (d.mode === 'EVENT' || d.mode === 'COMBO_FLASH') glitchUntil = now + GLITCH_MS
        if (d.mode === 'GAME_OVER') burstUntil = now + BURST_MS
        prevMode = d.mode
      }

      renderer.setPalette(upsideDownRef.current ? 'upsideDown' : 'normal')
      renderer.clearGrid()
      layouts[d.mode](renderer.grid, d, now)
      if (upsideDownRef.current) rain.drawBackground(renderer.grid)
      if (now < glitchUntil) {
        applyGlitch(renderer.grid, GRID_W, GRID_H, (glitchUntil - now) / GLITCH_MS)
      }
      if (now < burstUntil) {
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
