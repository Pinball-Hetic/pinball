import { useEffect, useRef } from 'react'
import { useBackglassData } from '@/hooks/useBackglassData'
import JoyceWall from '@/components/JoyceWall'
import SideArt from '@/components/SideArt'
import HallOfFame from '@/components/HallOfFame'
import StatsBanner from '@/components/StatsBanner'

export default function BackglassPage() {
  const { entries, stats, connected } = useBackglassData()
  const stageRef = useRef<HTMLDivElement>(null)

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

  return (
    <div className="stage-fit">
      <main className="stage" ref={stageRef}>
        <div className="vignette" />

        <header className="zone-header">
          <JoyceWall message={null} />
        </header>

        <section className="zone-side">
          <SideArt mood="normal" agitation={0.15} />
        </section>

        <section className="zone-hof">
          <HallOfFame entries={entries} />
        </section>

        <footer className="zone-banner">
          <StatsBanner stats={stats} entries={entries} />
        </footer>

        {!connected && <div className="disconnected">Disconnected</div>}
      </main>
    </div>
  )
}
