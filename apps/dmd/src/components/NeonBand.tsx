import type { CSSProperties } from 'react'

interface Props {
  text: string
  position: 'top' | 'bottom'
  color?: string
}

export default function NeonBand({ text, position, color = '#E71D23' }: Props) {
  const isTop = position === 'top'

  const hexToRgba = (hex: string, a: number) => {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return `rgba(${r},${g},${b},${a})`
  }
  const glow = hexToRgba(color, 0.7)
  const bgGlow = hexToRgba(color, 0.12)

  const containerStyle: CSSProperties = {
    height: 220,
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: `radial-gradient(ellipse at center, ${bgGlow} 0%, #000000 72%)`,
    borderTop: isTop ? undefined : `3px solid ${color}`,
    borderBottom: isTop ? `3px solid ${color}` : undefined,
    boxShadow: isTop
      ? `0 6px 28px -4px ${glow}`
      : `0 -6px 28px -4px ${glow}`,
  }
  const textStyle: CSSProperties = {
    fontFamily: 'Georgia, "Times New Roman", serif',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    fontSize: 100,
    letterSpacing: '0.16em',
    color,
    textShadow: `0 0 10px ${color}, 0 0 30px ${color}, 0 0 60px ${color}88`,
    whiteSpace: 'nowrap',
  }
  return (
    <div style={containerStyle}>
      <span style={textStyle}>{text}</span>
    </div>
  )
}
