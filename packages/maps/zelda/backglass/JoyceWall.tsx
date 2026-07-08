import { cx } from './artStyles'
import { useEffect, useRef, useState } from 'react'
import type { Reactor } from './reactor'

interface JoyceWallProps {
  message: string | null
  messageId?: number
  reactor?: Reactor
}

function TriforceIcon() {
  return (
    <svg viewBox="0 0 60 52" className={cx('logo-triforce')} aria-hidden>
      <polygon points="0,52 30,0 60,52" fill="none" stroke="#FFD700" strokeWidth="2.5"
        style={{ filter: 'drop-shadow(0 0 6px #FFD700)' }} />
    </svg>
  )
}

export default function JoyceWall({ message, messageId }: JoyceWallProps) {
  const [visibleMsg, setVisibleMsg] = useState<string | null>(null)
  const [glow, setGlow] = useState(false)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    if (!message) return
    if (timerRef.current) window.clearTimeout(timerRef.current)
    setVisibleMsg(message.toUpperCase())
    setGlow(true)
    timerRef.current = window.setTimeout(() => {
      setGlow(false)
      timerRef.current = window.setTimeout(() => setVisibleMsg(null), 600)
    }, 4_000)
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
    }
    // eslint-disable-next-line
  }, [messageId, message])

  return (
    <div className={cx('zelda-header')}>
      <TriforceIcon />
      <div className={cx('zelda-title')}>THE LEGEND OF ZELDA</div>
      <div
        className={cx('zelda-message', glow ? 'zelda-message-glow' : '')}
        aria-live="polite"
      >
        {visibleMsg ?? ' '}
      </div>
    </div>
  )
}
