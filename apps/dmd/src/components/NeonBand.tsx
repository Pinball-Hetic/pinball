import type { CSSProperties } from 'react'

interface Props {
  text: string
  position: 'top' | 'bottom'
}

// Bande décor CSS pur, style néon Stranger Things.
export default function NeonBand({ text, position }: Props) {
  const isTop = position === 'top'
  const containerStyle: CSSProperties = {
    height: 300,
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'radial-gradient(ellipse at center, #2a0000 0%, #000000 72%)',
    borderTop: isTop ? undefined : '3px solid #E71D23',
    borderBottom: isTop ? '3px solid #E71D23' : undefined,
    boxShadow: isTop
      ? '0 6px 28px -4px rgba(231,29,35,0.7)'
      : '0 -6px 28px -4px rgba(231,29,35,0.7)',
  }
  const textStyle: CSSProperties = {
    fontFamily: 'Georgia, "Times New Roman", serif',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    fontSize: 100,
    letterSpacing: '0.16em',
    color: '#E71D23',
    textShadow: '0 0 10px #E71D23, 0 0 30px #E71D23, 0 0 60px #b3000a',
    whiteSpace: 'nowrap',
  }
  return (
    <div style={containerStyle}>
      <span style={textStyle}>{text}</span>
    </div>
  )
}
