import { describe, expect, test } from 'bun:test'
import { layout } from '../layout'

// Normal-world return regression (Vecna defeated / RETURN_PORTAL_TRANSITION_END).
// History of the two successive bugs:
//  - v1: respawn at the CENTER of the field, no velocity → unplayable ball.
//  - v2: respawn in the shooter lane → TRAPPED: while `playing` the plunger
//    does not charge (idle only) and the lane gate is closed after the
//    initial launch.
// Current contract: the ball EXITS THE PORTAL (= sensors.portal) with a
// push toward the flippers (+z).
describe('spawns.normalReturn (retour monde normal)', () => {
  const { normalReturn, normalReturnImpulse } = layout.spawns
  const lane = layout.shooterLane
  const portal = layout.sensors.portal

  test('sort du portail (= sensors.portal)', () => {
    expect(normalReturn.x).toBe(portal.x)
    expect(normalReturn.z).toBe(portal.z)
  })

  test("n'atterrit PAS dans le couloir plongeur (bille emprisonnée : porte fermée + plunger idle-only)", () => {
    expect(normalReturn.x).toBeLessThan(lane.xMin)
  })

  test('poussée de sortie non nulle vers les flippers (+z), pas de bille morte sur le capteur', () => {
    expect(normalReturnImpulse.z).toBeGreaterThan(0)
  })
})
