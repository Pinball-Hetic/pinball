import type { CSSProperties } from 'react'

interface NoSignalProps {
  /** Raison affichée sous le titre (ex. "MAP INTROUVABLE"). */
  reason?: string
}

// Écran NO SIGNAL plein écran : noir, scanlines CRT, grain animé, texte
// phosphore qui dérive, flicker. CSS pur, zéro asset — fallback quand une map
// est introuvable ou son contenu absent. Partagé playfield + backglass.
export default function NoSignal({ reason }: NoSignalProps) {
  return (
    <div style={WRAP} aria-label="no signal">
      <style>{KEYFRAMES}</style>
      <div style={SCANLINES} />
      <div style={GRAIN} />
      <div style={CENTER}>
        <div style={TITLE}>NO SIGNAL</div>
        {reason ? <div style={REASON}>{reason}</div> : null}
      </div>
    </div>
  )
}

const WRAP: CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: '#050505',
  overflow: 'hidden',
  zIndex: 9999,
  fontFamily: 'monospace',
}

const SCANLINES: CSSProperties = {
  position: 'absolute',
  inset: 0,
  backgroundImage:
    'repeating-linear-gradient(0deg, rgba(255,255,255,0.06) 0px, rgba(255,255,255,0.06) 1px, transparent 2px, transparent 4px)',
  pointerEvents: 'none',
}

const GRAIN: CSSProperties = {
  position: 'absolute',
  inset: 0,
  opacity: 0.12,
  backgroundImage:
    'radial-gradient(rgba(255,255,255,0.8) 0.5px, transparent 0.5px)',
  backgroundSize: '3px 3px',
  animation: 'nosignal-grain 0.12s steps(2) infinite',
  pointerEvents: 'none',
}

const CENTER: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.8rem',
  animation: 'nosignal-drift 6s ease-in-out infinite, nosignal-flicker 4s steps(40) infinite',
}

const TITLE: CSSProperties = {
  color: '#9effa0',
  fontSize: 'clamp(2rem, 8vw, 6rem)',
  letterSpacing: '0.3em',
  textShadow: '0 0 12px rgba(120,255,140,0.7), 0 0 32px rgba(120,255,140,0.35)',
}

const REASON: CSSProperties = {
  color: 'rgba(158,255,160,0.7)',
  fontSize: 'clamp(0.8rem, 2.5vw, 1.4rem)',
  letterSpacing: '0.2em',
}

const KEYFRAMES = `
@keyframes nosignal-grain { 0% { transform: translate(0,0); } 100% { transform: translate(-2px,1px); } }
@keyframes nosignal-drift { 0%,100% { transform: translateY(-1.5%); } 50% { transform: translateY(1.5%); } }
@keyframes nosignal-flicker { 0%,100% { opacity: 1; } 92% { opacity: 1; } 94% { opacity: 0.6; } 96% { opacity: 1; } }
`
