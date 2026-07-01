import type { MapModule, MapContext, GameEvent } from '@pinball/game-engine'
import {
  dueLateHints,
  advanceHetic,
  selectMilestoneClip,
  handleBossLockedHit,
  handleBossArmed,
  isGameOverDrain,
  isBossTargetDefeated,
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

// Unité : force par (distance²) — même ordre de grandeur que ST.

// Module de comportement Zelda. Gère les compteurs, les milestones,
// les événements boss et le système visuel Ganondorf + Dark Link.
export function createModule(): MapModule {
  let ctxRef: MapContext | null = null

  // Compteurs Zelda (alimentent mapState + GameStats.counters).
  let ganondorfs = 0
  let darklinks  = 0
  let portals    = 0
  let hetic      = 0

  // Nid : armé depuis (ms) + hint tardif déjà émis, par boss.
  const armedAt: Record<string, number> = {}
  const hintFired = new Set<string>()

  let ganondorfReveal: GanondorfReveal | null = null
  let darkLinkReveal:  DarkLinkReveal  | null = null
  let bossReveals:     BossRevealOrchestrator | null = null
  let sacredRealm:     SacredRealmAtmosphere  | null = null
  let portal:          ZeldaPortal     | null = null
  let transition:      ZeldaTransition | null = null
  let bumperVisuals:   BumperVisuals   | null = null

  // ── Handlers onGameEvent (closures sur l'état/systèmes Zelda) ─────────────
  // Chacun garde le contrat de l'ancien if-block : test de type + effet.
  function onMilestone(ctx: MapContext, e: GameEvent): void {
    if (e.type !== 'MILESTONE') return
    // Palier de score.
    ctx.playCinematic(selectMilestoneClip(e.threshold), { value: e.threshold })
    ctx.screenShake(0.4)
  }

  function onPortalTransitionEnd(ctx: MapContext, e: GameEvent): void {
    if (e.type !== 'PORTAL_TRANSITION_END') return
    // Entrée Sacred Realm confirmée (fin de transition). Pattern identique à
    // ST : reset() d'abord, puis enterAlternateWorld(). Le sensor RETOUR est
    // créé seulement quand Dark Link est vaincu.
    portal?.reset()
    ctx.resetPortalTrigger()
    ctx.enterAlternateWorld()
  }

  function onGameOverDrain(ctx: MapContext, e: GameEvent): void {
    // Game over : fin de tous les combats.
    if (isGameOverDrain(e, ctx.gameState())) bossReveals?.endAllFights()
  }

  function onBossArmed(ctx: MapContext, e: GameEvent): void {
    if (e.type !== 'BOSS_ARMED') return
    // Le nid s'éveille : bandeau DMD + horodatage hint (partagé) + shake.
    handleBossArmed(ctx, e, armedAt, performance.now())
    ctx.screenShake(0.3)
  }

  function onGanondorf(ctx: MapContext, e: GameEvent): void {
    // Cinématiques boss Ganondorf.
    if (e.type === 'BOSS_REVEAL' && e.bossId === 'ganondorf') {
      // Fanfare one-shot (~5s) via manifest.sounds → ambient reprend après.
      ctx.playSound('ganondorf_appear')
      ctx.playCinematic('ganondorf_rises', { once: true })
    }
    if (e.type === 'BOSS_TARGET_HIT' && e.bossId === 'ganondorf') {
      const boss = ctx.layout.bosses.find((b) => b.id === 'ganondorf')
      if (boss && isBossTargetDefeated(boss.targetHits, e.hitCount)) {
        ganondorfs += 1
        ctx.setMapState({ ganondorfs })
        ctx.physics.setTimeScale(1 / 3)
        window.setTimeout(() => {
          ctx.physics.setTimeScale(1)
          // Le portail bleu Sacred Realm s'ouvre dès que le temps reprend.
          portal?.open()
          ctx.playCinematic('ganondorf_slain', {
            onEnd: () =>
              ctx.ball?.applyEjectionForce({ x: boss.target.x, z: boss.target.z }),
          })
        }, 400)
      }
    }
  }

  function onDarkLink(ctx: MapContext, e: GameEvent): void {
    // Cinématiques boss Dark Link.
    if (e.type === 'BOSS_REVEAL' && e.bossId === 'darklink') {
      ctx.playCinematic('darklink_rises', { once: true })
    }
    if (e.type === 'BOSS_TARGET_HIT' && e.bossId === 'darklink') {
      const boss = ctx.layout.bosses.find((b) => b.id === 'darklink')
      if (boss && isBossTargetDefeated(boss.targetHits, e.hitCount)) {
        darklinks += 1
        ctx.setMapState({ darklinks })
        ctx.physics.setTimeScale(1 / 3)
        window.setTimeout(() => {
          ctx.physics.setTimeScale(1)
          ctx.playCinematic('darklink_slain', {
            onEnd: () =>
              ctx.ball?.applyEjectionForce({ x: boss.target.x, z: boss.target.z }),
          })
        }, 400)
      }
    }
  }

  function onDropTargetComplete(ctx: MapContext, e: GameEvent): void {
    // Compteur HETIC.
    if (e.type !== 'DROP_TARGET_COMPLETE') return
    hetic = advanceHetic(ctx, hetic)
  }

  function onPortalEnter(ctx: MapContext, e: GameEvent): void {
    if (e.type !== 'PORTAL_ENTER') return
    // Entrée Sacred Realm.
    portals += 1
    ctx.setMapState({ portals })
    // Le portail disparaît à l'entrée — ne peut pas être repris à l'infini.
    portal?.hide()
    const ball = ctx.ball
    const mesh = ctx.ballMesh
    if (ball && mesh && transition && !transition.isActive()) {
      // Son Sacred Realm (même pattern que ST "upside_down_appear").
      ctx.playSound('sacred_realm_appear')
      // Téléporte + fige la balle avant le flash.
      ball.holdAtAlternateWorldSpawn()
      ball.syncToMesh(mesh)
      transition.start({ ballMesh: mesh }, () => {
        // Appelé depuis update() — hors drain Rapier, mutations sûres.
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
    // Retour monde normal.
    const ball = ctx.ball
    const mesh = ctx.ballMesh
    if (ball && mesh && transition && !transition.isActive()) {
      ball.holdAtNormalReturnSpawn()
      ball.syncToMesh(mesh)
      transition.start({ ballMesh: mesh }, () => {
        // Pattern ST : reset() AVANT completeWorldCycle() (qui reset portalTriggered).
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
          // La victoire sur Dark Link ouvre le portail retour.
          portal?.enableReturn()
        },
        onTargetReady: () => ctx.setBossTargetArmed('darklink', true),
      })

      // ── Orchestrateur ────────────────────────────────────────────────────
      bossReveals = new BossRevealOrchestrator()
      bossReveals.register(ganondorfReveal)
      bossReveals.register(darkLinkReveal)

      // ── Atmosphère Sacred Realm ──────────────────────────────────────────
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

      // ── Portail Sacred Realm : visuel bleu + sensor (fermé jusqu'à Ganondorf) ─
      portal = new ZeldaPortal()
      portal.setup({
        root:        ctx.root,
        world:       ctx.physics.world,
        colliderMap: ctx.colliderMap,
        layout:      ctx.layout,
        onOpenChange: (open) => ctx.setPortalGateOpen(open),
      })

      // ── Transition (flash violet → tremor → callback) ────────────────────
      transition = new ZeldaTransition()
      transition.setup({ root: ctx.root, camera: ctx.camera })

      // ── Animation punch des VIS bumpers ──────────────────────────────────
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

      // Dispatch ordonné (même ordre, mêmes effets que l'ancien cascade).
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

      // Hint tardif du nid.
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
      // Pas de magnétisme sur la map Zelda.
    },

    setSporesEnabled(): void {
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
