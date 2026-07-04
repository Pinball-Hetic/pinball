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
import { RETURN_PORTAL_TEXTURE_URL } from '../systems/UpsideDownConstants'
import {
  resolveNestState,
  dueLateHints,
  advanceHetic,
  ballCenterOnSurface,
  SCORE_SCOOP,
  handleBossLockedHit,
  handleBossArmed,
  isGameOverDrain,
  isBossTargetDefeated,
  createBossDefeatTimers,
} from '@pinball/game-engine'
import type { MapModule, MapContext, GameEvent } from '@pinball/game-engine'
import { grantExtraLife } from './lifeBonus'
import { createLastLifeRescue } from './lastLifeRescue'
import { playMilestoneCinematic } from './milestoneCinematic'
import { createScoopCapture } from './scoopCapture'

// Stranger Things behavior module. Owns all its systems in closure; exposes
// only the MapModule contract (no bridge to the playfield component).
export function createModule(): MapModule {
  let ctxRef: MapContext | null = null
  // ST counters (feed mapState + GameStats.counters).
  let demogorgons = 0
  let portals = 0
  let hetic = 0
  // Nest: armed-since timestamp (ms) + late hint already fired, per boss.
  const armedAt: Record<string, number> = {}
  const hintFired = new Set<string>()
  // Boss id list (static after setup) — hoisted to avoid an array allocation
  // on every update tick (nest late hint).
  let bossIds: readonly string[] = []
  // Timescale-restore timers after a boss defeat (~200 ms). Tracked per
  // bossId to avoid leaks (cancelled on reset/dispose, never stacked).
  // See createBossDefeatTimers (game-engine).
  const bossDefeatTimers = createBossDefeatTimers()
  let garlands: GarlandLights | null = null
  let bumperVisuals: BumperVisuals | null = null
  let atmosphere: UpsideDownAtmosphere | null = null
  let portal: UpsideDownPortal | null = null
  let transition: UpsideDownTransition | null = null
  let nestMarker: BossNestMarker | null = null
  let bossReveals: BossRevealOrchestrator | null = null
  let demogorgonReveal: DemogorgonReveal | null = null
  let vecnaReveal: VecnaReveal | null = null
  const lastLifeRescue = createLastLifeRescue()
  // Scoop hole (saucer): capture → hold → kick state machine.
  const scoop = createScoopCapture()

  // ── onGameEvent handlers (closures over ST state/systems) ────────────────
  function onMilestone(ctx: MapContext, e: GameEvent): void {
    if (e.type !== 'MILESTONE') return
    // Score milestone: rocket cinematic + garland liftoff (rising orange
    // sweep, matching the DMD/backglass rocket) + shake.
    playMilestoneCinematic(ctx, e.threshold, () => garlands?.rocketBurst())
  }

  function onScoop(_ctx: MapContext, e: GameEvent): void {
    if (e.type !== 'SCOOP_ENTER') return
    // Sensor contact only ARMS. Capture (and rewards) happens only if the
    // ball SETTLES in the zone (dwell, see scoopCapture.ts) — a ball just
    // passing through the lane exits with no effect.
    scoop.arm()
  }

  // Rewards + juice at capture instant (phase 'capture', one frame).
  function grantScoopRewards(ctx: MapContext): void {
    ctx.addScore(SCORE_SCOOP, 'SCOOP')
    ctx.addLife()
    ctx.forceMultiplier(scoop.config.multiplier, scoop.config.multiplierMs)
    ctx.pushDmdEvent('SCOOP', SCORE_SCOOP)
    ctx.screenShake(0.5)
    garlands?.rocketBurst()
  }

  function onPortalTransitionEnd(ctx: MapContext, e: GameEvent): void {
    if (e.type !== 'PORTAL_TRANSITION_END') return
    // Upside Down entry confirmed: portal active + core baseline + UD nest.
    portal?.reset()
    portal?.setUpsideDownActive(true)
    ctx.resetPortalTrigger()
    ctx.enterAlternateWorld()
    nestMarker?.setUpsideDown(true)
  }

  function onGameOverDrain(ctx: MapContext, e: GameEvent): void {
    // Game over on drain: end all boss fights.
    if (isGameOverDrain(e, ctx.gameState())) bossReveals?.endAllFights()
  }

  function onBossArmed(ctx: MapContext, e: GameEvent): void {
    if (e.type !== 'BOSS_ARMED') return
    // Nest wakes up: DMD banner + hint timestamp (shared) + celebrate + shake.
    handleBossArmed(ctx, e, armedAt, performance.now())
    garlands?.celebrate()
    ctx.screenShake(0.3)
  }

  function onDemogorgon(ctx: MapContext, e: GameEvent): void {
    // Demogorgon boss cinematics (reveal + victory).
    if (e.type === 'BOSS_REVEAL' && e.bossId === 'demogorgon') {
      ctx.playCinematic('demogorgon_rises', { once: true })
    }
    if (e.type === 'BOSS_TARGET_HIT' && e.bossId === 'demogorgon') {
      const demo = ctx.layout.bosses.find((b) => b.id === 'demogorgon')
      if (demo && isBossTargetDefeated(demo.targetHits, e.hitCount)) {
        ctx.physics.setTimeScale(1 / 3)
        bossDefeatTimers.schedule('demogorgon', 200, () => {
          ctx.physics.setTimeScale(1)
          ctx.playCinematic('demogorgon_slain', {
            onEnd: () =>
              ctx.ball?.applyEjectionForce({ x: demo.target.x, z: demo.target.z }),
          })
        })
      }
    }
  }

  function onBossDefeatedCounter(ctx: MapContext, e: GameEvent): void {
    // ST demogorgons counter → mapState.
    if (e.type !== 'BOSS_TARGET_HIT') return
    const boss = ctx.layout.bosses.find((b) => b.id === e.bossId)
    if (boss && isBossTargetDefeated(boss.targetHits, e.hitCount)) {
      demogorgons += 1
      ctx.setMapState({ demogorgons })
    }
  }

  function onDropTargetComplete(ctx: MapContext, e: GameEvent): void {
    if (e.type !== 'DROP_TARGET_COMPLETE') return
    hetic = advanceHetic(ctx, hetic)
  }

  function onPortalEnter(ctx: MapContext, e: GameEvent): void {
    if (e.type !== 'PORTAL_ENTER') return
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

  function onReturnPortalEnter(ctx: MapContext, e: GameEvent): void {
    if (e.type !== 'RETURN_PORTAL_ENTER') return
    const ball = ctx.ball
    const mesh = ctx.ballMesh
    if (ball && mesh && transition && !transition.isActive()) {
      bossReveals?.endAllFights()
      portal?.hideForCinematic()
      ball.holdAtNormalReturnSpawn()
      ball.syncToMesh(mesh)
      transition.start(
        {
          ballMesh: mesh,
          ballBody: ball.body,
          textureUrl: RETURN_PORTAL_TEXTURE_URL,
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

  function reconcileNestMarkers(ctx: MapContext): void {
    // Nest marker reconciliation after each event: triggered → revealed;
    // else threshold reached → armed; else locked. Idempotent.
    if (!nestMarker) return
    const gate = ctx.bossGateContext()
    nestMarker.setUpsideDown(gate.alternateWorldActive)
    for (const boss of ctx.layout.bosses) {
      nestMarker.setState(boss.id, resolveNestState(boss, gate, ctx.isBossTriggered(boss.id)))
    }
  }

  return {
    setup(ctx: MapContext): void {
      ctxRef = ctx
      bossIds = ctx.layout.bosses.map((b) => b.id)
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
        onFightEnd: () => {
          ctx.setBossFightActive('demogorgon', false);
          ctx.emitGameEvent({ type: 'BOSS_FIGHT_END', bossId: 'demogorgon' });
        },
        onTargetReady: () => ctx.setBossTargetArmed('demogorgon', true),
        // Eleven assist gate: outside 'playing' (drain, waiting for relaunch)
        // the sub-timer is suspended — otherwise +100 pts loops without playing.
        isPlaying: () => ctx.gameState() === 'playing',
      })
      demogorgonReveal.setEmit(ctx.emitGameEvent)
      vecnaReveal = new VecnaReveal()
      vecnaReveal.setup({
        root: ctx.root,
        camera: ctx.camera,
        garlandLights: garlands,
        bumperVisuals,
        onFightEnd: () => {
          ctx.setBossFightActive('vecna', false);
          ctx.emitGameEvent({ type: 'BOSS_FIGHT_END', bossId: 'vecna' });
        },
        onTargetReady: () => ctx.setBossTargetArmed('vecna', true),
      })
      bossReveals = new BossRevealOrchestrator()
      bossReveals.register(demogorgonReveal).register(vecnaReveal)
      vecnaReveal.bindUpsideDownAtmosphere(atmosphere)

      ctx.root.traverse((obj) => {
        if (obj.name.includes('stangerthing_plate')) obj.visible = false
      })
    },
    async preload(): Promise<void> {
      const ctx = ctxRef
      if (!ctx || !bossReveals) return
      await bossReveals
        .preloadAll(ctx.lighting.renderer, ctx.scene, ctx.camera)
        .catch((err) => console.warn('[BossReveals] preload failed:', err))
    },
    onPreDrain(livesBeforeDrain: number): void {
      const ctx = ctxRef
      if (!ctx) return
      lastLifeRescue.onPreDrain(ctx, livesBeforeDrain)
    },
    onGameEvent(e: GameEvent): void {
      bumperVisuals?.onGameEvent(e)
      garlands?.onGameEvent(e)
      atmosphere?.onGameEvent(e)
      const ctx = ctxRef
      let portalDefeatHandled = false
      if (e.type === 'BOSS_TARGET_HIT' && ctx) {
        const boss = ctx.layout.bosses.find((b) => b.id === e.bossId)
        if (boss && e.hitCount >= boss.targetHits) {
          grantExtraLife(ctx)
          portal?.notifyBossDefeated(e.bossId, ctx.bossGateContext().alternateWorldActive)
          portalDefeatHandled = true
        }
      }
      if (!portalDefeatHandled) portal?.onGameEvent(e)
      bossReveals?.onGameEvent(e)

      if (!ctx) return
      lastLifeRescue.onGameEvent(ctx, e)

      // Ordered dispatch — order is load-bearing.
      handleBossLockedHit(ctx, e)
      onMilestone(ctx, e)
      onScoop(ctx, e)
      onPortalTransitionEnd(ctx, e)
      onGameOverDrain(ctx, e)
      onBossArmed(ctx, e)
      onDemogorgon(ctx, e)
      onBossDefeatedCounter(ctx, e)
      onDropTargetComplete(ctx, e)
      onPortalEnter(ctx, e)
      onReturnPortalEnter(ctx, e)
      reconcileNestMarkers(ctx)
    },
    update(dt: number): void {
      bumperVisuals?.update(dt)
      garlands?.setFever(ctxRef?.isFeverActive() ?? false)
      garlands?.update(dt)
      atmosphere?.update(dt)
      portal?.update(dt)
      bossReveals?.update(dt)
      nestMarker?.update(dt)
      transition?.update(dt) // no-op when inactive (guarded internally)

      // Nest late hint: armed > 45 s without reveal → DMD banner once.
      const ctx = ctxRef
      if (ctx && nestMarker) {
        const marker = nestMarker
        const candidates = bossIds.filter((id) => marker.isArmed(id))
        for (const id of dueLateHints(candidates, armedAt, hintFired, performance.now())) {
          hintFired.add(id)
          marker.setLateHint(id, true)
          const hint = ctx.layout.bosses.find((b) => b.id === id)?.hud.nestHintLabel
          if (hint) ctx.pushDmdEvent(hint, 0)
        }
      }

      // Scoop: dwell (ball settled in zone?) → capture → hold → kick.
      // NOTE: uses ctx.ball.body (raw RigidBody) — to be replaced by
      // holdAt/kick helpers.
      const scoopPos = ctx?.layout.sensors.scoop
      if (ctx?.ball && scoopPos) {
        const bp = ctx.ball.body.translation()
        const bv = ctx.ball.body.linvel()
        const dx = bp.x - scoopPos.x
        const dz = bp.z - scoopPos.z
        const speed = Math.sqrt(bv.x * bv.x + bv.y * bv.y + bv.z * bv.z)
        const phase = scoop.tick(dt * 1000, {
          inZone: dx * dx + dz * dz <= scoop.config.captureRadius ** 2,
          slow: speed <= scoop.config.settleSpeed,
        })
        if (phase === 'capture') {
          grantScoopRewards(ctx)
        } else if (phase === 'hold') {
          // Physics is frozen during hold (shouldFreezePhysics) → just center
          // the ball in the hole, at rest. resetStuck is defensive.
          ctx.ball.body.setTranslation({ x: scoopPos.x, y: scoopPos.y, z: scoopPos.z }, true)
          ctx.ball.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
          ctx.ball.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
          ctx.resetStuck()
        } else if (phase === 'eject') {
          // Teleport-eject: place the ball at the exit point (absolute,
          // resting on the surface) with a direct exit velocity (see ScoopConfig).
          const p = scoop.config.ejectPos
          ctx.ball.body.setTranslation(
            { x: p.x, y: ballCenterOnSurface(p.z), z: p.z },
            true,
          )
          ctx.ball.body.setLinvel(scoop.config.ejectVelocity, true)
          ctx.ball.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
        }
      }
    },
    shouldFreezePhysics(): boolean {
      return (
        (transition?.isActive() ?? false) ||
        (bossReveals?.isGameplayFrozen() ?? false) ||
        // Scoop hold: freeze → ball motionless in the hole (no gravity or
        // surface-snap/stuck-detector fighting it) until the kick.
        // (NOT during 'armed': the ball must be able to roll/settle.)
        scoop.isHolding()
      )
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
    // ── Contract of the three reset hooks (disjoint responsibilities) ─────────
    // releaseWorld: "soft" exit from the alternate world MID-game (normal
    //   return via portal). Disables Upside Down + atmosphere and ends the
    //   Vecna fight, without touching the portal object or counters.
    //   Triggered by `releaseAlternateWorld` (PinballPlayfield).
    // resetWorld: WORLD/PORTAL/FIGHTS teardown on restart from game_over.
    //   Does NOT touch counters or nest (that is onGameReset's job).
    // onGameReset: LOGICAL game reset — counters, rescue, nest hints,
    //   mapState. Does NOT touch world/portal/atmosphere (resetWorld's job).
    // resetWorld and onGameReset are both called on game_over restart
    // (via distinct PinballPlayfield paths) and cover disjoint targets:
    // no duplicated effect between them.
    releaseWorld(): void {
      portal?.setUpsideDownActive(false)
      atmosphere?.reset()
      vecnaReveal?.endFight()
    },
    resetWorld(): void {
      bossDefeatTimers.clearAll()
      portal?.reset()
      atmosphere?.reset()
      bossReveals?.endAllFights()
    },
    onGameReset(): void {
      bossDefeatTimers.clearAll()
      scoop.reset()
      demogorgons = 0
      portals = 0
      hetic = 0
      lastLifeRescue.reset()
      for (const k of Object.keys(armedAt)) delete armedAt[k]
      hintFired.clear()
      nestMarker?.reset()
      ctxRef?.setMapState({ demogorgons: 0, portals: 0, hetic: 0 })
    },
    dispose(): void {
      bossDefeatTimers.clearAll()
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
