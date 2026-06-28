import { test, expect, describe } from 'bun:test'
import {
  GANONDORF_CAMERA_CINEMATIC,
  GANONDORF_VICTORY_CAMERA_CINEMATIC,
  DARK_LINK_CAMERA_CINEMATIC,
  DARK_LINK_VICTORY_CAMERA_CINEMATIC,
} from './cameraCinematics'

// Toutes les durées d'une cinématique caméra doivent être strictement positives.
function expectPositiveDurations(c: {
  zoomInDuration: number
  holdDuration: number
  zoomOutDuration: number
}) {
  expect(c.zoomInDuration).toBeGreaterThan(0)
  expect(c.holdDuration).toBeGreaterThan(0)
  expect(c.zoomOutDuration).toBeGreaterThan(0)
}

describe('cameraCinematics', () => {
  const reveals = [
    ['ganondorf', GANONDORF_CAMERA_CINEMATIC],
    ['darklink', DARK_LINK_CAMERA_CINEMATIC],
  ] as const

  const victories = [
    ['ganondorf', GANONDORF_VICTORY_CAMERA_CINEMATIC],
    ['darklink', DARK_LINK_VICTORY_CAMERA_CINEMATIC],
  ] as const

  test.each([...reveals, ...victories])(
    'durées positives pour %s',
    (_id, cinematic) => {
      expectPositiveDurations(cinematic)
    },
  )

  test.each([...reveals, ...victories])(
    'distanceScale dans (0,1] pour %s',
    (_id, cinematic) => {
      expect(cinematic.distanceScale).toBeGreaterThan(0)
      expect(cinematic.distanceScale).toBeLessThanOrEqual(1)
    },
  )

  test('les cinématiques de reveal partagent la même direction de face', () => {
    expect(GANONDORF_CAMERA_CINEMATIC.faceDirToCamera).toEqual(
      DARK_LINK_CAMERA_CINEMATIC.faceDirToCamera!,
    )
  })

  test('la direction de face est un vecteur 3D défini', () => {
    const dir = GANONDORF_CAMERA_CINEMATIC.faceDirToCamera!
    expect(dir).toMatchObject({ x: -0.52, y: 0.2, z: 0.83 })
  })

  test('les cinématiques de victoire ne précisent pas de direction de face', () => {
    expect(GANONDORF_VICTORY_CAMERA_CINEMATIC.faceDirToCamera).toBeUndefined()
    expect(DARK_LINK_VICTORY_CAMERA_CINEMATIC.faceDirToCamera).toBeUndefined()
  })

  test('les victoires sont plus rapides et plus reculées que les reveals', () => {
    // zoom-in court + plus de recul (distanceScale plus grand) = plan large rapide.
    expect(GANONDORF_VICTORY_CAMERA_CINEMATIC.zoomInDuration).toBeLessThan(
      GANONDORF_CAMERA_CINEMATIC.zoomInDuration,
    )
    expect(GANONDORF_VICTORY_CAMERA_CINEMATIC.distanceScale).toBeGreaterThan(
      GANONDORF_CAMERA_CINEMATIC.distanceScale,
    )
    expect(DARK_LINK_VICTORY_CAMERA_CINEMATIC.zoomInDuration).toBeLessThan(
      DARK_LINK_CAMERA_CINEMATIC.zoomInDuration,
    )
    expect(DARK_LINK_VICTORY_CAMERA_CINEMATIC.distanceScale).toBeGreaterThan(
      DARK_LINK_CAMERA_CINEMATIC.distanceScale,
    )
  })

  test('lookAtLift positif sur reveals, faible sur victoires', () => {
    expect(GANONDORF_CAMERA_CINEMATIC.lookAtLift).toBeGreaterThan(0)
    expect(DARK_LINK_CAMERA_CINEMATIC.lookAtLift).toBeGreaterThan(0)
    expect(GANONDORF_VICTORY_CAMERA_CINEMATIC.lookAtLift).toBe(0.03)
    expect(DARK_LINK_VICTORY_CAMERA_CINEMATIC.lookAtLift).toBe(0.03)
  })
})
