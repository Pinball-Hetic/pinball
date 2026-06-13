import type { MapModule, MapContext, GameEvent } from '@pinball/game-engine'

// Module de comportement Zelda. Scaffold minimal : gère les compteurs,
// les milestones, et les événements boss. Les systèmes visuels Zelda
// (atmosphère Sacred Realm, effets Triforce, etc.) sont à implémenter
// dans packages/maps/zelda/systems/ puis à brancher ici.
export function createModule(): MapModule {
  let ctxRef: MapContext | null = null

  // Compteurs Zelda (alimentent mapState + GameStats.counters).
  let ganondorfs = 0
  let portals = 0
  let hetic = 0

  // Nid : armé depuis (ms) + hint tardif déjà émis, par boss.
  const armedAt: Record<string, number> = {}
  const hintFired = new Set<string>()

  return {
    setup(ctx: MapContext): void {
      ctxRef = ctx
      // TODO: instancier les systèmes visuels Zelda ici.
      // Ex: new SacredRealmAtmosphere().setup(...)
    },

    async preload(): Promise<void> {
      // TODO: précharger les assets boss Zelda (modèles 3D, textures).
    },

    onGameEvent(e: GameEvent): void {
      const ctx = ctxRef
      if (!ctx) return

      // Cible boss verrouillée frappée.
      if (e.type === 'BOSS_LOCKED_HIT') {
        ctx.pushDmdEvent(`ENCORE ${e.remaining} PTS`, 0)
      }

      // Palier de score : cinématique + shake.
      if (e.type === 'MILESTONE') {
        const clip =
          e.threshold === 5000
            ? 'milestone_5k'
            : e.threshold === 15000
              ? 'milestone_15k'
              : e.threshold === 30000
                ? 'milestone_30k'
                : 'milestone_big'
        ctx.playCinematic(clip, { value: e.threshold })
        ctx.screenShake(0.4)
      }

      // Entrée Sacred Realm confirmée.
      if (e.type === 'PORTAL_TRANSITION_END') {
        ctx.resetPortalTrigger()
        ctx.enterAlternateWorld()
      }

      // Game over : fin de tous les combats.
      if ((e.type === 'DRAIN' || e.type === 'BOTTOM_OUT') && ctx.gameState() === 'game_over') {
        // TODO: bossReveals?.endAllFights()
      }

      // Le nid s'éveille.
      if (e.type === 'BOSS_ARMED') {
        armedAt[e.bossId] = performance.now()
        ctx.pushDmdEvent('LE NID S EVEILLE', 0)
        ctx.screenShake(0.3)
      }

      // Cinématiques boss Ganondorf.
      if (e.type === 'BOSS_REVEAL' && e.bossId === 'ganondorf') {
        ctx.playCinematic('ganondorf_rises', { once: true })
      }
      if (e.type === 'BOSS_TARGET_HIT' && e.bossId === 'ganondorf') {
        const boss = ctx.layout.bosses.find((b) => b.id === 'ganondorf')
        if (boss && e.hitCount >= boss.targetHits) {
          ctx.physics.setTimeScale(1 / 3)
          window.setTimeout(() => {
            ctx.physics.setTimeScale(1)
            ctx.playCinematic('ganondorf_slain', {
              onEnd: () =>
                ctx.ball?.applyEjectionForce({ x: boss.target.x, z: boss.target.z }),
            })
          }, 400)
        }
      }

      // Compteurs Zelda.
      if (e.type === 'BOSS_TARGET_HIT') {
        const boss = ctx.layout.bosses.find((b) => b.id === e.bossId)
        if (boss && e.hitCount >= boss.targetHits) {
          ganondorfs += 1
          ctx.setMapState({ ganondorfs })
        }
      }
      if (e.type === 'DROP_TARGET_COMPLETE') {
        hetic += 1
        if (hetic < 5) {
          ctx.setMapState({ hetic })
          ctx.playCinematic('hetic_letter', { value: hetic })
        } else {
          ctx.setMapState({ hetic: 5 })
          ctx.playCinematic('hetic_complete', {
            onEnd: () => {
              ctx.forceMultiplier(5, 30_000)
              ctx.refreshScoreSnapshot()
            },
          })
          hetic = 0
          ctx.setMapState({ hetic: 0 })
        }
      }

      // Portail → Sacred Realm.
      if (e.type === 'PORTAL_ENTER') {
        portals += 1
        ctx.setMapState({ portals })
        const ball = ctx.ball
        const mesh = ctx.ballMesh
        // TODO: déclencher la transition d'atmosphère Sacred Realm.
        if (ball && mesh) {
          ball.holdAtAlternateWorldSpawn()
          ball.syncToMesh(mesh)
        }
      }
      if (e.type === 'RETURN_PORTAL_ENTER') {
        const ball = ctx.ball
        const mesh = ctx.ballMesh
        if (ball && mesh) {
          ball.holdAtNormalReturnSpawn()
          ball.syncToMesh(mesh)
          ctx.completeWorldCycle()
          ctx.resetStuck()
          ball.syncToMesh(mesh)
          mesh.visible = true
          mesh.scale.setScalar(1)
          ctx.emitGameEvent({ type: 'WORLD_CYCLE_COMPLETE' })
          ctx.emitGameEvent({ type: 'RETURN_PORTAL_TRANSITION_END' })
        }
      }

      // TODO: réconciliation des marqueurs de nid (nestMarker + bossGateContext).
    },

    update(dt: number): void {
      const ctx = ctxRef
      if (!ctx) return

      // TODO: systèmes.update(dt)

      // Hint tardif du nid (identique à ST).
      const now = performance.now()
      for (const boss of ctx.layout.bosses) {
        const at = armedAt[boss.id]
        if (at === undefined || hintFired.has(boss.id) || now - at < 45_000) continue
        hintFired.add(boss.id)
        const hint = boss.hud.nestHintLabel
        if (hint) ctx.pushDmdEvent(hint, 0)
      }
    },

    shouldFreezePhysics(): boolean {
      // TODO: retourner true pendant les transitions d'atmosphère.
      return false
    },

    isIntroHolding(): boolean {
      return false
    },

    applyBallMagnet(): void {
      // TODO: magnétisme portail Sacred Realm.
    },

    setSporesEnabled(_enabled: boolean): void {
      // Pas de spores dans la map Zelda (réservé à l'Upside Down ST).
    },

    releaseWorld(): void {
      // TODO: réinitialiser l'atmosphère Sacred Realm.
    },

    resetWorld(): void {
      // TODO: réinitialiser portail + atmosphère.
    },

    onGameReset(): void {
      ganondorfs = 0
      portals = 0
      hetic = 0
      for (const k of Object.keys(armedAt)) delete armedAt[k]
      hintFired.clear()
      ctxRef?.setMapState({ ganondorfs: 0, portals: 0, hetic: 0 })
    },

    dispose(): void {
      // TODO: dispose des systèmes visuels.
      ctxRef = null
    },
  }
}
