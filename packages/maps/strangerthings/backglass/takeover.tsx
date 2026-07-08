import { cx } from './artStyles'
import type { ComponentType, ReactNode } from 'react'
import type { GameOver } from '@pinball/shared-types'
import SideArt from './SideArt'
import DemogorgonTakeover from './DemogorgonTakeover'

type VhsComponent = ComponentType<{ children: ReactNode; className?: string }>

export interface MapTakeoverContext {
  payload?: GameOver & { rank: number }
  Vhs: VhsComponent
}

function rocketTakeover(Vhs: VhsComponent, label: string): ReactNode {
  return (
    <Vhs className={cx('tk-cine-rocket')}>
      <div className={cx('cine-rocket')} />
      <div className="tk-center">
        <div className="tk-kicker tabular-nums">{label}</div>
      </div>
    </Vhs>
  )
}

export function renderMapTakeover(clip: string, ctx: MapTakeoverContext): ReactNode | null {
  const { payload, Vhs } = ctx
  switch (clip) {
    case 'demogorgon_rises':
      return (
        <Vhs className={cx('tk-cine-rises')}>
          <div className={cx('cine-blackout')} />
          <div className={cx('cine-giant-side')}>
            <SideArt mood="alternate" agitation={1} />
          </div>
          <div className="tk-center">
            <div className={cx('glitch-text', 'cine-run')} data-text="RUN">
              RUN
            </div>
          </div>
        </Vhs>
      )

    case 'portal_swallow':
      return (
        <Vhs className={cx('tk-cine-portal')}>
          <div className={cx('cine-portal-wave')} />
        </Vhs>
      )

    case 'demogorgon_slain':
      return (
        <>
          <DemogorgonTakeover />
          <div className={cx('cine-demo-count')}>+1 DEMOGORGON</div>
        </>
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

    case 'milestone_5k':
      return rocketTakeover(Vhs, '5 000')
    case 'milestone_15k':
      return rocketTakeover(Vhs, '15 000')
    case 'milestone_30k':
      return rocketTakeover(Vhs, '30 000')
    case 'milestone_big':
      return rocketTakeover(
        Vhs,
        (payload?.finalScore ?? 50000).toLocaleString('fr-FR'),
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

    case 'event_demogorgon_slain':
      return <DemogorgonTakeover />

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
  milestone_5k: { goldWave: true, takeoverMs: 4_000 },
  milestone_15k: { goldWave: true, joyce: 'BIEN', takeoverMs: 8_000 },
  hetic_letter: { joyce: (v) => 'HETIC'[(v ?? 1) - 1] ?? 'H', noTakeover: true },
  milestone_30k: { takeoverMs: 4_000 },
  milestone_big: { takeoverMs: 6_000 },
  hetic_complete: { takeoverMs: 8_000, fever: true },
  demogorgon_rises: { joyce: 'RUN' },
  last_chance: { joyce: 'DERNIERE VIE' },
  portal_swallow: { holdsHallFlip: true },
}

export interface EventTakeover {
  clipKey: string
  durationMs: number
  priority: number
  joyce?: string
}

export const eventTakeovers: Record<string, EventTakeover> = {
  'DEMOGORGON VAINCU': {
    clipKey: 'event_demogorgon_slain',
    durationMs: 3_000,
    priority: 60,
    joyce: 'RUN',
  },
}
