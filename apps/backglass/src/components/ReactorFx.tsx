import { RefObject, useEffect, useRef } from 'react'
import type { Reactor } from '@/hooks/useIngameReactor'

interface ReactorFxProps {
  reactor: Reactor
  stageRef: RefObject<HTMLElement | null>
}

// Effets plein-écran pilotés par le reactor (DOM direct, pas de re-render).
export default function ReactorFx({ reactor, stageRef }: ReactorFxProps) {
  const portalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const replay = (el: HTMLElement | null, cls: string, ms: number) => {
      if (!el) return
      el.classList.remove(cls)
      void el.offsetWidth // reflow
      el.classList.add(cls)
      window.setTimeout(() => el.classList.remove(cls), ms)
    }

    return reactor.on((r) => {
      if (r.kind === 'event' && r.label === 'PORTAL') {
        replay(portalRef.current, 'portal-wave-on', 1100)
      } else if (r.kind === 'gameStart') {
        // réveil : illumination en séquence des zones
        replay(stageRef.current, 'stage-waking', 1300)
      } else if (r.kind === 'lifeLost') {
        replay(stageRef.current, 'stage-dimmed', 1600)
      }
    })
  }, [reactor, stageRef])

  return <div ref={portalRef} className="portal-wave" />
}
