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
  bossThresholdMet,
} from '@pinball/game-engine'
import type { MapModule, MapContext, GameEvent } from '@pinball/game-engine'

// Module de comportement Stranger Things. Extraction progressive (phase 4.3),
// validée en jeu. Cluster actuel : VISUALS (garlands + bumperVisuals).
//
// Bridge transitoire : le module expose `garlands`/`bumperVisuals` car les
// systèmes Upside Down (transition/atmosphere) — encore dans PinballPlayfield —
// les consomment + le garlandLightsRef pilote celebrate/setFever. Ils
// déménageront au cluster Upside Down (suivant), supprimant ce bridge.
export interface StModule extends MapModule {
  garlands: GarlandLights | null
  bumperVisuals: BumperVisuals | null
  atmosphere: UpsideDownAtmosphere | null
  portal: UpsideDownPortal | null
  transition: UpsideDownTransition | null
  nestMarker: BossNestMarker | null
  bossReveals: BossRevealOrchestrator | null
  demogorgonReveal: DemogorgonReveal | null
  vecnaReveal: VecnaReveal | null
}

export function createModule(): StModule {
  let ctxRef: MapContext | null = null
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
    get garlands() {
      return garlands
    },
    get bumperVisuals() {
      return bumperVisuals
    },
    get atmosphere() {
      return atmosphere
    },
    get portal() {
      return portal
    },
    get transition() {
      return transition
    },
    get nestMarker() {
      return nestMarker
    },
    get bossReveals() {
      return bossReveals
    },
    get demogorgonReveal() {
      return demogorgonReveal
    },
    get vecnaReveal() {
      return vecnaReveal
    },
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
    },
    onGameEvent(e: GameEvent): void {
      bumperVisuals?.onGameEvent(e)
      garlands?.onGameEvent(e)
      atmosphere?.onGameEvent(e)
      portal?.onGameEvent(e)
      bossReveals?.onGameEvent(e)

      const ctx = ctxRef
      if (!ctx) return
      // Cible verrouillée frappée : flash gris + « ENCORE X PTS » au DMD.
      if (e.type === 'BOSS_LOCKED_HIT') {
        nestMarker?.flashLocked(e.bossId)
        ctx.pushDmdEvent(`ENCORE ${e.remaining} PTS`, 0)
      }
      // Cinématiques boss Demogorgon (reveal + victoire).
      if (e.type === 'BOSS_REVEAL' && e.bossId === 'demogorgon') {
        ctx.playCinematic('demogorgon_rises', { once: true })
      }
      if (e.type === 'BOSS_TARGET_HIT' && e.bossId === 'demogorgon') {
        const demo = ctx.layout.bosses.find((b) => b.id === 'demogorgon')
        if (demo && e.hitCount >= demo.targetHits) {
          // Slow-mo 400ms avant la cinématique de victoire (gel ensuite).
          ctx.physics.setTimeScale(1 / 3)
          window.setTimeout(() => {
            ctx.physics.setTimeScale(1)
            ctx.playCinematic('demogorgon_slain', {
              // Reprise « avec un bang » : impulse radial depuis la cible.
              onEnd: () =>
                ctx.ball?.applyEjectionForce({ x: demo.target.x, z: demo.target.z }),
            })
          }, 400)
        }
      }

      // ── Cycle de monde : entrée Upside Down / retour monde normal ──────────
      if (e.type === 'PORTAL_ENTER') {
        const ball = ctx.ball
        const mesh = ctx.ballMesh
        if (!ball || !mesh || !transition || transition.isActive()) return
        ball.holdAtUpsideDownSpawn()
        ball.syncToMesh(mesh)
        transition.start(
          {
            ballMesh: mesh,
            ballBody: ball.body,
            onRevealStart: () => ctx.playSound('upside_down_appear'),
            onTremorStart: () => ctx.emitGameEvent({ type: 'PORTAL_TREMOR' }),
          },
          () => {
            ball.spawnFromUpsideDown()
            ctx.resetPortalTrigger()
            ctx.resetStuck()
            ball.syncToMesh(mesh)
            mesh.visible = true
            mesh.scale.setScalar(1)
            ctx.emitGameEvent({ type: 'PORTAL_TRANSITION_END' })
          },
        )
      }
      if (e.type === 'RETURN_PORTAL_ENTER') {
        const ball = ctx.ball
        const mesh = ctx.ballMesh
        if (!ball || !mesh || !transition || transition.isActive()) return
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

      // Reconciliation des marqueurs de nid après chaque event : déclenché →
      // revealed ; sinon palier atteint → armed ; sinon locked. Idempotent.
      if (nestMarker) {
        const gate = ctx.bossGateContext()
        nestMarker.setUpsideDown(gate.upsideDownActive)
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
      garlands?.update(dt)
      atmosphere?.update(dt)
      portal?.update(dt)
      bossReveals?.update(dt)
      nestMarker?.update(dt)
      // transition.update reste piloté par PinballPlayfield (post-lecture
      // isActive, pour préserver l'ordre de décision du gel à 1 frame près).
    },
    shouldFreezePhysics(): boolean {
      return transition?.isActive() ?? false
    },
    onGameReset(): void {},
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
