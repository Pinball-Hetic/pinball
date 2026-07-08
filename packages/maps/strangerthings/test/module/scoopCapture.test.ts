import { test, expect, describe } from 'bun:test'
import { createScoopCapture, DEFAULT_SCOOP_CONFIG, type ScoopBallState } from '../../module/scoopCapture'

const CFG = { ...DEFAULT_SCOOP_CONFIG, armDwellMs: 300, holdMs: 1000 }
const posed: ScoopBallState = { inZone: true, slow: true }
const passing: ScoopBallState = { inZone: true, slow: false }
const gone: ScoopBallState = { inZone: false, slow: false }

describe('createScoopCapture — dwell (anti-flythrough)', () => {
  test('sans arm → idle', () => {
    const s = createScoopCapture(CFG)
    expect(s.tick(16, posed)).toBe('idle')
  })

  test('bille qui TRAVERSE la zone → désarmé sans capture (aucun effet)', () => {
    const s = createScoopCapture(CFG)
    s.arm()
    expect(s.tick(100, passing)).toBe('armed') // in zone but fast
    expect(s.tick(100, gone)).toBe('idle') // repartie → flythrough
    expect(s.tick(1000, posed)).toBe('idle') // no longer armed: nothing triggers
  })

  test('bille rapide dans la zone : le dwell ne compte pas', () => {
    const s = createScoopCapture(CFG)
    s.arm()
    expect(s.tick(1000, passing)).toBe('armed') // 1s fast → still not captured
    expect(s.tick(300, posed)).toBe('capture') // se pose → dwell 300ms → capture
  })

  test('bille posée → capture après armDwellMs, une seule frame « capture »', () => {
    const s = createScoopCapture(CFG)
    s.arm()
    expect(s.tick(150, posed)).toBe('armed')
    expect(s.tick(150, posed)).toBe('capture')
    expect(s.tick(16, posed)).toBe('hold') // next frame = hold, no re-capture
    expect(s.isHolding()).toBe(true)
  })
})

describe('createScoopCapture — hold → eject', () => {
  const captured = () => {
    const s = createScoopCapture(CFG)
    s.arm()
    s.tick(300, posed) // capture
    return s
  }

  test('hold pendant holdMs puis eject UNE fois puis idle', () => {
    const s = captured()
    expect(s.tick(600, posed)).toBe('hold')
    expect(s.tick(600, posed)).toBe('eject') // 1200 > 1000
    expect(s.isHolding()).toBe(false)
    expect(s.tick(16, posed)).toBe('idle') // no second kick
  })

  test('arm ignoré pendant hold (pas de re-capture en boucle)', () => {
    const s = captured()
    s.arm() // contact re-triggered during hold → no-op
    expect(s.tick(500, posed)).toBe('hold')
    expect(s.tick(600, posed)).toBe('eject')
  })

  test('reset annule tout (armed comme hold)', () => {
    const s = captured()
    s.reset()
    expect(s.isHolding()).toBe(false)
    expect(s.tick(16, posed)).toBe('idle')
  })
})
