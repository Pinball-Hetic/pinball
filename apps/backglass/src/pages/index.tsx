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

// BackglassPage: called at the root, owns the mapId lifecycle.
// The map selection arrives via the socket (useBackglassData) and triggers a
// clean Stage remount (key={mapId}) with the right map content.
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
      {/* key={mapId}: remounts the whole Stage (hooks, takeover socket, art)
          on every map change → no residual state from the previous map. */}
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
  // ONE Socket.io connection for the whole Stage, shared between the takeover
  // and reactor hooks. Created once (useState initializer), disconnected on
  // unmount. key={mapId} on the Stage guarantees a fresh socket on every map
  // change.
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

  // In-game reactor suspended during a cinematic clip (it must not paint
  // heat/hits over the scene).
  useEffect(() => {
    reactor.setSuspended(takeover?.scene === 'CINEMATIC')
  }, [reactor, takeover?.scene])

  // FEVER: heat locked at 1 (permanent blaze) while the state lasts.
  useEffect(() => {
    reactor.setHeatLock(fever)
  }, [reactor, fever])

  // Gold wave (5k/15k milestones) — replays the animation on each increment.
  useEffect(() => {
    if (goldWaveId === 0) return
    const el = goldWaveRef.current
    if (!el) return
    el.classList.remove('gold-wave-on')
    void el.offsetWidth
    el.classList.add('gold-wave-on')
  }, [goldWaveId])

  // Scale-to-fit: the cabinet is exactly 1920×1080 (scale 1), but adapt to
  // smaller dev windows without breaking the fixed layout.
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

  // Map theme tokens set as custom properties (base + alternate world
  // overrides). The backglass re-renders freely (no 3D scene).
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
