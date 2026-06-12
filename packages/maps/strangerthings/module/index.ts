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
