import { RefObject, useEffect, useRef } from 'react'
import type { Reactor } from '@/hooks/useIngameReactor'

interface ReactorFxProps {
  reactor: Reactor
  stageRef: RefObject<HTMLElement | null>
}

// Full-screen effects driven by the reactor (direct DOM, no re-render).
export default function ReactorFx({ reactor, stageRef }: ReactorFxProps) {
  const portalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handles = new Set<number>()
    const replay = (el: HTMLElement | null, cls: string, ms: number) => {
      if (!el) return
      el.classList.remove(cls)
      void el.offsetWidth // force reflow so the animation restarts
      el.classList.add(cls)
      const id = window.setTimeout(() => {
        handles.delete(id)
        el.classList.remove(cls)
      }, ms)
      handles.add(id)
    }

    const off = reactor.on((r) => {
      if (r.kind === 'event' && r.label === 'PORTAL') {
        replay(portalRef.current, 'portal-wave-on', 1100)
      } else if (r.kind === 'gameStart') {
        // wake-up: zones light up in sequence
        replay(stageRef.current, 'stage-waking', 1300)
      } else if (r.kind === 'lifeLost') {
        replay(stageRef.current, 'stage-dimmed', 1600)
      }
    })
    return () => {
      off()
      handles.forEach(window.clearTimeout)
    }
  }, [reactor, stageRef])

  return <div ref={portalRef} className="portal-wave" />
}
