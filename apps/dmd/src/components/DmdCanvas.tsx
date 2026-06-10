import { useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import type { DmdDisplay } from '@pinball/shared-types'
import { DmdRenderer } from '@/dmd/DmdRenderer'
import { layouts } from '@/dmd/layouts'

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
    let raf = 0
    const loop = () => {
      const now = performance.now()
      renderer.setPalette(upsideDownRef.current ? 'upsideDown' : 'normal')
      renderer.clearGrid()
      const d = displayRef.current
      layouts[d.mode](renderer.grid, d, now)
      renderer.render()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  return <canvas ref={canvasRef} width={1920} height={480} style={canvasStyle} />
}
