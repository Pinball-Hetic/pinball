import { describe, expect, test } from 'bun:test'
import {
  bossDefinitions,
  getBossDefinition,
  BOSS_IDS,
  DEMOGORGON_TARGET,
  DEMOGORGON_TARGET_HITS,
  VECNA_TARGET,
  VECNA_TARGET_HITS,
} from '../bosses'

describe('BOSS_IDS registry', () => {
  test('contient exactement demogorgon puis vecna (ordre du tableau)', () => {
    expect(BOSS_IDS).toEqual(['demogorgon', 'vecna'])
  })

  test('les ids sont uniques', () => {
    expect(new Set(BOSS_IDS).size).toBe(BOSS_IDS.length)
  })

  test('getBossDefinition retourne la définition pour chaque id du registre', () => {
    for (const id of BOSS_IDS) {
      expect(getBossDefinition(id).id).toBe(id)
    }
  })

  test('getBossDefinition retourne la même référence à chaque appel', () => {
    expect(getBossDefinition('vecna')).toBe(getBossDefinition('vecna'))
  })
})

describe('raccourcis cible exportés', () => {
  test('DEMOGORGON_TARGET / HITS alias la définition demogorgon', () => {
    const dg = getBossDefinition('demogorgon')
    expect(DEMOGORGON_TARGET).toBe(dg.target)
    expect(DEMOGORGON_TARGET).toEqual({ x: 0, y: 1.012, z: -0.02 })
    expect(DEMOGORGON_TARGET_HITS).toBe(dg.targetHits)
    expect(DEMOGORGON_TARGET_HITS).toBe(5)
  })

  test('VECNA_TARGET / HITS alias la définition vecna', () => {
    const vecna = getBossDefinition('vecna')
    expect(VECNA_TARGET).toBe(vecna.target)
    expect(VECNA_TARGET).toEqual({ x: 0, y: 1.012, z: -0.067 })
    expect(VECNA_TARGET_HITS).toBe(vecna.targetHits)
    expect(VECNA_TARGET_HITS).toBe(10)
  })
})

describe('table de boss — progression & règles monde inversé', () => {
  test('demogorgon est accessible sans monde alternatif, vecna le requiert', () => {
    const dg = getBossDefinition('demogorgon')
    const vecna = getBossDefinition('vecna')
    expect(dg.reveal.requiresAlternateWorld).toBe(false)
    expect(dg.hud.requiresAlternateWorld).toBe(false)
    expect(vecna.reveal.requiresAlternateWorld).toBe(true)
    expect(vecna.hud.requiresAlternateWorld).toBe(true)
  })

  test('demogorgon ouvre le portail, vecna ouvre le portail retour', () => {
    const dg = getBossDefinition('demogorgon')
    const vecna = getBossDefinition('vecna')
    expect(dg.unlocksPortal).toBe(true)
    expect(dg.unlocksReturnPortal).toBe(false)
    expect(vecna.unlocksPortal).toBe(false)
    expect(vecna.unlocksReturnPortal).toBe(true)
  })

  test('vecna est plus dur que demogorgon (plus de hits, plus de points)', () => {
    const dg = getBossDefinition('demogorgon')
    const vecna = getBossDefinition('vecna')
    expect(vecna.targetHits).toBeGreaterThan(dg.targetHits)
    expect(vecna.scoreTargetHit).toBeGreaterThan(dg.scoreTargetHit)
  })

  test('latePhaseHitThreshold est inférieur au total de hits vecna', () => {
    const vecna = getBossDefinition('vecna')
    expect(vecna.latePhaseHitThreshold!).toBeLessThan(vecna.targetHits)
  })

  test('seul demogorgon a un assist (Eleven)', () => {
    expect(getBossDefinition('demogorgon').assist).toEqual({ id: 'eleven' })
    expect(getBossDefinition('vecna').assist).toBeUndefined()
  })
})

describe('cohérence colliderRole / hud par boss', () => {
  test('chaque boss référence un rôle de collider distinct', () => {
    const roles = bossDefinitions.map((b) => b.colliderRole)
    expect(roles).toEqual(['demogorgon_target', 'vecna_target'])
    expect(new Set(roles).size).toBe(roles.length)
  })

  test('chaque hud expose un dmdLabel non vide', () => {
    for (const b of bossDefinitions) {
      expect(b.hud.dmdLabel.length).toBeGreaterThan(0)
    }
  })

  test('les barres de vie sont activées sur les deux boss', () => {
    for (const b of bossDefinitions) {
      expect(b.hud.healthBar).toBe(true)
    }
  })
})

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
      '../systems/UpsideDownConstants'
    )
    expect(RETURN_PORTAL_TEXTURE_URL).toContain('fin_combat_vecna.png')
    expect(PORTAL_ENTER_TEXTURE_URL).toContain('upsidedown.jpg')
    expect(RETURN_PORTAL_TEXTURE_URL).not.toBe(PORTAL_ENTER_TEXTURE_URL)
  })
})
