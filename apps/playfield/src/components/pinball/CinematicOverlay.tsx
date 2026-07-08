import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import type { CinematicClip, CinematicFamily } from '@pinball/shared-types'

interface CinematicOverlayProps {
  clip: CinematicClip | null
  clipFamilies?: Record<string, CinematicFamily>
  overlayFiles?: Record<string, string>
}

const FADE_MS = 250

function isVideo(file: string): boolean {
  return file.endsWith('.webm')
}

export default function CinematicOverlay({ clip, clipFamilies, overlayFiles }: CinematicOverlayProps) {
  const [shown, setShown] = useState<CinematicClip | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (clip) {
      setShown(clip)
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
    zIndex: 5,
    pointerEvents: 'none',
    opacity: visible ? 1 : 0,
    transition: `opacity ${FADE_MS}ms ease`,
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
