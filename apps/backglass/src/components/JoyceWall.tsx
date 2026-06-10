import { useEffect, useRef, useState } from 'react'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
const ROW1 = ALPHABET.slice(0, 13)
const ROW2 = ALPHABET.slice(13)

// Couleurs guirlande variées (façon mur de Joyce)
const GARLAND = [
  '#ff3b30', '#ffcc00', '#34c759', '#00c7ff', '#bf5af2',
  '#ff9f0a', '#ff2d92', '#5e5ce6', '#30d158', '#ff6b3b',
  '#64d2ff', '#ffd60a', '#ff453a',
]

function colorFor(i: number): string {
  return GARLAND[i % GARLAND.length]
}

type Glow = number[] // 0..1 par lettre

const OFF: Glow = new Array(26).fill(0)

interface JoyceWallProps {
  message: string | null
}

export default function JoyceWall({ message }: JoyceWallProps) {
  const [glow, setGlow] = useState<Glow>(OFF)
  const queueRef = useRef<string[]>([])
  const busyRef = useRef(false)
  const timersRef = useRef<number[]>([])
  const ambientRef = useRef<number | null>(null)

  const clearTimers = () => {
    timersRef.current.forEach((t) => window.clearTimeout(t))
    timersRef.current = []
  }
  const later = (fn: () => void, ms: number) => {
    timersRef.current.push(window.setTimeout(fn, ms))
  }

  // Flicker d'ambiance (sans message en cours)
  useEffect(() => {
    const tick = () => {
      if (!busyRef.current) {
        const idx = Math.floor(Math.random() * 26)
        setGlow((prev) => {
          const next = [...prev]
          next[idx] = 0.5
          return next
        })
        window.setTimeout(() => {
          setGlow((prev) => {
            if (busyRef.current) return prev
            const next = [...prev]
            next[idx] = 0
            return next
          })
        }, 180)
      }
      ambientRef.current = window.setTimeout(tick, 1000 + Math.random() * 2000)
    }
    ambientRef.current = window.setTimeout(tick, 1500)
    return () => {
      if (ambientRef.current) window.clearTimeout(ambientRef.current)
    }
  }, [])

  // File de messages : chaque changement enfile, le runner enchaîne
  useEffect(() => {
    if (!message) return
    queueRef.current.push(message)
    if (!busyRef.current) runNext()
  }, [message])

  const runNext = () => {
    const msg = queueRef.current.shift()
    if (!msg) {
      busyRef.current = false
      return
    }
    busyRef.current = true
    clearTimers()
    setGlow(OFF)

    const letters = msg.toUpperCase().split('').filter((c) => /[A-Z]/.test(c))
    const STEP = 350

    letters.forEach((c, i) => {
      const idx = c.charCodeAt(0) - 65
      later(() => {
        // flash fort
        setGlow((prev) => {
          const next = [...prev]
          next[idx] = 1
          return next
        })
        // puis retombe faiblement allumée
        later(() => {
          setGlow((prev) => {
            const next = [...prev]
            next[idx] = Math.max(next[idx] === 1 ? 0.45 : next[idx], 0.45)
            return next
          })
        }, 220)
      }, i * STEP)
    })

    const total = letters.length * STEP
    // tout s'éteint 2s après la fin, puis message suivant
    later(() => {
      setGlow(OFF)
      later(() => runNext(), 250)
    }, total + 2000)
  }

  useEffect(() => () => clearTimers(), [])

  return (
    <div className="joyce-wall">
      {[ROW1, ROW2].map((row, r) => (
        <div key={r} className="joyce-row">
          {row.map((letter, c) => {
            const idx = r * 13 + c
            const g = glow[idx]
            const color = colorFor(idx)
            return (
              <div key={letter} className="joyce-cell">
                <span
                  className="joyce-bulb"
                  style={{
                    background: color,
                    opacity: 0.25 + g * 0.75,
                    boxShadow: g > 0
                      ? `0 0 ${6 + g * 26}px ${2 + g * 8}px ${color}`
                      : `0 0 4px 1px ${color}55`,
                  }}
                />
                <span
                  className="joyce-letter"
                  style={{
                    color: g > 0.6 ? color : '#d8c9b0',
                    textShadow: g > 0.6 ? `0 0 18px ${color}` : 'none',
                    opacity: 0.5 + g * 0.5,
                  }}
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
