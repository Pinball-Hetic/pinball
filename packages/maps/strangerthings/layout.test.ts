import { describe, expect, test } from 'bun:test'
import { layout } from './layout'

// Régression A3-vecna-respawn : au retour du monde normal (Vecna vaincu /
// RETURN_PORTAL_TRANSITION_END), la bille était respawnée au CENTRE du terrain
// (x≈0, z≈-0.12) → injouable. Elle doit revenir dans le couloir plongeur
// (= spawns.ball), catchable et jouable.
describe('spawns.normalReturn (retour monde normal)', () => {
  const { normalReturn, ball } = layout.spawns
  const lane = layout.shooterLane

  test('atterrit dans le couloir plongeur (X dans [xMin, xMax])', () => {
    expect(normalReturn.x).toBeGreaterThanOrEqual(lane.xMin)
    expect(normalReturn.x).toBeLessThanOrEqual(lane.xMax)
  })

  test("n'est PAS au centre du terrain (l'ancien bug)", () => {
    const centerX = (layout.geometry.bounds.leftX + layout.geometry.bounds.rightX) / 2
    expect(Math.abs(normalReturn.x - centerX)).toBeGreaterThan(0.1)
  })

  test('reprend la position du spawn couloir plongeur (spawns.ball)', () => {
    expect(normalReturn.x).toBe(ball.x)
    expect(normalReturn.z).toBe(ball.z)
  })
})
