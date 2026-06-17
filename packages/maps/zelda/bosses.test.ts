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
    // Ganondorf joue sa fanfare en one-shot via manifest.sounds (pas de revealSoundUrl).
    expect(ganondorf.revealSoundUrl).toBeUndefined()
  })

  test('darklink has full audio fight sequence', () => {
    const darklink = getBossDefinition('darklink')
    expect(darklink.revealSoundUrl).toContain('second-boss.mp3')
    expect(darklink.latePhaseSoundUrl).toContain('last-pv-second-boss.mp3')
    expect(darklink.latePhaseHitThreshold).toBe(7)
    expect(darklink.victoryMusicUrl).toContain('win.mp3')
    expect(darklink.keepMusicUntilReturnPortal).toBe(true)
  })

  test('darklink is in the sacred realm and unlocks the return portal', () => {
    const darklink = getBossDefinition('darklink')
    expect(darklink.reveal.requiresAlternateWorld).toBe(true)
    expect(darklink.unlocksPortal).toBe(false)
    expect(darklink.unlocksReturnPortal).toBe(true)
  })
})
