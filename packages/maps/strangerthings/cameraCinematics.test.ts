import { describe, expect, test } from 'bun:test'
import {
  DEMOGORGON_CAMERA_CINEMATIC,
  DEMOGORGON_VICTORY_CAMERA_CINEMATIC,
  VECNA_CAMERA_CINEMATIC,
  VECNA_VICTORY_CAMERA_CINEMATIC,
} from './cameraCinematics'
import {
  VECNA_SPAWN,
  VECNA_WALK_DURATION,
  VECNA_WALK_SETTLE_FACING,
} from './systems/VecnaConstants'
import type { BossCameraCinematicConfig } from '@pinball/game-engine'

const ALL = {
  DEMOGORGON_CAMERA_CINEMATIC,
  DEMOGORGON_VICTORY_CAMERA_CINEMATIC,
  VECNA_CAMERA_CINEMATIC,
  VECNA_VICTORY_CAMERA_CINEMATIC,
}

describe('camera cinematics — invariants communs', () => {
  // All durations must be strictly positive (otherwise division/anim breaks).
  test.each(Object.entries(ALL))('%s a des durées positives', (_name, c) => {
    const cfg = c as BossCameraCinematicConfig
    expect(cfg.zoomInDuration).toBeGreaterThan(0)
    expect(cfg.holdDuration).toBeGreaterThan(0)
    expect(cfg.zoomOutDuration).toBeGreaterThan(0)
  })

  test.each(Object.entries(ALL))('%s a un distanceScale dans ]0,1]', (_name, c) => {
    const cfg = c as BossCameraCinematicConfig
    expect(cfg.distanceScale).toBeGreaterThan(0)
    expect(cfg.distanceScale).toBeLessThanOrEqual(1)
  })

  test.each(Object.entries(ALL))('%s a un lookAtLift positif', (_name, c) => {
    const cfg = c as BossCameraCinematicConfig
    expect(cfg.lookAtLift).toBeGreaterThan(0)
  })
})

describe('DEMOGORGON_CAMERA_CINEMATIC', () => {
  test('oriente la caméra via faceDirToCamera (le boss regarde la caméra)', () => {
    expect(DEMOGORGON_CAMERA_CINEMATIC.faceDirToCamera).toEqual({
      x: -0.52,
      y: 0.2,
      z: 0.83,
    })
  })

  test("n'a pas de panFrom (pas d'entrée par marche)", () => {
    expect(DEMOGORGON_CAMERA_CINEMATIC.panFrom).toBeUndefined()
    expect(DEMOGORGON_CAMERA_CINEMATIC.panEasing).toBeUndefined()
  })

  test('valeurs de réveil exactes', () => {
    expect(DEMOGORGON_CAMERA_CINEMATIC.zoomInDuration).toBe(1.55)
    expect(DEMOGORGON_CAMERA_CINEMATIC.holdDuration).toBe(1.25)
    expect(DEMOGORGON_CAMERA_CINEMATIC.zoomOutDuration).toBe(1.1)
    expect(DEMOGORGON_CAMERA_CINEMATIC.distanceScale).toBe(0.54)
  })
})

describe('DEMOGORGON_VICTORY_CAMERA_CINEMATIC', () => {
  test('victoire = plus rapide et plus reculée que le réveil', () => {
    expect(DEMOGORGON_VICTORY_CAMERA_CINEMATIC.zoomInDuration).toBeLessThan(
      DEMOGORGON_CAMERA_CINEMATIC.zoomInDuration,
    )
    expect(DEMOGORGON_VICTORY_CAMERA_CINEMATIC.distanceScale).toBeGreaterThan(
      DEMOGORGON_CAMERA_CINEMATIC.distanceScale,
    )
  })

  test('cinématique victoire sobre, sans pan ni orientation', () => {
    expect(DEMOGORGON_VICTORY_CAMERA_CINEMATIC.faceDirToCamera).toBeUndefined()
    expect(DEMOGORGON_VICTORY_CAMERA_CINEMATIC.panFrom).toBeUndefined()
  })
})

describe('VECNA_CAMERA_CINEMATIC', () => {
  test('pan part du spawn Vecna à la hauteur cible', () => {
    expect(VECNA_CAMERA_CINEMATIC.panFrom).toEqual({
      x: VECNA_SPAWN.x,
      y: 1.012,
      z: VECNA_SPAWN.z,
    })
  })

  test('le zoom dure exactement la marche de Vecna', () => {
    expect(VECNA_CAMERA_CINEMATIC.zoomInDuration).toBe(VECNA_WALK_DURATION)
  })

  test('le hold attend que Vecna se soit orienté (+0.5s)', () => {
    expect(VECNA_CAMERA_CINEMATIC.holdDuration).toBe(VECNA_WALK_SETTLE_FACING + 0.5)
  })

  test('pan linéaire (marche à vitesse constante)', () => {
    expect(VECNA_CAMERA_CINEMATIC.panEasing).toBe('linear')
  })

  test('réutilise la même direction de face que le Demogorgon', () => {
    expect(VECNA_CAMERA_CINEMATIC.faceDirToCamera).toEqual(
      DEMOGORGON_CAMERA_CINEMATIC.faceDirToCamera,
    )
  })
})

describe('VECNA_VICTORY_CAMERA_CINEMATIC', () => {
  test('victoire courte et reculée', () => {
    expect(VECNA_VICTORY_CAMERA_CINEMATIC.zoomInDuration).toBeLessThan(
      VECNA_CAMERA_CINEMATIC.zoomInDuration,
    )
    expect(VECNA_VICTORY_CAMERA_CINEMATIC.distanceScale).toBeGreaterThan(
      VECNA_CAMERA_CINEMATIC.distanceScale,
    )
  })

  test('pas de pan ni orientation', () => {
    expect(VECNA_VICTORY_CAMERA_CINEMATIC.panFrom).toBeUndefined()
    expect(VECNA_VICTORY_CAMERA_CINEMATIC.faceDirToCamera).toBeUndefined()
  })
})
