import type { MapModule, MapContext, GameEvent } from '@pinball/game-engine'
import { GanondorfReveal, BossRevealOrchestrator, SacredRealmAtmosphere } from '../systems'

// Module de comportement Zelda. Gère les compteurs, les milestones,
// les événements boss et le système visuel Ganondorf.
export function createModule(): MapModule {
  let ctxRef: MapContext | null = null

  // Compteurs Zelda (alimentent mapState + GameStats.counters).
  let ganondorfs = 0
  let portals = 0
  let hetic = 0

  // Nid : armé depuis (ms) + hint tardif déjà émis, par boss.
  const armedAt: Record<string, number> = {}
  const hintFired = new Set<string>()

  let ganondorfReveal: GanondorfReveal | null = null
  let bossReveals: BossRevealOrchestrator | null = null
  let sacredRealm: SacredRealmAtmosphere | null = null

  return {
    setup(ctx: MapContext): void {
      ctxRef = ctx

      ganondorfReveal = new GanondorfReveal()
      ganondorfReveal.setup({
        root: ctx.root,
        scene: ctx.scene,
        camera: ctx.camera,
        onFightEnd: () => ctx.setBossFightActive('ganondorf', false),
        onTargetReady: () => ctx.setBossTargetArmed('ganondorf', true),
      })
      ganondorfReveal.setEmit(ctx.emitGameEvent)

      bossReveals = new BossRevealOrchestrator()
      bossReveals.register(ganondorfReveal)

      sacredRealm = new SacredRealmAtmosphere()
      sacredRealm.setup({
        root: ctx.root,
        lighting: {
          scene: ctx.scene,
          renderer: ctx.lighting.renderer,
          ambient: ctx.lighting.ambient,
          hemi: ctx.lighting.hemi,
          dir: ctx.lighting.dir,
          fill: ctx.lighting.fill,
        },
      })
    },

    async preload(): Promise<void> {
      const ctx = ctxRef
      if (!ctx || !bossReveals) return
      await bossReveals
        .preloadAll(ctx.lighting.renderer, ctx.scene, ctx.camera)
        .catch((err) => console.warn('[BossReveals] preload failed:', err))
    },

    onGameEvent(e: GameEvent): void {
      bossReveals?.onGameEvent(e)
      sacredRealm?.onGameEvent(e)

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
        bossReveals?.endAllFights()
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
      bossReveals?.update(dt)
      sacredRealm?.update(dt)

      const ctx = ctxRef
      if (!ctx) return

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
      return bossReveals?.isGameplayFrozen() ?? false
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
      sacredRealm?.reset()
    },

    resetWorld(): void {
      sacredRealm?.reset()
    },

    onGameReset(): void {
      ganondorfs = 0
      portals = 0
      hetic = 0
      for (const k of Object.keys(armedAt)) delete armedAt[k]
      hintFired.clear()
      ctxRef?.setMapState({ ganondorfs: 0, portals: 0, hetic: 0 })
      bossReveals?.endAllFights()
      sacredRealm?.reset()
    },

    dispose(): void {
      bossReveals?.dispose()
      bossReveals = null
      ganondorfReveal = null
      sacredRealm?.dispose()
      sacredRealm = null
      ctxRef = null
    },
  }
}
