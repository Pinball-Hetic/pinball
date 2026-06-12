import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import type { CinematicClip, CinematicFamily } from '@pinball/shared-types'
import { OVERLAY_FILES } from '@/overlays-manifest'

interface CinematicOverlayProps {
  clip: CinematicClip | null
  /** Mapping clipId → famille (fourni par le manifest de la map). */
  clipFamilies?: Record<string, CinematicFamily>
}

const FADE_MS = 250

function isVideo(file: string): boolean {
  return file.endsWith('.webm')
}

// Overlay DOM joué pendant les gels cinématiques (au-dessus du canvas 3D,
// sous le GameOverlay). Asset animé si présent (manifest), sinon fallback CSS
// générique par famille. Un re-render par cinématique — jamais par frame.
export default function CinematicOverlay({ clip, clipFamilies }: CinematicOverlayProps) {
  const [shown, setShown] = useState<CinematicClip | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (clip) {
      setShown(clip)
      // tick suivant → transition d'opacité
      const id = window.requestAnimationFrame(() => setVisible(true))
      return () => window.cancelAnimationFrame(id)
    }
    setVisible(false)
    const id = window.setTimeout(() => setShown(null), FADE_MS)
    return () => window.clearTimeout(id)
  }, [clip])

  if (!shown) return null

  const file = OVERLAY_FILES[shown]
  const family = clipFamilies?.[shown] ?? 'other'

  const wrapStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    zIndex: 5, // au-dessus du canvas, sous le GameOverlay (z-10)
    pointerEvents: 'none',
    opacity: visible ? 1 : 0,
    transition: `opacity ${FADE_MS}ms ease`,
    // vignettage sombre — théâtralise sans masquer la scène 3D.
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
