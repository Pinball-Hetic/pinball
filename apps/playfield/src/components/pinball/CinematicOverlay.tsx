import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import type { CinematicClip, CinematicFamily } from '@pinball/shared-types'

interface CinematicOverlayProps {
  clip: CinematicClip | null
  /** clipId → family mapping (provided by the map manifest). */
  clipFamilies?: Record<string, CinematicFamily>
  /** Overlay videos/images per clipId (CSS fallback otherwise). */
  overlayFiles?: Record<string, string>
}

const FADE_MS = 250

function isVideo(file: string): boolean {
  return file.endsWith('.webm')
}

// DOM overlay played during cinematic freezes (above the 3D canvas, below
// the GameOverlay). Animated asset when present (manifest), otherwise a
// generic CSS fallback per family. One re-render per cinematic — never per
// frame.
export default function CinematicOverlay({ clip, clipFamilies, overlayFiles }: CinematicOverlayProps) {
  const [shown, setShown] = useState<CinematicClip | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (clip) {
      setShown(clip)
      // next tick → opacity transition
      const id = window.requestAnimationFrame(() => setVisible(true))
      return () => window.cancelAnimationFrame(id)
    }
    setVisible(false)
    const id = window.setTimeout(() => setShown(null), FADE_MS)
    return () => window.clearTimeout(id)
  }, [clip])

  if (!shown) return null

  const file = overlayFiles?.[shown]
  const family = clipFamilies?.[shown] ?? 'other'

  const wrapStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    zIndex: 5, // above the canvas, below the GameOverlay (z-10)
    pointerEvents: 'none',
    opacity: visible ? 1 : 0,
    transition: `opacity ${FADE_MS}ms ease`,
    // dark vignette — theatrical without hiding the 3D scene.
    background: 'radial-gradient(ellipse at 50% 50%, transparent 30%, rgba(0,0,0,0.55) 100%)',
  }
  const mediaStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  }

  return (
    <div style={wrapStyle} aria-hidden>
      {file ? (
        isVideo(file) ? (
          <video
            key={file}
            src={`/overlays/${file}`}
            style={mediaStyle}
            autoPlay
            muted
            loop
            playsInline
          />
        ) : (
          <img key={file} src={`/overlays/${file}`} style={mediaStyle} alt="" />
        )
      ) : (
        <div className={`cine-fallback cine-fallback-${family}`} />
      )}
    </div>
  )
}
