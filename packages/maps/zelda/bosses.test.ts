import { test, expect, describe } from 'bun:test'
import {
  bossDefinitions,
  getBossDefinition,
  BOSS_IDS,
  GANONDORF_TARGET,
  GANONDORF_TARGET_HITS,
  DARK_LINK_TARGET,
  DARK_LINK_TARGET_HITS,
} from './bosses'

describe('bosses — table de définitions', () => {
  test('contient exactement ganondorf puis darklink', () => {
    expect(bossDefinitions.map((b) => b.id)).toEqual(['ganondorf', 'darklink'])
  })

  test('BOSS_IDS reflète l ordre des définitions', () => {
    expect(BOSS_IDS).toEqual(['ganondorf', 'darklink'])
  })

  test('chaque boss a un colliderRole unique', () => {
    const roles = bossDefinitions.map((b) => b.colliderRole)
    expect(new Set(roles).size).toBe(roles.length)
  })

  test('chaque boss a un dmdLabel unique', () => {
    const labels = bossDefinitions.map((b) => b.hud.dmdLabel)
    expect(new Set(labels).size).toBe(labels.length)
  })
})

describe('getBossDefinition', () => {
  test('résout ganondorf', () => {
    const b = getBossDefinition('ganondorf')
    expect(b.id).toBe('ganondorf')
    expect(b.targetHits).toBe(5)
    expect(b.scoreTargetHit).toBe(250)
  })

  test('résout darklink', () => {
    const b = getBossDefinition('darklink')
    expect(b.id).toBe('darklink')
    expect(b.targetHits).toBe(10)
    expect(b.scoreTargetHit).toBe(300)
  })

  test('renvoie la même référence que dans la table', () => {
    expect(getBossDefinition('ganondorf')).toBe(bossDefinitions[0])
    expect(getBossDefinition('darklink')).toBe(bossDefinitions[1])
  })

  test('renvoie undefined pour un id inconnu', () => {
    // byId est un Record sans entrée → undefined (pas de fallback).
    expect(getBossDefinition('unknown' as never)).toBeUndefined()
  })
})

describe('bosses — raccourcis de cible exportés', () => {
  test('GANONDORF_TARGET pointe sur la cible de ganondorf', () => {
    expect(GANONDORF_TARGET).toBe(getBossDefinition('ganondorf').target)
    expect(GANONDORF_TARGET).toEqual({ x: -0.0249, y: 1.01222, z: -0.074 })
  })

  test('DARK_LINK_TARGET pointe sur la cible de darklink', () => {
    expect(DARK_LINK_TARGET).toBe(getBossDefinition('darklink').target)
  })

  test('les deux boss partagent la même position de cible', () => {
    expect(GANONDORF_TARGET).toEqual(DARK_LINK_TARGET)
  })

  test('GANONDORF_TARGET_HITS et DARK_LINK_TARGET_HITS', () => {
    expect(GANONDORF_TARGET_HITS).toBe(5)
    expect(DARK_LINK_TARGET_HITS).toBe(10)
  })
})

describe('bosses — sémantique de reveal et de monde alternatif', () => {
  test('ganondorf : monde normal, déverrouille le portail', () => {
    const b = getBossDefinition('ganondorf')
    expect(b.reveal.requiresAlternateWorld).toBe(false)
    expect(b.hud.requiresAlternateWorld).toBe(false)
    expect(b.unlocksPortal).toBe(true)
    expect(b.unlocksReturnPortal).toBe(false)
    // Ganondorf joue sa fanfare en one-shot via manifest.sounds (pas de revealSoundUrl).
    expect(b.revealSoundUrl).toBeUndefined()
  })

  test('darklink : monde alternatif (Sacred Realm), déverrouille le portail retour', () => {
    const b = getBossDefinition('darklink')
    expect(b.reveal.requiresAlternateWorld).toBe(true)
    expect(b.hud.requiresAlternateWorld).toBe(true)
    expect(b.unlocksPortal).toBe(false)
    expect(b.unlocksReturnPortal).toBe(true)
  })

  test('hud.requiresAlternateWorld est cohérent avec reveal.requiresAlternateWorld', () => {
    for (const b of bossDefinitions) {
      expect(b.hud.requiresAlternateWorld).toBe(b.reveal.requiresAlternateWorld)
    }
  })

  test('les seuils de reveal et incréments sont positifs', () => {
    for (const b of bossDefinitions) {
      expect(b.reveal.scoreThreshold).toBeGreaterThan(0)
      expect(b.reveal.scoreIncrement).toBeGreaterThan(0)
    }
  })
})

describe('bosses — audio', () => {
  test('ganondorf ne définit pas de musique de reveal (one-shot via manifest)', () => {
    expect(getBossDefinition('ganondorf').revealSoundUrl).toBeUndefined()
  })

  test('darklink définit la chaîne audio complète de combat', () => {
    const b = getBossDefinition('darklink')
    expect(b.revealSoundUrl).toContain('/maps/zelda/')
    expect(b.revealSoundUrl).toContain('second-boss.mp3')
    expect(b.latePhaseSoundUrl).toContain('last-pv-second-boss.mp3')
    expect(b.victoryMusicUrl).toContain('win.mp3')
    expect(b.keepMusicUntilReturnPortal).toBe(true)
  })

  test('le seuil de phase finale de darklink est inférieur au total de coups', () => {
    const b = getBossDefinition('darklink')
    expect(b.latePhaseHitThreshold).toBe(7)
    expect(b.latePhaseHitThreshold!).toBeLessThan(b.targetHits)
  })

  test('les volumes audio de darklink sont dans [0,100]', () => {
    const b = getBossDefinition('darklink')
    for (const v of [
      b.revealSoundVolume,
      b.latePhaseSoundVolume,
      b.victoryMusicVolume,
    ]) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(100)
    }
  })
})

describe('bosses — thèmes de mesh et pulsation', () => {
  test('chaque boss a un targetMeshTheme avec ring et core de rayon positif', () => {
    for (const b of bossDefinitions) {
      expect(b.targetMeshTheme!.ring.radius).toBeGreaterThan(0)
      expect(b.targetMeshTheme!.core.radius).toBeGreaterThan(0)
    }
  })

  test('la base d émission du pulse correspond à l intensité du thème', () => {
    for (const b of bossDefinitions) {
      expect(b.targetPulse!.ringEmissiveBase).toBe(
        b.targetMeshTheme!.ring.emissiveIntensity,
      )
      expect(b.targetPulse!.coreEmissiveBase).toBe(
        b.targetMeshTheme!.core.emissiveIntensity,
      )
      expect(b.targetPulse!.lightIntensityBase).toBe(
        b.targetMeshTheme!.light.intensity,
      )
    }
  })

  test('les paramètres de pulse sont positifs', () => {
    for (const b of bossDefinitions) {
      const p = b.targetPulse!
      expect(p.pulseSpeed).toBeGreaterThan(0)
      expect(p.pulseAmp).toBeGreaterThan(0)
      expect(p.hitFlashDuration).toBeGreaterThan(0)
      expect(p.hitBoost).toBeGreaterThan(1)
    }
  })
})

describe('bosses — relient leurs cinématiques caméra', () => {
  test('chaque boss référence une cinématique de reveal et de victoire valides', () => {
    for (const b of bossDefinitions) {
      expect(b.cameraCinematic.zoomInDuration).toBeGreaterThan(0)
      expect(b.victoryCameraCinematic.holdDuration).toBeGreaterThan(0)
    }
  })
})
