import { test, expect, describe, afterEach } from 'bun:test'
import { render, cleanup, act } from '@testing-library/react'
import { createRef } from 'react'
import type { Reaction, Reactor } from '@/hooks/useIngameReactor'
import ReactorFx from './ReactorFx'

afterEach(() => cleanup())

function fakeReactor(): { reactor: Reactor; emit: (r: Reaction) => void } {
  const listeners = new Set<(r: Reaction) => void>()
  return {
    reactor: {
      on: (cb) => {
        listeners.add(cb)
        return () => listeners.delete(cb)
      },
      getHeat: () => 0,
      setSuspended: () => {},
      setHeatLock: () => {},
    },
    emit: (r) => listeners.forEach((cb) => cb(r)),
  }
}

describe('ReactorFx', () => {
  test('rend la couche portal-wave', () => {
    const { reactor } = fakeReactor()
    const stageRef = createRef<HTMLElement>()
    const { container } = render(<ReactorFx reactor={reactor} stageRef={stageRef} />)
    expect(container.querySelector('.portal-wave')).not.toBeNull()
  })

  test("réaction event PORTAL ajoute la classe portal-wave-on à la couche", () => {
    const { reactor, emit } = fakeReactor()
    const stageRef = createRef<HTMLElement>()
    const { container } = render(<ReactorFx reactor={reactor} stageRef={stageRef} />)
    const portal = container.querySelector('.portal-wave')!
    expect(portal.className).not.toContain('portal-wave-on')
    act(() => emit({ kind: 'event', label: 'PORTAL' }))
    expect(portal.className).toContain('portal-wave-on')
  })

  test('event non-PORTAL ne déclenche pas la vague portal', () => {
    const { reactor, emit } = fakeReactor()
    const stageRef = createRef<HTMLElement>()
    const { container } = render(<ReactorFx reactor={reactor} stageRef={stageRef} />)
    act(() => emit({ kind: 'event', label: 'JUMP' }))
    expect(container.querySelector('.portal-wave')!.className).not.toContain(
      'portal-wave-on',
    )
  })

  test('gameStart illumine le stage (stage-waking)', () => {
    const { reactor, emit } = fakeReactor()
    const stage = document.createElement('div')
    const stageRef = { current: stage }
    render(<ReactorFx reactor={reactor} stageRef={stageRef} />)
    act(() => emit({ kind: 'gameStart', player: 'NEO' }))
    expect(stage.className).toContain('stage-waking')
  })

  test('lifeLost assombrit le stage (stage-dimmed)', () => {
    const { reactor, emit } = fakeReactor()
    const stage = document.createElement('div')
    const stageRef = { current: stage }
    render(<ReactorFx reactor={reactor} stageRef={stageRef} />)
    act(() => emit({ kind: 'lifeLost', livesRemaining: 2 }))
    expect(stage.className).toContain('stage-dimmed')
  })

  test('stageRef null ne crash pas (gameStart sans cible)', () => {
    const { reactor, emit } = fakeReactor()
    const stageRef = createRef<HTMLElement>()
    render(<ReactorFx reactor={reactor} stageRef={stageRef} />)
    expect(() => act(() => emit({ kind: 'gameStart', player: 'X' }))).not.toThrow()
  })

  test('se désabonne au démontage (off appelé)', () => {
    const { reactor, emit } = fakeReactor()
    const stage = document.createElement('div')
    const stageRef = { current: stage }
    const { unmount } = render(<ReactorFx reactor={reactor} stageRef={stageRef} />)
    unmount()
    // après démontage, plus aucun listener actif → aucun effet sur le stage.
    act(() => emit({ kind: 'gameStart', player: 'X' }))
    expect(stage.className).not.toContain('stage-waking')
  })
})
