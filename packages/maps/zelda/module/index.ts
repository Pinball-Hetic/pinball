import type { MapModule, MapContext, GameEvent } from '@pinball/game-engine'
import {
  dueLateHints,
  advanceHetic,
  selectMilestoneClip,
  handleBossLockedHit,
  handleBossArmed,
  isGameOverDrain,
  isBossTargetDefeated,
  createBossDefeatTimers,
} from '@pinball/game-engine'
import {
  GanondorfReveal,
  DarkLinkReveal,
  BossRevealOrchestrator,
  SacredRealmAtmosphere,
  ZeldaPortal,
  ZeldaTransition,
  BumperVisuals,
} from '../systems'

// Zelda behavior module. Handles counters, milestones, boss events and the
// Ganondorf + Dark Link visual systems.
export function createModule(): MapModule {
  let ctxRef: MapContext | null = null

  // Zelda counters (feed mapState + GameStats.counters).
  let ganondorfs = 0
  let darklinks  = 0
  let portals    = 0
  let hetic      = 0

  // Nest: armed-since timestamp (ms) + late hint already fired, per boss.
  const armedAt: Record<string, number> = {}
  const hintFired = new Set<string>()

  // Timescale-restore timers after a boss defeat (~400 ms). Tracked per
  // bossId to avoid leaks (cancelled on reset/dispose, never stacked).
  // See createBossDefeatTimers (game-engine).
  const bossDefeatTimers = createBossDefeatTimers()

  let ganondorfReveal: GanondorfReveal | null = null
  let darkLinkReveal:  DarkLinkReveal  | null = null
  let bossReveals:     BossRevealOrchestrator | null = null
  let sacredRealm:     SacredRealmAtmosphere  | null = null
  let portal:          ZeldaPortal     | null = null
  let transition:      ZeldaTransition | null = null
  let bumperVisuals:   BumperVisuals   | null = null

  // ── onGameEvent handlers (closures over Zelda state/systems) ─────────────
  function onMilestone(ctx: MapContext, e: GameEvent): void {
    if (e.type !== 'MILESTONE') return
    ctx.playCinematic(selectMilestoneClip(e.threshold), { value: e.threshold })
    ctx.screenShake(0.4)
  }

  function onPortalTransitionEnd(ctx: MapContext, e: GameEvent): void {
    if (e.type !== 'PORTAL_TRANSITION_END') return
    // Sacred Realm entry confirmed (transition end). Same pattern as ST:
    // reset() first, then enterAlternateWorld(). The RETURN sensor is only
    // created once Dark Link is defeated.
    portal?.reset()
    ctx.resetPortalTrigger()
    ctx.enterAlternateWorld()
  }

  function onGameOverDrain(ctx: MapContext, e: GameEvent): void {
    // Game over: end all boss fights.
    if (isGameOverDrain(e, ctx.gameState())) bossReveals?.endAllFights()
  }

  function onBossArmed(ctx: MapContext, e: GameEvent): void {
    if (e.type !== 'BOSS_ARMED') return
    // Nest wakes up: DMD banner + hint timestamp (shared) + shake.
    handleBossArmed(ctx, e, armedAt, performance.now())
    ctx.screenShake(0.3)
  }

  function onGanondorf(ctx: MapContext, e: GameEvent): void {
    // Ganondorf boss cinematics.
    if (e.type === 'BOSS_REVEAL' && e.bossId === 'ganondorf') {
      // One-shot fanfare (~5s) via manifest.sounds → ambient resumes after.
      ctx.playSound('ganondorf_appear')
      ctx.playCinematic('ganondorf_rises', { once: true })
    }
    if (e.type === 'BOSS_TARGET_HIT' && e.bossId === 'ganondorf') {
      const boss = ctx.layout.bosses.find((b) => b.id === 'ganondorf')
      if (boss && isBossTargetDefeated(boss.targetHits, e.hitCount)) {
        ganondorfs += 1
        ctx.setMapState({ ganondorfs })
        ctx.physics.setTimeScale(1 / 3)
        bossDefeatTimers.schedule('ganondorf', 400, () => {
          ctx.physics.setTimeScale(1)
          // The blue Sacred Realm portal opens as soon as time resumes.
          portal?.open()
          ctx.playCinematic('ganondorf_slain', {
            onEnd: () =>
              ctx.ball?.applyEjectionForce({ x: boss.target.x, z: boss.target.z }),
          })
        })
      }
    }
  }

  function onDarkLink(ctx: MapContext, e: GameEvent): void {
    // Dark Link boss cinematics.
    if (e.type === 'BOSS_REVEAL' && e.bossId === 'darklink') {
      ctx.playCinematic('darklink_rises', { once: true })
    }
    if (e.type === 'BOSS_TARGET_HIT' && e.bossId === 'darklink') {
      const boss = ctx.layout.bosses.find((b) => b.id === 'darklink')
      if (boss && isBossTargetDefeated(boss.targetHits, e.hitCount)) {
        darklinks += 1
        ctx.setMapState({ darklinks })
        ctx.physics.setTimeScale(1 / 3)
        bossDefeatTimers.schedule('darklink', 400, () => {
          ctx.physics.setTimeScale(1)
          ctx.playCinematic('darklink_slain', {
            onEnd: () =>
              ctx.ball?.applyEjectionForce({ x: boss.target.x, z: boss.target.z }),
          })
        })
      }
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
    // The portal disappears on entry — cannot be re-taken endlessly.
    portal?.hide()
    const ball = ctx.ball
    const mesh = ctx.ballMesh
    if (ball && mesh && transition && !transition.isActive()) {
      // Sacred Realm sound (same pattern as ST "upside_down_appear").
      ctx.playSound('sacred_realm_appear')
      // Teleport + freeze the ball before the flash.
      ball.holdAtAlternateWorldSpawn()
      ball.syncToMesh(mesh)
      transition.start({ ballMesh: mesh }, () => {
        // Called from update() — outside Rapier's event drain, mutations are safe.
        ball.spawnFromAlternateWorld()
        ctx.resetPortalTrigger()
        ctx.resetStuck()
        ball.syncToMesh(mesh)
        mesh.visible = true
        mesh.scale.setScalar(1)
        ctx.emitGameEvent({ type: 'PORTAL_TRANSITION_END' })
      })
    }
  }

  function onReturnPortalEnter(ctx: MapContext, e: GameEvent): void {
    if (e.type !== 'RETURN_PORTAL_ENTER') return
    const ball = ctx.ball
    const mesh = ctx.ballMesh
    if (ball && mesh && transition && !transition.isActive()) {
      ball.holdAtNormalReturnSpawn()
      ball.syncToMesh(mesh)
      transition.start({ ballMesh: mesh }, () => {
        // ST pattern: reset() BEFORE completeWorldCycle() (which resets portalTriggered).
        portal?.reset()
        bossReveals?.endAllFights()
        ball.spawnFromNormalReturn()
        ctx.completeWorldCycle()
        ctx.resetStuck()
        ball.syncToMesh(mesh)
        mesh.visible = true
        mesh.scale.setScalar(1)
        ctx.emitGameEvent({ type: 'WORLD_CYCLE_COMPLETE' })
        ctx.emitGameEvent({ type: 'RETURN_PORTAL_TRANSITION_END' })
      })
    }
  }

  return {
    setup(ctx: MapContext): void {
      ctxRef = ctx

      // ── Ganondorf ────────────────────────────────────────────────────────
      ganondorfReveal = new GanondorfReveal()
      ganondorfReveal.setup({
        root:   ctx.root,
        scene:  ctx.scene,
        camera: ctx.camera,
        onFightEnd:    () => ctx.setBossFightActive('ganondorf', false),
        onTargetReady: () => ctx.setBossTargetArmed('ganondorf', true),
      })
      ganondorfReveal.setEmit(ctx.emitGameEvent)

      // ── Dark Link ────────────────────────────────────────────────────────
      darkLinkReveal = new DarkLinkReveal()
      darkLinkReveal.setup({
        root:   ctx.root,
        scene:  ctx.scene,
        camera: ctx.camera,
        onFightEnd: () => {
          ctx.setBossFightActive('darklink', false)
          // Defeating Dark Link opens the return portal.
          portal?.enableReturn()
        },
        onTargetReady: () => ctx.setBossTargetArmed('darklink', true),
      })

      // ── Orchestrator ─────────────────────────────────────────────────────
      bossReveals = new BossRevealOrchestrator()
      bossReveals.register(ganondorfReveal)
      bossReveals.register(darkLinkReveal)

      // ── Sacred Realm atmosphere ──────────────────────────────────────────
      sacredRealm = new SacredRealmAtmosphere()
      sacredRealm.setup({
        root: ctx.root,
        lighting: {
          scene:    ctx.scene,
          renderer: ctx.lighting.renderer,
          ambient:  ctx.lighting.ambient,
          hemi:     ctx.lighting.hemi,
          dir:      ctx.lighting.dir,
          fill:     ctx.lighting.fill,
        },
      })

      // ── Sacred Realm portal: blue visual + sensor (closed until Ganondorf) ─
      portal = new ZeldaPortal()
      portal.setup({
        root:        ctx.root,
        world:       ctx.physics.world,
        colliderMap: ctx.colliderMap,
        layout:      ctx.layout,
        onOpenChange: (open) => ctx.setPortalGateOpen(open),
      })

      // ── Transition (purple flash → tremor → callback) ────────────────────
      transition = new ZeldaTransition()
      transition.setup({ root: ctx.root, camera: ctx.camera })

      // ── VIS bumper punch animation ───────────────────────────────────────
      bumperVisuals = new BumperVisuals()
      bumperVisuals.setup(ctx.root)
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
      bumperVisuals?.onGameEvent(e)

      const ctx = ctxRef
      if (!ctx) return

      // Ordered dispatch — order is load-bearing.
      handleBossLockedHit(ctx, e)
      onMilestone(ctx, e)
      onPortalTransitionEnd(ctx, e)
      onGameOverDrain(ctx, e)
      onBossArmed(ctx, e)
      onGanondorf(ctx, e)
      onDarkLink(ctx, e)
      onDropTargetComplete(ctx, e)
      onPortalEnter(ctx, e)
      onReturnPortalEnter(ctx, e)
    },

    update(dt: number): void {
      bossReveals?.update(dt)
      sacredRealm?.update(dt)
      transition?.update(dt)
      portal?.update(dt)
      bumperVisuals?.update(dt)

      const ctx = ctxRef
      if (!ctx) return

      // Nest late hint.
      const candidates = ctx.layout.bosses.map((boss) => boss.id)
      for (const id of dueLateHints(candidates, armedAt, hintFired, performance.now())) {
        hintFired.add(id)
        const hint = ctx.layout.bosses.find((b) => b.id === id)?.hud.nestHintLabel
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
      // No magnetism on the Zelda map.
    },

    setSporesEnabled(): void {
      // No spores on the Zelda map (reserved for the ST Upside Down).
    },

    releaseWorld(): void {
      sacredRealm?.reset()
    },

    resetWorld(): void {
      bossDefeatTimers.clearAll()
      sacredRealm?.reset()
    },

    onGameReset(): void {
      bossDefeatTimers.clearAll()
      ganondorfs = 0
      darklinks  = 0
      portals    = 0
      hetic      = 0
      for (const k of Object.keys(armedAt)) delete armedAt[k]
      hintFired.clear()
      ctxRef?.setMapState({ ganondorfs: 0, darklinks: 0, portals: 0, hetic: 0 })
      bossReveals?.endAllFights()
      sacredRealm?.reset()
      portal?.reset()
    },

    dispose(): void {
      bossDefeatTimers.clearAll()
      bossReveals?.dispose()
      bossReveals  = null
      ganondorfReveal = null
      darkLinkReveal  = null
      sacredRealm?.dispose()
      sacredRealm  = null
      portal?.dispose()
      portal       = null
      transition?.dispose()
      transition   = null
      bumperVisuals?.dispose()
      bumperVisuals = null
      ctxRef       = null
    },
  }
}
