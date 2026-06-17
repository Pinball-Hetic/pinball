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

  test('ganondorf is in the normal world and unlocks the portal', () => {
    const ganondorf = getBossDefinition('ganondorf')
    expect(ganondorf.reveal.requiresAlternateWorld).toBe(false)
    expect(ganondorf.unlocksPortal).toBe(true)
    expect(ganondorf.unlocksReturnPortal).toBe(false)
    expect(ganondorf.revealSoundUrl).toContain('spawnGanondorf.mp3')
  })

  test('darklink is in the sacred realm and unlocks the return portal', () => {
    const darklink = getBossDefinition('darklink')
    expect(darklink.reveal.requiresAlternateWorld).toBe(true)
    expect(darklink.unlocksPortal).toBe(false)
    expect(darklink.unlocksReturnPortal).toBe(true)
  })
})
