import { ReactNode } from 'react'

interface VhsGlitchProps {
  children: ReactNode
  className?: string
}

export default function VhsGlitch({ children, className }: VhsGlitchProps) {
  return (
    <div className={`vhs ${className ?? ''}`}>
      <div className="vhs-content vhs-enter">{children}</div>
      <div className="vhs-scanlines" />
      <div className="vhs-track" />
    </div>
  )
}
