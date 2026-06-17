import { cx } from './artStyles'
import type { ComponentType, ReactNode } from 'react'
import type { GameOver } from '@pinball/shared-types'
import SideArt from './SideArt'
import GanondorfTakeover from './GanondorfTakeover'

type VhsComponent = ComponentType<{ children: ReactNode; className?: string }>

export interface MapTakeoverContext {
  payload?: GameOver & { rank: number }
  Vhs: VhsComponent
}

// Visuel de takeover propre à la map Zelda pour un clip (ou une clé d'event).
// Retourne null → le core gère hall_of_fame + le fallback générique.
export function renderMapTakeover(clip: string, ctx: MapTakeoverContext): ReactNode | null {
  const { payload, Vhs } = ctx
  switch (clip) {
    case 'ganondorf_rises':
      return (
        <Vhs className={cx('tk-cine-rises')}>
          <div className={cx('cine-blackout')} />
          <div className={cx('cine-giant-side')}>
            <SideArt mood="alternate" agitation={1} />
          </div>
          <div className="tk-center">
            <div className={cx('cine-rises-text')}>GANONDORF</div>
          </div>
        </Vhs>
      )

    case 'darklink_rises':
      return (
        <Vhs className={cx('tk-cine-dark')}>
          <div className={cx('cine-blackout')} />
          <div className="tk-center">
            <div className={cx('cine-dark-text')}>DARK LINK</div>
          </div>
        </Vhs>
      )

    case 'sacred_realm':
      return (
        <Vhs className={cx('tk-cine-portal')}>
          <div className={cx('cine-portal-wave')} />
        </Vhs>
      )

    case 'ganondorf_slain':
      return (
        <>
          <GanondorfTakeover />
          <div className={cx('cine-boss-count')}>+1 GANONDORF</div>
        </>
      )

    case 'darklink_slain':
      return (
        <Vhs className={cx('tk-cine-darklink-slain')}>
          <div className="tk-center">
            <div className={cx('glitch-text', 'cine-slain-text')} data-text="DARK LINK VAINCU">
              DARK LINK VAINCU
            </div>
            <div className={cx('boss-points')}>+500</div>
          </div>
        </Vhs>
      )

    case 'last_chance':
      return (
        <Vhs className={cx('tk-cine-last')}>
          <div className={cx('cine-last-vignette')} />
          <div className="tk-center">
            <div className={cx('tk-kicker', 'cine-last-text')}>DERNIÈRE VIE</div>
          </div>
        </Vhs>
      )

    case 'milestone_30k':
      return (
        <Vhs className={cx('tk-cine-milestone')}>
          <div className={cx('cine-triforce')} />
          <div className="tk-center">
            <div className="tk-kicker tabular-nums">30 000</div>
          </div>
        </Vhs>
      )

    case 'milestone_big':
      return (
        <Vhs className={cx('tk-cine-fireworks')}>
          <div className="tk-confetti">
            {Array.from({ length: 50 }).map((_, i) => (
              <span
                key={i}
                className="confetti-dot"
                style={{
                  left: `${(i * 31) % 100}%`,
                  background: i % 3 === 0 ? '#FFD700' : i % 3 === 1 ? '#22cc44' : '#4a80ff',
                  animationDelay: `${(i % 12) * 0.1}s`,
                  animationDuration: `${1.4 + (i % 5) * 0.3}s`,
                }}
              />
            ))}
          </div>
          <div className="tk-center">
            <div className="tk-score tabular-nums">
              {(payload?.finalScore ?? 50000).toLocaleString('fr-FR')}
            </div>
          </div>
        </Vhs>
      )

    case 'hetic_complete':
      return (
        <Vhs className={cx('tk-cine-hetic')}>
          <div className={cx('cine-hetic-letters')}>
            {'HETIC'.split('').map((c, i) => (
              <span key={i} style={{ animationDelay: `${i * 0.12}s` }}>
                {c}
              </span>
            ))}
          </div>
          <div className="tk-center">
            <div className={cx('tk-kicker', 'cine-fever-text')}>FEVER</div>
          </div>
        </Vhs>
      )

    case 'event_ganondorf_slain':
      return <GanondorfTakeover />

    case 'event_darklink_slain':
      return (
        <div className={cx('tk-event-darklink')}>
          <div className="tk-center">
            <div className="glitch-text" data-text="DARK LINK VAINCU">DARK LINK VAINCU</div>
          </div>
        </div>
      )

    default:
      return null
  }
}

export interface ClipBehavior {
  joyce?: string | ((value?: number) => string)
  goldWave?: boolean
  fever?: boolean
  takeoverMs?: number
  noTakeover?: boolean
  holdsHallFlip?: boolean
}

export const clipBehavior: Record<string, ClipBehavior> = {
  milestone_5k: { goldWave: true, noTakeover: true },
  milestone_15k: { goldWave: true, joyce: 'BIEN', noTakeover: true },
  hetic_letter: { joyce: (v) => 'HETIC'[(v ?? 1) - 1] ?? 'H', noTakeover: true },
  milestone_30k: { takeoverMs: 4_000 },
  milestone_big: { takeoverMs: 6_000 },
  hetic_complete: { takeoverMs: 8_000, fever: true },
  ganondorf_rises: { joyce: 'GANONDORF' },
  darklink_rises: { joyce: 'DARK LINK' },
  last_chance: { joyce: 'DERNIERE VIE' },
  sacred_realm: { holdsHallFlip: true },
}

export interface EventTakeover {
  clipKey: string
  durationMs: number
  priority: number
  joyce?: string
}

export const eventTakeovers: Record<string, EventTakeover> = {
  'GANONDORF VAINCU': {
    clipKey: 'event_ganondorf_slain',
    durationMs: 3_000,
    priority: 60,
    joyce: 'GANONDORF',
  },
  'DARK LINK VAINCU': {
    clipKey: 'event_darklink_slain',
    durationMs: 3_000,
    priority: 55,
    joyce: 'DARK LINK',
  },
}
