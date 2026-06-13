import {
  GarlandLights,
  BumperVisuals,
  UpsideDownAtmosphere,
  UpsideDownPortal,
  UpsideDownTransition,
  BossNestMarker,
  DemogorgonReveal,
  VecnaReveal,
  BossRevealOrchestrator,
} from '../systems'
import { bossThresholdMet } from '@pinball/game-engine'
import type { MapModule, MapContext, GameEvent } from '@pinball/game-engine'

// Module de comportement Stranger Things. Possède tous ses systèmes en
// closure ; n'expose que le contrat MapModule (aucun bridge vers le
// composant playfield).
export function createModule(): MapModule {
  let ctxRef: MapContext | null = null
  // Compteurs ST (alimentent mapState + GameStats.counters).
  let demogorgons = 0
  let portals = 0
  let hetic = 0
  // Nid : armé depuis (ms) + hint tardif déjà émis, par boss.
  const armedAt: Record<string, number> = {}
  const hintFired = new Set<string>()
  let garlands: GarlandLights | null = null
  let bumperVisuals: BumperVisuals | null = null
  let atmosphere: UpsideDownAtmosphere | null = null
  let portal: UpsideDownPortal | null = null
  let transition: UpsideDownTransition | null = null
  let nestMarker: BossNestMarker | null = null
  let bossReveals: BossRevealOrchestrator | null = null
  let demogorgonReveal: DemogorgonReveal | null = null
  let vecnaReveal: VecnaReveal | null = null
  return {
    setup(ctx: MapContext): void {
      ctxRef = ctx
      bumperVisuals = new BumperVisuals()
      bumperVisuals.setup(ctx.root)
      garlands = new GarlandLights()
      garlands.setup(ctx.root)
      atmosphere = new UpsideDownAtmosphere()
      atmosphere.setup({
        root: ctx.root,
        garlandLights: garlands,
        bumperVisuals,
        lighting: {
          scene: ctx.scene,
          renderer: ctx.lighting.renderer,
          ambient: ctx.lighting.ambient,
          hemi: ctx.lighting.hemi,
          dir: ctx.lighting.dir,
          fill: ctx.lighting.fill,
        },
      })
      portal = new UpsideDownPortal()
      portal.setup({
        root: ctx.root,
        world: ctx.physics.world,
        colliderMap: ctx.colliderMap,
        onOpenChange: (open) => ctx.setPortalGateOpen(open),
      })
      transition = new UpsideDownTransition()
      transition.setup({
        root: ctx.root,
        scene: ctx.scene,
        camera: ctx.camera,
        garlandLights: garlands,
        bumperVisuals,
      })

      nestMarker = new BossNestMarker()
      nestMarker.setup({ root: ctx.root })
      demogorgonReveal = new DemogorgonReveal()
      demogorgonReveal.setup({
        root: ctx.root,
        scene: ctx.scene,
        camera: ctx.camera,
        garlandLights: garlands,
        bumperVisuals,
        onFightEnd: () => ctx.setBossFightActive('demogorgon', false),
        onTargetReady: () => ctx.setBossTargetArmed('demogorgon', true),
      })
      demogorgonReveal.setEmit(ctx.emitGameEvent)
      vecnaReveal = new VecnaReveal()
      vecnaReveal.setup({
        root: ctx.root,
        camera: ctx.camera,
        garlandLights: garlands,
        bumperVisuals,
        onFightEnd: () => ctx.setBossFightActive('vecna', false),
        onTargetReady: () => ctx.setBossTargetArmed('vecna', true),
      })
      bossReveals = new BossRevealOrchestrator()
      bossReveals.register(demogorgonReveal).register(vecnaReveal)
      vecnaReveal.bindUpsideDownAtmosphere(atmosphere)
    },
    async preload(): Promise<void> {
      const ctx = ctxRef
      if (!ctx || !bossReveals) return
      await bossReveals
        .preloadAll(ctx.lighting.renderer, ctx.scene, ctx.camera)
        .catch((err) => console.warn('[BossReveals] preload failed:', err))
    },
    onGameEvent(e: GameEvent): void {
      bumperVisuals?.onGameEvent(e)
      garlands?.onGameEvent(e)
      atmosphere?.onGameEvent(e)
      const ctx = ctxRef
      if (e.type === 'BOSS_TARGET_HIT' && ctx) {
        const boss = ctx.layout.bosses.find((b) => b.id === e.bossId)
        if (boss && e.hitCount >= boss.targetHits) {
          portal?.notifyBossDefeated(e.bossId, ctx.bossGateContext().alternateWorldActive)
        }
      }
      portal?.onGameEvent(e)
      bossReveals?.onGameEvent(e)

      if (!ctx) return
      if (e.type === 'BOSS_LOCKED_HIT') {
        ctx.pushDmdEvent(`ENCORE ${e.remaining} PTS`, 0)
      }
      // Palier de score : cinématique + frisson garlands + shake.
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
        garlands?.celebrate()
        ctx.screenShake(0.4)
      }
      // Entrée Upside Down confirmée (fin de transition) : portail actif +
      // baseline core + nid en mode Upside Down.
      if (e.type === 'PORTAL_TRANSITION_END') {
        portal?.reset()
        portal?.setUpsideDownActive(true)
        ctx.resetPortalTrigger()
        ctx.enterAlternateWorld()
        nestMarker?.setUpsideDown(true)
      }
      // Game over en drainant : fin de tous les combats boss.
      if ((e.type === 'DRAIN' || e.type === 'BOTTOM_OUT') && ctx.gameState() === 'game_over') {
        bossReveals?.endAllFights()
      }
      // Le nid s'éveille : bandeau DMD + celebrate + shake + horodatage hint.
      if (e.type === 'BOSS_ARMED') {
        armedAt[e.bossId] = performance.now()
        ctx.pushDmdEvent('LE NID S EVEILLE', 0)
        garlands?.celebrate()
        ctx.screenShake(0.3)
      }
      // Cinématiques boss Demogorgon (reveal + victoire).
      if (e.type === 'BOSS_REVEAL' && e.bossId === 'demogorgon') {
        ctx.playCinematic('demogorgon_rises', { once: true })
      }
      if (e.type === 'BOSS_TARGET_HIT' && e.bossId === 'demogorgon') {
        const demo = ctx.layout.bosses.find((b) => b.id === 'demogorgon')
        if (demo && e.hitCount >= demo.targetHits) {
          ctx.physics.setTimeScale(1 / 3)
          window.setTimeout(() => {
            ctx.physics.setTimeScale(1)
            ctx.playCinematic('demogorgon_slain', {
              onEnd: () =>
                ctx.ball?.applyEjectionForce({ x: demo.target.x, z: demo.target.z }),
            })
          }, 200)
        }
      }

      // ── Compteurs ST (demogorgons / portals / hetic → mapState) ────────────
      if (e.type === 'BOSS_TARGET_HIT') {
        const boss = ctx.layout.bosses.find((b) => b.id === e.bossId)
        if (boss && e.hitCount >= boss.targetHits) {
          demogorgons += 1
          ctx.setMapState({ demogorgons })
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
              // Fever 30s : multiplicateur forcé + reprise immédiate du SCORE.
              ctx.forceMultiplier(5, 30_000)
              ctx.refreshScoreSnapshot()
            },
          })
          hetic = 0
          ctx.setMapState({ hetic: 0 })
        }
      }

      // ── Cycle de monde : entrée Upside Down / retour monde normal ──────────
      if (e.type === 'PORTAL_ENTER') {
        portals += 1
        ctx.setMapState({ portals })
        const ball = ctx.ball
        const mesh = ctx.ballMesh
        if (ball && mesh && transition && !transition.isActive()) {
          portal?.hideForCinematic()
          ball.holdAtAlternateWorldSpawn()
          ball.syncToMesh(mesh)
          transition.start(
            {
              ballMesh: mesh,
              ballBody: ball.body,
              onRevealStart: () => ctx.playSound('upside_down_appear'),
              onTremorStart: () => ctx.emitGameEvent({ type: 'PORTAL_TREMOR' }),
            },
            () => {
              ball.spawnFromAlternateWorld()
              ctx.resetPortalTrigger()
              ctx.resetStuck()
              ball.syncToMesh(mesh)
              mesh.visible = true
              mesh.scale.setScalar(1)
              ctx.emitGameEvent({ type: 'PORTAL_TRANSITION_END' })
            },
          )
        }
      }
      if (e.type === 'RETURN_PORTAL_ENTER') {
        const ball = ctx.ball
        const mesh = ctx.ballMesh
        if (ball && mesh && transition && !transition.isActive()) {
          portal?.hideForCinematic()
          ball.holdAtNormalReturnSpawn()
          ball.syncToMesh(mesh)
          transition.start(
            {
              ballMesh: mesh,
              ballBody: ball.body,
              onRevealStart: () => ctx.playSound('upside_down_appear'),
              onTremorStart: () => ctx.emitGameEvent({ type: 'PORTAL_TREMOR' }),
            },
            () => {
              ball.spawnFromNormalReturn()
              portal?.reset()
              portal?.setUpsideDownActive(false)
              atmosphere?.reset()
              ctx.completeWorldCycle()
              bossReveals?.endAllFights()
              ctx.resetStuck()
              ball.syncToMesh(mesh)
              mesh.visible = true
              mesh.scale.setScalar(1)
              ctx.emitGameEvent({ type: 'WORLD_CYCLE_COMPLETE' })
              ctx.emitGameEvent({ type: 'RETURN_PORTAL_TRANSITION_END' })
            },
          )
        }
      }

      // Reconciliation des marqueurs de nid après chaque event : déclenché →
      // revealed ; sinon palier atteint → armed ; sinon locked. Idempotent.
      if (nestMarker) {
        const gate = ctx.bossGateContext()
        nestMarker.setUpsideDown(gate.alternateWorldActive)
        for (const boss of ctx.layout.bosses) {
          if (ctx.isBossTriggered(boss.id)) {
            nestMarker.setState(boss.id, 'revealed')
          } else {
            nestMarker.setState(boss.id, bossThresholdMet(boss, gate) ? 'armed' : 'locked')
          }
        }
      }
    },
    update(dt: number): void {
      bumperVisuals?.update(dt)
      garlands?.setFever(ctxRef?.isFeverActive() ?? false)
      garlands?.update(dt)
      atmosphere?.update(dt)
      portal?.update(dt)
      bossReveals?.update(dt)
      nestMarker?.update(dt)
      transition?.update(dt) // no-op si inactif (gardé en interne)

      // Hint tardif du nid : armé > 45 s sans reveal → bandeau DMD une fois.
      const ctx = ctxRef
      if (ctx && nestMarker) {
        const now = performance.now()
        for (const boss of ctx.layout.bosses) {
          const at = armedAt[boss.id]
          if (
            at === undefined ||
            hintFired.has(boss.id) ||
            !nestMarker.isArmed(boss.id) ||
            now - at < 45_000
          ) {
            continue
          }
          hintFired.add(boss.id)
          nestMarker.setLateHint(boss.id, true)
          const hint = boss.hud.nestHintLabel
          if (hint) ctx.pushDmdEvent(hint, 0)
        }
      }
    },
    shouldFreezePhysics(): boolean {
      return (transition?.isActive() ?? false) || (bossReveals?.isGameplayFrozen() ?? false)
    },
    isIntroHolding(): boolean {
      return bossReveals?.isGameplayFrozen() ?? false
    },
    applyBallMagnet(): void {
      const body = ctxRef?.ball?.body
      if (body && portal?.isOpen()) portal.applyMagnet(body)
    },
    setSporesEnabled(enabled: boolean): void {
      atmosphere?.setSporesEnabled(enabled)
    },
    releaseWorld(): void {
      portal?.setUpsideDownActive(false)
      atmosphere?.reset()
      vecnaReveal?.endFight()
    },
    resetWorld(): void {
      portal?.reset()
      atmosphere?.reset()
      bossReveals?.endAllFights()
    },
    onGameReset(): void {
      demogorgons = 0
      portals = 0
      hetic = 0
      for (const k of Object.keys(armedAt)) delete armedAt[k]
      hintFired.clear()
      nestMarker?.reset()
      ctxRef?.setMapState({ demogorgons: 0, portals: 0, hetic: 0 })
    },
    dispose(): void {
      bumperVisuals?.dispose()
      garlands?.dispose()
      atmosphere?.dispose()
      portal?.dispose()
      transition?.dispose()
      bossReveals?.dispose()
      nestMarker?.dispose()
      bumperVisuals = null
      garlands = null
      atmosphere = null
      portal = null
      transition = null
      nestMarker = null
      bossReveals = null
      demogorgonReveal = null
      vecnaReveal = null
    },
  }
}
