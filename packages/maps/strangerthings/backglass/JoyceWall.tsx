import { cx } from './artStyles'
import { useEffect, useRef } from 'react'
import type { Reactor } from './reactor'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
const ROW1 = ALPHABET.slice(0, 13)
const ROW2 = ALPHABET.slice(13)

const GARLAND = [
  '#ff3b30', '#ffcc00', '#34c759', '#00c7ff', '#bf5af2',
  '#ff9f0a', '#ff2d92', '#5e5ce6', '#30d158', '#ff6b3b',
  '#64d2ff', '#ffd60a', '#ff453a',
]

const colorFor = (i: number) => GARLAND[i % GARLAND.length]

interface JoyceWallProps {
  message: string | null
  messageId?: number // bump to re-enqueue even when the text is identical
  reactor?: Reactor
}

export default function JoyceWall({ message, messageId, reactor }: JoyceWallProps) {
  const bulbRefs = useRef<(HTMLSpanElement | null)[]>([])
  const letterRefs = useRef<(HTMLSpanElement | null)[]>([])
  const queueRef = useRef<string[]>([])
  const busyRef = useRef(false)
  const timersRef = useRef<Set<number>>(new Set())
  const hitCursorRef = useRef(0)

  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timersRef.current.delete(id)
      fn()
    }, ms)
    timersRef.current.add(id)
  }

  const applyGlow = (idx: number, g: number) => {
    const bulb = bulbRefs.current[idx]
    const letter = letterRefs.current[idx]
    if (!bulb || !letter) return
    const color = colorFor(idx)
    bulb.style.opacity = String(0.25 + g * 0.75)
    bulb.style.boxShadow =
      g > 0 ? `0 0 ${6 + g * 26}px ${2 + g * 8}px ${color}` : `0 0 4px 1px ${color}55`
    letter.style.color = g > 0.6 ? color : '#d8c9b0'
    letter.style.textShadow = g > 0.6 ? `0 0 18px ${color}` : 'none'
    letter.style.opacity = String(0.5 + g * 0.5)
  }

  const flickerBulb = (idx: number, peak = 0.6, holdMs = 180) => {
    applyGlow(idx, peak)
    later(() => {
      if (!busyRef.current) applyGlow(idx, 0)
    }, holdMs)
  }

  const enqueue = (text: string) => {
    queueRef.current.push(text)
    if (!busyRef.current) runNext()
  }

  const runNext = () => {
    const msg = queueRef.current.shift()
    if (!msg) {
      busyRef.current = false
      return
    }
    busyRef.current = true
    for (let i = 0; i < 26; i++) applyGlow(i, 0)

    const letters = msg.toUpperCase().split('').filter((c) => /[A-Z]/.test(c))
    const STEP = 350
    letters.forEach((c, i) => {
      const idx = c.charCodeAt(0) - 65
      later(() => {
        applyGlow(idx, 1)
        later(() => applyGlow(idx, 0.45), 220)
      }, i * STEP)
    })
    const total = letters.length * STEP
    later(() => {
      for (let i = 0; i < 26; i++) applyGlow(i, 0)
      later(() => runNext(), 250)
    }, total + 2000)
  }

  useEffect(() => {
    let alive = true
    let timer = 0
    const tick = () => {
      if (!alive) return
      if (!busyRef.current) {
        const idx = Math.floor(Math.random() * 26)
        flickerBulb(idx, 0.5, 170)
      }
      const heat = reactor?.getHeat() ?? 0
      const base = 1000 + Math.random() * 2000
      const delay = base * (1 - heat * 0.85)
      timer = window.setTimeout(tick, Math.max(180, delay))
    }
    timer = window.setTimeout(tick, 1500)
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
    // eslint-disable-next-line
  }, [reactor])

  useEffect(() => {
    if (message) enqueue(message)
    // eslint-disable-next-line
  }, [messageId, message])

  useEffect(() => {
    if (!reactor) return
    const off = reactor.on((r) => {
      if (r.kind === 'gameStart') {
        enqueue(r.player)
      } else if (r.kind === 'hit') {
        if (busyRef.current) return
        const idx = (hitCursorRef.current * 7 + 3) % 26
        hitCursorRef.current += 1
        flickerBulb(idx, 0.4 + r.intensity * 0.6, 160)
      } else if (r.kind === 'combo') {
        if (busyRef.current) return
        const step = Math.max(28, 110 - r.combo * 6)
        for (let i = 0; i < 26; i++) {
          later(() => flickerBulb(i, 0.85, 140), i * step)
        }
      } else if (r.kind === 'lifeLost') {
        busyRef.current = true
        for (let i = 0; i < 26; i++) applyGlow(i, 0.4)
        for (let i = 0; i < 26; i++) {
          later(() => applyGlow(i, 0), 200 + i * 45)
        }
        later(() => {
          busyRef.current = false
        }, 200 + 26 * 45 + 200)
      }
    })
    return off
  }, [reactor])

  useEffect(() => {
    const timers = timersRef.current
    return () => timers.forEach((t) => window.clearTimeout(t))
  }, [])

  return (
    <div className={cx('joyce-wall')}>
      {[ROW1, ROW2].map((row, r) => (
        <div key={r} className={cx('joyce-row')}>
          {row.map((letter, c) => {
            const idx = r * 13 + c
            const color = colorFor(idx)
            return (
              <div key={letter} className={cx('joyce-cell')}>
                <span
                  ref={(el) => {
                    bulbRefs.current[idx] = el
                  }}
                  className={cx('joyce-bulb')}
                  style={{ background: color, opacity: 0.25, boxShadow: `0 0 4px 1px ${color}55` }}
                />
                <span
                  ref={(el) => {
                    letterRefs.current[idx] = el
                  }}
                  className={cx('joyce-letter')}
                  style={{ color: '#d8c9b0', opacity: 0.5 }}
                >
                  {letter}
                </span>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
