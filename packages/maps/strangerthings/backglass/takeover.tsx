import type { ComponentType, ReactNode } from 'react'
import type { GameOver } from '@pinball/shared-types'
import SideArt from './SideArt'
import DemogorgonTakeover from './DemogorgonTakeover'

// VhsGlitch vit côté app (générique, classes CSS dans son globals). On
// l'injecte au lieu d'importer l'app (sens de dépendance maps → core, jamais
// maps → app).
type VhsComponent = ComponentType<{ children: ReactNode; className?: string }>

export interface MapTakeoverContext {
  payload?: GameOver & { rank: number }
  Vhs: VhsComponent
}

// Visuel de takeover propre à la map pour un clip (ou une clé d'event-scene).
// Retourne null si le clip n'a pas de takeover ST → le core gère
// hall_of_fame + le fallback générique. Les classes CSS référencées sont
// définies dans le globals.css de l'app backglass (thème ST à extraire — TODO).
export function renderMapTakeover(clip: string, ctx: MapTakeoverContext): ReactNode | null {
  const { payload, Vhs } = ctx
  switch (clip) {
    case 'demogorgon_rises':
      return (
        <Vhs className="tk-cine-rises">
          <div className="cine-blackout" />
          <div className="cine-giant-side">
            <SideArt mood="upsideDown" agitation={1} />
          </div>
          <div className="tk-center">
            <div className="glitch-text cine-run" data-text="RUN">
              RUN
            </div>
          </div>
        </Vhs>
      )

    case 'portal_swallow':
      return (
        <Vhs className="tk-cine-portal">
          <div className="cine-portal-wave" />
        </Vhs>
      )

    case 'demogorgon_slain':
      return (
        <>
          <DemogorgonTakeover />
          <div className="cine-demo-count">+1 DEMOGORGON</div>
        </>
      )

    case 'last_chance':
      return (
        <Vhs className="tk-cine-last">
          <div className="cine-last-vignette" />
          <div className="tk-center">
            <div className="tk-kicker cine-last-text">DERNIÈRE VIE</div>
          </div>
        </Vhs>
      )

    case 'milestone_30k':
      return (
        <Vhs className="tk-cine-rocket">
          <div className="cine-rocket" />
          <div className="tk-center">
            <div className="tk-kicker tabular-nums">30 000</div>
          </div>
        </Vhs>
      )

    case 'milestone_big':
      return (
        <Vhs className="tk-cine-fireworks">
          <div className="tk-confetti">
            {Array.from({ length: 50 }).map((_, i) => (
              <span
                key={i}
                className="confetti-dot"
                style={{
                  left: `${(i * 31) % 100}%`,
                  background: i % 2 ? '#ffd95e' : '#ff7700',
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
        <Vhs className="tk-cine-hetic">
          <div className="cine-hetic-letters">
            {'HETIC'.split('').map((c, i) => (
              <span key={i} style={{ animationDelay: `${i * 0.12}s` }}>
                {c}
              </span>
            ))}
          </div>
          <div className="tk-center">
            <div className="tk-kicker cine-fever-text">FEVER</div>
          </div>
        </Vhs>
      )

    // Scène déclenchée par un event serveur (cf. eventTakeovers).
    case 'event_demogorgon_slain':
      return <DemogorgonTakeover />

    default:
      return null
  }
}

// Side-effects de dispatch par clip : joyce / onde dorée / fever / takeover.
// Drive le switch (jadis hardcodé ST) du hook useBackglassTakeover de façon
// data-driven. Absent de la table → takeover générique via clipShowMs.
export interface ClipBehavior {
  joyce?: string | ((value?: number) => string)
  goldWave?: boolean
  fever?: boolean
  takeoverMs?: number // durée explicite du takeover
  noTakeover?: boolean // joyce/onde seule, pas de takeover
  holdsHallFlip?: boolean // retarde le flip 3D du hall of fame pendant le clip
}

export const clipBehavior: Record<string, ClipBehavior> = {
  milestone_5k: { goldWave: true, noTakeover: true },
  milestone_15k: { goldWave: true, joyce: 'BIEN', noTakeover: true },
  hetic_letter: { joyce: (v) => 'HETIC'[(v ?? 1) - 1] ?? 'H', noTakeover: true },
  milestone_30k: { takeoverMs: 4_000 },
  milestone_big: { takeoverMs: 6_000 },
  hetic_complete: { takeoverMs: 8_000, fever: true },
  demogorgon_rises: { joyce: 'RUN' },
  last_chance: { joyce: 'DERNIERE VIE' },
  portal_swallow: { holdsHallFlip: true },
}

// Takeover déclenché par un event serveur (dmd:display mode EVENT, par label).
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
