// Wrapper VHS inliné (scanlines + tracking band) — classes CSS définies dans
// le globals.css de l'app backglass.
export default function DemogorgonTakeover() {
  return (
    <div className="vhs tk-demogorgon">
      <div className="vhs-content vhs-enter">
        <div className="demo-flash" />
        <svg viewBox="0 0 400 600" className="demo-giant" preserveAspectRatio="xMidYMid meet">
          <g fill="#0a0202" stroke="#ff2d2d" strokeOpacity="0.7" strokeWidth="2">
            <path d="M200 240 C150 300 150 520 185 580 L215 580 C250 520 250 300 200 240 Z" />
            {Array.from({ length: 6 }).map((_, i) => {
              const a = (Math.PI * (i - 2.5)) / 5
              const x = 200 + Math.cos(a - Math.PI / 2) * 90
              const y = 200 + Math.sin(a - Math.PI / 2) * 90
              return (
                <path
                  key={i}
                  className="demo-petal"
                  style={{ animationDelay: `${i * 0.08}s` }}
                  d={`M200 205 Q${(200 + x) / 2} ${(205 + y) / 2 - 40} ${x} ${y} Q${(200 + x) / 2} ${(205 + y) / 2 + 14} 200 205 Z`}
                />
              )
            })}
          </g>
        </svg>
        <div className="tk-center demo-text">
          <div className="glitch-text" data-text="DEMOGORGON VAINCU">DEMOGORGON VAINCU</div>
          <div className="demo-points">+500</div>
        </div>
      </div>
      <div className="vhs-scanlines" />
      <div className="vhs-track" />
    </div>
  )
}
