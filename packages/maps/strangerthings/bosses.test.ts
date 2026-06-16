import { describe, expect, test } from 'bun:test'
import { bossDefinitions, getBossDefinition } from './bosses'

describe('bossDefinitions', () => {
  test('each boss has reveal and camera cinematics', () => {
    for (const boss of bossDefinitions) {
      expect(boss.cameraCinematic.zoomInDuration).toBeGreaterThan(0)
      expect(boss.victoryCameraCinematic.holdDuration).toBeGreaterThan(0)
      expect(getBossDefinition(boss.id)).toBe(boss)
    }
  })
})
