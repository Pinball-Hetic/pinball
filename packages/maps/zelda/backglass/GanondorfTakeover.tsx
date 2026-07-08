import { cx } from './artStyles'

export default function GanondorfTakeover() {
  const S = 128
  const H = S * Math.sqrt(3) / 2
  const cx0 = 200, cy0 = 130
  const tri = {
    top: `${cx0},${cy0} ${cx0 - S / 2},${cy0 + H} ${cx0 + S / 2},${cy0 + H}`,
    bl:  `${cx0 - S / 2},${cy0 + H} ${cx0 - S},${cy0 + 2 * H} ${cx0},${cy0 + 2 * H}`,
    br:  `${cx0 + S / 2},${cy0 + H} ${cx0},${cy0 + 2 * H} ${cx0 + S},${cy0 + 2 * H}`,
  }

  return (
    <div className={cx('vhs', 'tk-ganondorf')}>
      <div className={cx('vhs-content', 'vhs-enter')}>
        <div className={cx('gano-flash')} />
        <svg viewBox="0 0 400 600" className={cx('gano-giant')} preserveAspectRatio="xMidYMid meet">
          <defs>
            <filter id="ganoGlow" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="8" result="blur" />
              <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>
          <radialGradient id="ganoHalo" cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor="#FFD700" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#FFD700" stopOpacity="0" />
          </radialGradient>
          <ellipse cx="200" cy={cy0 + H} rx="160" ry="110" fill="url(#ganoHalo)" />
          <g filter="url(#ganoGlow)">
            <polygon points={tri.top} fill="#3a2a00" fillOpacity="0.6" stroke="#FFD700" strokeWidth="3" strokeOpacity="0.95" />
            <polygon points={tri.bl}  fill="#3a2a00" fillOpacity="0.6" stroke="#FFD700" strokeWidth="3" strokeOpacity="0.95" />
            <polygon points={tri.br}  fill="#3a2a00" fillOpacity="0.6" stroke="#FFD700" strokeWidth="3" strokeOpacity="0.95" />
          </g>
        </svg>
        <div className={cx('tk-center', 'gano-text')}>
          <div className="glitch-text" data-text="GANONDORF VAINCU">GANONDORF VAINCU</div>
          <div className={cx('gano-points')}>+500</div>
        </div>
      </div>
      <div className="vhs-scanlines" />
      <div className="vhs-track" />
    </div>
  )
}
