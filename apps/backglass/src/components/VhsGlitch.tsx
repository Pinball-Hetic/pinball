import { ReactNode } from 'react'

interface VhsGlitchProps {
  children: ReactNode
  className?: string
}

// Wrapper de transition réutilisable : scanlines + tracking band + RGB
// split bref à l'entrée. Utilisé par chaque takeover.
export default function VhsGlitch({ children, className }: VhsGlitchProps) {
  return (
    <div className={`vhs ${className ?? ''}`}>
      <div className="vhs-content vhs-enter">{children}</div>
      <div className="vhs-scanlines" />
      <div className="vhs-track" />
    </div>
  )
}
