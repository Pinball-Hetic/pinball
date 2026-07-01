import type { CSSProperties, ReactElement } from 'react'
import { useRouter } from 'next/router'
import { useDmdState } from '@/hooks/useDmdState'
import DmdCanvas from '@/components/DmdCanvas'
import NeonBand from '@/components/NeonBand'
import { NoSignal } from '@pinball/ui'
import type { DmdDisplay } from '@pinball/shared-types'
import { getDmdContent } from '@pinball/maps/dmd'
import { AVAILABLE_MAPS } from '@pinball/maps'
import { livesDisplay } from '@pinball/dmd-core'

function renderLives(livesRemaining: number): ReactElement {
  const view = livesDisplay(livesRemaining)
  if (view.kind === 'count') {
    return (
      <div className="flex items-center gap-2 text-4xl font-mono tabular-nums">
        <span>×{view.value}</span>
        <span>●</span>
      </div>
    )
  }
  return (
    <div className="flex gap-3 text-3xl">
      {Array.from({ length: view.total }).map((_, i) => (
        <span key={i} style={{ opacity: i < view.filled ? 1 : 0.2 }}>●</span>
      ))}
    </div>
  )
}

function renderDisplay(d: DmdDisplay): ReactElement {
  switch (d.mode) {
    case 'INTRO':
      return (
        <div className="flex flex-col items-center gap-4">
          <div className="text-xl font-mono uppercase tracking-[0.4em] text-zinc-500 animate-pulse">
            Press Espace
          </div>
        </div>
      )

    case 'SCORE':
      return (
        <div className="flex flex-col items-center gap-4">
          <div className="text-9xl font-mono font-bold tabular-nums">
            {d.score.toLocaleString()}
          </div>
        </div>
      )

    case 'EVENT':
      return (
        <div className="flex flex-col items-center gap-3">
          <div className="text-7xl font-mono font-bold uppercase tracking-widest text-yellow-300 drop-shadow-[0_0_20px_rgba(250,200,0,0.7)]">
            {d.label}
          </div>
          <div className="text-5xl font-mono tabular-nums text-amber-300">
            +{d.points.toLocaleString()}
          </div>
        </div>
      )

    case 'COMBO_FLASH':
      return (
        <div className="flex flex-col items-center gap-2">
          <div className="text-8xl font-mono font-bold uppercase tracking-widest text-orange-400 drop-shadow-[0_0_25px_rgba(255,140,0,0.8)]">
            COMBO
          </div>
          <div className="text-9xl font-mono font-bold tabular-nums text-yellow-200">
            x{d.combo}
          </div>
        </div>
      )

    case 'MULTI_FLASH':
      return (
        <div className="flex flex-col items-center gap-2">
          <div className="text-7xl font-mono font-bold uppercase tracking-widest text-cyan-300 drop-shadow-[0_0_25px_rgba(0,200,255,0.8)]">
            MULTIPLIER
          </div>
          <div className="text-9xl font-mono font-bold tabular-nums text-cyan-200">
            x{d.multiplier}
          </div>
        </div>
      )

    case 'LIFE_LOST':
      return (
        <div className="flex flex-col items-center gap-4">
          <div className="text-7xl font-mono font-bold uppercase tracking-widest text-red-400 drop-shadow-[0_0_20px_rgba(239,68,68,0.7)]">
            Ball Lost
          </div>
          {renderLives(d.livesRemaining)}
        </div>
      )

    case 'GAME_OVER':
      return (
        <div className="flex flex-col items-center gap-6">
          <div className="text-8xl font-mono font-bold uppercase tracking-[0.3em] text-red-500 drop-shadow-[0_0_30px_rgba(239,68,68,0.8)]">
            Game Over
          </div>
          <div className="text-7xl font-mono font-bold tabular-nums">
            {d.finalScore.toLocaleString()}
          </div>
        </div>
      )

    case 'CINEMATIC':
      // Placeholder no-op : rendu réel des clips en P15 (AsciiClipPlayer).
      return (
        <div className="flex flex-col items-center gap-4">
          <div className="text-6xl font-mono font-bold tabular-nums">
            {d.score.toLocaleString()}
          </div>
        </div>
      )
  }
}

const NO_SIGNAL_OVERLAY: CSSProperties = {
  position: 'absolute',
  inset: 0,
  zIndex: 10,
}

export default function ScoreboardPage() {
  const router = useRouter()
  const { display, alternateWorld, connected, mapId } = useDmdState()

  // Nom affiché de la map active (bandeau supérieur). Fallback sur l'id en
  // majuscules si la map n'est pas dans AVAILABLE_MAPS (map inconnue en dev).
  const mapName =
    AVAILABLE_MAPS.find((m) => m.id === mapId)?.name ?? mapId.toUpperCase()

  // Contenu DMD de la map active. key={mapId} sur DmdCanvas force un remontage
  // propre (ferme la boucle rAF précédente, recrée LAYOUTS/PALETTE/BURST).
  const mapDmdContent = getDmdContent(mapId) ?? {}

  // ?flat : ancien rendu JSX plat (debug). Attendre router.isReady pour
  // éviter de monter le canvas puis de basculer en flat.
  if (!router.isReady) {
    return <main style={{ minHeight: '100vh', background: '#000' }} />
  }

  if ('flat' in router.query) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-black text-white">
        {renderDisplay(display)}
        {!connected && (
          <div className="absolute top-4 right-4 text-red-500 text-sm font-mono">
            Disconnected
          </div>
        )}
      </main>
    )
  }

  const neonColor = mapDmdContent.neonColor

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#000',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
      }}
    >
      <NeonBand text={mapName} position="top" color={neonColor} />
      <DmdCanvas
        key={mapId}
        display={display}
        alternateWorld={alternateWorld}
        mapDmdContent={mapDmdContent}
      />
      <NeonBand text="PINBALL HETIC" position="bottom" color={neonColor} />
      {!connected && (
        <div style={NO_SIGNAL_OVERLAY}>
          <NoSignal reason="DMD — PAS DE SIGNAL SERVEUR" />
        </div>
      )}
    </main>
  )
}
