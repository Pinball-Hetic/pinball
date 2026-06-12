import { useEffect, useRef } from 'react'
import { useBackglassData } from '@/hooks/useBackglassData'
import { useBackglassTakeover } from '@/hooks/useBackglassTakeover'
import { useIngameReactor } from '@/hooks/useIngameReactor'
import { JoyceWall, SideArt, DemogorgonTakeover } from '@pinball/map-strangerthings/backglass'
import HallOfFame from '@/components/HallOfFame'
import StatsBanner from '@/components/StatsBanner'
import ReactorFx from '@/components/ReactorFx'
import HighScoreTakeover from '@/components/takeovers/HighScoreTakeover'
import RecapTakeover from '@/components/takeovers/RecapTakeover'
import AttractScene from '@/components/takeovers/AttractScene'
import CinematicTakeover from '@/components/takeovers/CinematicTakeover'

export default function BackglassPage() {
  const { entries, stats, connected } = useBackglassData()
  const { takeover, upsideDown, highlightRank, agitation, joyce, holdHallFlip, fever, goldWaveId } =
    useBackglassTakeover(entries)
  const stageRef = useRef<HTMLDivElement>(null)
  const goldWaveRef = useRef<HTMLDivElement>(null)
  const reactor = useIngameReactor(stageRef)

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

  const sideAgitation = upsideDown ? 1 : Math.max(0.15, agitation)

  return (
    <div className={`stage-fit ${upsideDown ? 'upside-down' : ''} ${fever ? 'fever' : ''}`}>
      <main className="stage" ref={stageRef}>
        <div className="vignette" style={{ opacity: 1 + agitation * 0.8 }} />
        <div className="vignette-heat" />
        <div ref={goldWaveRef} className="gold-wave" />

        <header className="zone-header">
          <JoyceWall message={joyce.text} messageId={joyce.id} reactor={reactor} />
        </header>

        <section className="zone-side">
          <SideArt
            mood={upsideDown ? 'upsideDown' : 'normal'}
            agitation={sideAgitation}
            reactor={reactor}
          />
        </section>

        <section className="zone-hof">
          <HallOfFame
            entries={entries}
            highlightRank={highlightRank}
            inverted={upsideDown && !holdHallFlip}
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
            {takeover.scene === 'DEMOGORGON' && <DemogorgonTakeover />}
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

        {!connected && <div className="disconnected">Disconnected</div>}
      </main>
    </div>
  )
}
