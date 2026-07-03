import { describe, expect, test } from 'bun:test'
import { layout } from './layout'

// Régression retour monde normal (Vecna vaincu / RETURN_PORTAL_TRANSITION_END).
// Historique des deux bugs successifs :
//  - v1 : respawn au CENTRE du terrain, sans vitesse → bille injouable.
//  - v2 (fix A3) : respawn dans le couloir plongeur → EMPRISONNÉE : en
//    `playing` le plunger ne se charge pas (idle only) et la porte du couloir
//    est fermée après le lancement initial.
// Contrat actuel : la bille SORT DU PORTAIL (= sensors.portal) avec une
// poussée vers les flippers (+z).
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
