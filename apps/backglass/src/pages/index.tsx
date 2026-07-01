import { useEffect, useRef, useState } from 'react'
import { NoSignal } from '@pinball/ui'
import { createPinballSocket, type PinballSocket } from '@pinball/shared-types/src/socket-client'
import { useBackglassData } from '@/hooks/useBackglassData'
import { useBackglassTakeover } from '@/hooks/useBackglassTakeover'
import { useIngameReactor } from '@/hooks/useIngameReactor'
import { MapContentProvider, useMapContent } from '@/map/content'
import { getBackglassContent } from '@pinball/maps/backglass'
import HallOfFame from '@/components/HallOfFame'
import StatsBanner from '@/components/StatsBanner'
import ReactorFx from '@/components/ReactorFx'
import HighScoreTakeover from '@/components/takeovers/HighScoreTakeover'
import RecapTakeover from '@/components/takeovers/RecapTakeover'
import AttractScene from '@/components/takeovers/AttractScene'
import CinematicTakeover from '@/components/takeovers/CinematicTakeover'

// BackglassPage : appelé à la racine, gère le cycle de vie du mapId.
// La sélection de map arrive via le socket (useBackglassData) et provoque un
// remontage propre du Stage (key={mapId}) avec le bon contenu de map.
export default function BackglassPage() {
  const { entries, stats, connected, mapId } = useBackglassData()
  const content = getBackglassContent(mapId) ?? null

  if (!content) {
    return (
      <div style={{ position: 'absolute', inset: 0 }}>
        <NoSignal reason={`BACKGLASS — MAP "${mapId}" INTROUVABLE`} />
      </div>
    )
  }

  return (
    <MapContentProvider value={content}>
      {/* key={mapId} : remonte le Stage complet (hooks, socket takeover, art)
          à chaque changement de map → pas d'état résiduel de la map précédente. */}
      <BackglassStage key={mapId} entries={entries} stats={stats} connected={connected} />
    </MapContentProvider>
  )
}

interface StageProps {
  entries: ReturnType<typeof useBackglassData>['entries']
  stats: ReturnType<typeof useBackglassData>['stats']
  connected: boolean
}

function BackglassStage({ entries, stats, connected }: StageProps) {
  const { JoyceWall, SideArt, backglassTheme, backglassThemeAlternate } = useMapContent()
  // UNE seule connexion Socket.io pour tout le Stage, partagée entre les hooks
  // takeover + reactor (avant : 2 connexions indépendantes par Stage). Créée une
  // fois (initializer useState), déconnectée au démontage. key={mapId} sur le
  // Stage garantit un socket neuf à chaque changement de map.
  const [socket] = useState<PinballSocket>(() => createPinballSocket())
  useEffect(() => {
    return () => {
      socket.disconnect()
    }
  }, [socket])

  const { takeover, alternateWorld, highlightRank, agitation, joyce, holdHallFlip, fever, goldWaveId } =
    useBackglassTakeover(entries, socket)
  const stageRef = useRef<HTMLDivElement>(null)
  const goldWaveRef = useRef<HTMLDivElement>(null)
  const reactor = useIngameReactor(stageRef, socket)

  // Réacteur in-game suspendu pendant un clip cinématique (il ne doit pas
  // poser de heat/hits par-dessus la scène).
  useEffect(() => {
    reactor.setSuspended(takeover?.scene === 'CINEMATIC')
  }, [reactor, takeover?.scene])

  // FEVER : heat verrouillé à 1 (embrasement permanent) pendant l'état.
  useEffect(() => {
    reactor.setHeatLock(fever)
  }, [reactor, fever])

  // Onde dorée (milestones 5k/15k) — rejoue l'animation à chaque incrément.
  useEffect(() => {
    if (goldWaveId === 0) return
    const el = goldWaveRef.current
    if (!el) return
    el.classList.remove('gold-wave-on')
    void el.offsetWidth
    el.classList.add('gold-wave-on')
  }, [goldWaveId])

  // Scale-to-fit : la borne est en 1920×1080 exact (scale 1), mais on
  // s'adapte aux fenêtres dev plus petites sans casser le layout fixe.
  useEffect(() => {
    const fit = () => {
      const s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080)
      if (stageRef.current) stageRef.current.style.transform = `scale(${s})`
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])

  const sideAgitation = alternateWorld ? 1 : Math.max(0.15, agitation)

  // Tokens de thème de la map posés en custom properties (base + surcharges
  // monde alternatif). Le backglass se re-render librement (pas de scène 3D).
  const themeStyle = {
    ...backglassTheme,
    ...(alternateWorld ? backglassThemeAlternate : {}),
  } as React.CSSProperties

  return (
    <div className={`stage-fit ${fever ? 'fever' : ''}`} style={themeStyle}>
      <main className="stage" ref={stageRef}>
        <div className="vignette" style={{ opacity: 1 + agitation * 0.8 }} />
        <div className="vignette-heat" />
        <div ref={goldWaveRef} className="gold-wave" />

        <header className="zone-header">
          <JoyceWall message={joyce.text} messageId={joyce.id} reactor={reactor} />
        </header>

        <section className="zone-side">
          <SideArt
            mood={alternateWorld ? 'alternate' : 'normal'}
            agitation={sideAgitation}
            reactor={reactor}
          />
        </section>

        <section className="zone-hof">
          <HallOfFame
            entries={entries}
            highlightRank={highlightRank}
            inverted={alternateWorld && !holdHallFlip}
            reactor={reactor}
          />
        </section>

        <footer className="zone-banner">
          <StatsBanner stats={stats} entries={entries} reactor={reactor} />
        </footer>

        <ReactorFx reactor={reactor} stageRef={stageRef} />

        {takeover && (
          <div className="takeover-layer">
            {takeover.scene === 'HIGH_SCORE' && takeover.payload && (
              <HighScoreTakeover payload={takeover.payload} />
            )}
            {takeover.scene === 'RECAP' && takeover.payload && (
              <RecapTakeover payload={takeover.payload} />
            )}
            {takeover.scene === 'MAP_EVENT' && takeover.clip && (
              <CinematicTakeover
                clip={takeover.clip}
                payload={takeover.payload}
                entries={entries}
              />
            )}
            {takeover.scene === 'ATTRACT' && (
              <AttractScene entries={entries} />
            )}
            {takeover.scene === 'CINEMATIC' && takeover.clip && (
              <CinematicTakeover
                clip={takeover.clip}
                payload={takeover.payload}
                entries={entries}
              />
            )}
          </div>
        )}

        {!connected && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 50 }}>
            <NoSignal reason="BACKGLASS — PAS DE SIGNAL SERVEUR" />
          </div>
        )}
      </main>
    </div>
  )
}
