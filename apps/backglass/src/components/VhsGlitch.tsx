import { ReactNode } from 'react'

interface VhsGlitchProps {
  children: ReactNode
  className?: string
}

// Reusable transition wrapper: scanlines + tracking band + brief RGB split
// on entry. Used by every takeover.
export default function VhsGlitch({ children, className }: VhsGlitchProps) {
  return (
    <div className={`vhs ${className ?? ''}`}>
      <div className="vhs-content vhs-enter">{children}</div>
      <div className="vhs-scanlines" />
      <div className="vhs-track" />
    </div>
  )
}
