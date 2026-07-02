import { test, expect, describe } from 'bun:test'
import { createScoopCapture, DEFAULT_SCOOP_CONFIG } from './scoopCapture'

describe('createScoopCapture', () => {
  test('inactif au repos → tick = idle', () => {
    const s = createScoopCapture()
    expect(s.isActive()).toBe(false)
    expect(s.tick(16)).toBe('idle')
  })

  test('start → actif, tick = hold tant que holdMs pas écoulé', () => {
    const s = createScoopCapture({ ...DEFAULT_SCOOP_CONFIG, holdMs: 1000 })
    s.start()
    expect(s.isActive()).toBe(true)
    expect(s.tick(400)).toBe('hold')
    expect(s.tick(400)).toBe('hold')
    expect(s.isActive()).toBe(true)
  })

  test('éjection une seule fois à l’expiration puis redevient idle', () => {
    const s = createScoopCapture({ ...DEFAULT_SCOOP_CONFIG, holdMs: 1000 })
    s.start()
    s.tick(600)
    expect(s.tick(600)).toBe('eject') // total 1200 > 1000
    expect(s.isActive()).toBe(false)
    expect(s.tick(16)).toBe('idle') // plus de kick ensuite
  })

  test('start idempotent : 2e appel pendant la capture ne relance pas le timer', () => {
    const s = createScoopCapture({ ...DEFAULT_SCOOP_CONFIG, holdMs: 1000 })
    s.start()
    s.tick(800)
    s.start() // ignoré
    expect(s.tick(300)).toBe('eject') // 1100 > 1000 → l’état a bien avancé
  })

  test('reset annule la capture en cours', () => {
    const s = createScoopCapture()
    s.start()
    s.reset()
    expect(s.isActive()).toBe(false)
    expect(s.tick(16)).toBe('idle')
  })
})
