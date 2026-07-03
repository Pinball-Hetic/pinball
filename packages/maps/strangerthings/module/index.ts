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
  // Liste des ids de boss (statique après setup) — hoistée pour éviter une
  // allocation de tableau à chaque tick d'update (hint tardif du nid).
  let bossIds: readonly string[] = []
  // Timers de restauration du timescale après défaite d'un boss (~200 ms).
  // Suivis par bossId pour éviter les fuites (annulés au reset/dispose, jamais
  // empilés). Cf. createBossDefeatTimers (game-engine).
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
  // Trou scoop (saucer) : state machine capture → hold → kick.
  const scoop = createScoopCapture()

  // ── Handlers onGameEvent (closures sur l'état/systèmes ST) ────────────────
  // Chacun garde le contrat de l'ancien if-block : test de type + effet.
  function onMilestone(ctx: MapContext, e: GameEvent): void {
    if (e.type !== 'MILESTONE') return
    // Palier de score : cinématique rocket + décollage garlands (balayage
    // montant orange, cohérent avec la fusée DMD/backglass) + shake. Remplace
    // l'ancien chenillard jaune « celebrate » (unité rocket cross-écrans).
    playMilestoneCinematic(ctx, e.threshold, () => garlands?.rocketBurst())
  }

  function onScoop(_ctx: MapContext, e: GameEvent): void {
    if (e.type !== 'SCOOP_ENTER') return
    // Contact capteur = ARME seulement. La capture (et les récompenses) n'a
    // lieu que si la bille SE POSE dans la zone (dwell, cf. scoopCapture.ts) —
    // une bille qui traverse le couloir ressort sans aucun effet.
    scoop.arm()
  }

  // Récompenses + juice à l'instant de la capture (phase 'capture', une frame).
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
    // Entrée Upside Down confirmée : portail actif + baseline core + nid UD.
    portal?.reset()
    portal?.setUpsideDownActive(true)
    ctx.resetPortalTrigger()
    ctx.enterAlternateWorld()
    nestMarker?.setUpsideDown(true)
  }

  function onGameOverDrain(ctx: MapContext, e: GameEvent): void {
    // Game over en drainant : fin de tous les combats boss.
    if (isGameOverDrain(e, ctx.gameState())) bossReveals?.endAllFights()
  }

  function onBossArmed(ctx: MapContext, e: GameEvent): void {
    if (e.type !== 'BOSS_ARMED') return
    // Le nid s'éveille : bandeau DMD + horodatage hint (partagé) + celebrate + shake.
    handleBossArmed(ctx, e, armedAt, performance.now())
    garlands?.celebrate()
    ctx.screenShake(0.3)
  }

  function onDemogorgon(ctx: MapContext, e: GameEvent): void {
    // Cinématiques boss Demogorgon (reveal + victoire).
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
    // Compteur ST demogorgons → mapState.
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
    // Reconciliation des marqueurs de nid après chaque event : déclenché →
    // revealed ; sinon palier atteint → armed ; sinon locked. Idempotent.
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
        // Gate assist Eleven : hors 'playing' (drain, attente relance) le
        // sous-timer est suspendu — sinon +100 pts en boucle sans jouer.
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

      // Dispatch ordonné (même ordre, mêmes effets que l'ancien cascade).
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
      transition?.update(dt) // no-op si inactif (gardé en interne)

      // Hint tardif du nid : armé > 45 s sans reveal → bandeau DMD une fois.
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

      // Scoop : dwell (bille posée dans la zone ?) → capture → hold → kick.
      // NOTE: passe par ctx.ball.body (RigidBody brut) — cf. backlog P2
      // "IMapBallPhysics.body expose le body brut" (à remplacer par holdAt/kick).
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
          // Physique gelée pendant le hold (shouldFreezePhysics) → il suffit
          // de centrer la bille dans le trou, au repos. resetStuck en défensif.
          ctx.ball.body.setTranslation({ x: scoopPos.x, y: scoopPos.y, z: scoopPos.z }, true)
          ctx.ball.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
          ctx.ball.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
          ctx.resetStuck()
        } else if (phase === 'eject') {
          // Téléport-eject : replace la bille au point de sortie (absolu, posée
          // sur la surface) avec une vitesse de sortie directe (cf. ScoopConfig).
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
        // Hold scoop : gel → bille immobile au trou (pas de gravité ni de
        // surface-snap/stuck-detector qui lutteraient), jusqu'au kick.
        // (PAS pendant 'armed' : la bille doit pouvoir rouler/se poser.)
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
    // ── Contrat des trois hooks de reset (responsabilités disjointes) ─────────
    // releaseWorld : sortie « douce » du monde alternatif EN COURS de partie
    //   (retour normal via portail). Désactive l'Upside Down + atmosphère et
    //   coupe le combat Vecna, sans toucher au portail-objet ni aux compteurs.
    //   Déclenché par `releaseAlternateWorld` (PinballPlayfield).
    // resetWorld : teardown MONDE/PORTAIL/COMBATS sur relance depuis game_over.
    //   Ne touche PAS aux compteurs ni au nid (c'est le rôle d'onGameReset).
    // onGameReset : reset LOGIQUE de partie — compteurs, rescue, hints de nid,
    //   mapState. Ne touche PAS au monde/portail/atmosphère (rôle de resetWorld).
    // resetWorld et onGameReset sont tous deux appelés sur la relance game_over
    // (par des chemins distincts de PinballPlayfield) et couvrent des cibles
    // disjointes : aucune duplication d'effet entre eux.
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
