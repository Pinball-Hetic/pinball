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

  test('demogorgon bridges spawnDG music until vecna reveal', () => {
    const dg = getBossDefinition('demogorgon')
    expect(dg.revealSoundUrl).toContain('spawnDG.mp3')
    expect(dg.keepMusicUntilBossReveal).toBe('vecna')
  })

  test('vecna has late-phase win music at 7 hits', () => {
    const vecna = getBossDefinition('vecna')
    expect(vecna.revealSoundUrl).toContain('vecnaTheme.mp3')
    expect(vecna.latePhaseSoundUrl).toContain('win-music.mp3')
    expect(vecna.latePhaseHitThreshold).toBe(7)
    expect(vecna.targetHits).toBe(10)
  })

  test('vecna keeps its music until the return portal cinematic ends', () => {
    expect(getBossDefinition('vecna').keepMusicUntilReturnPortal).toBe(true)
    expect(getBossDefinition('demogorgon').keepMusicUntilReturnPortal).toBeUndefined()
  })
})

describe('return portal textures', () => {
  test('return portal uses fin_combat_vecna image', async () => {
    const { RETURN_PORTAL_TEXTURE_URL, PORTAL_ENTER_TEXTURE_URL } = await import(
      './systems/UpsideDownConstants'
    )
    expect(RETURN_PORTAL_TEXTURE_URL).toContain('fin_combat_vecna.png')
    expect(PORTAL_ENTER_TEXTURE_URL).toContain('upsidedown.jpg')
    expect(RETURN_PORTAL_TEXTURE_URL).not.toBe(PORTAL_ENTER_TEXTURE_URL)
  })
})
