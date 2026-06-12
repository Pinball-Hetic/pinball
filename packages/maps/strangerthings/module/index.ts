import {
  GarlandLights,
  BumperVisuals,
  UpsideDownAtmosphere,
  UpsideDownPortal,
  UpsideDownTransition,
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
}

export function createModule(): StModule {
  let garlands: GarlandLights | null = null
  let bumperVisuals: BumperVisuals | null = null
  let atmosphere: UpsideDownAtmosphere | null = null
  let portal: UpsideDownPortal | null = null
  let transition: UpsideDownTransition | null = null
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
    },
    onGameEvent(e: GameEvent): void {
      bumperVisuals?.onGameEvent(e)
      garlands?.onGameEvent(e)
      atmosphere?.onGameEvent(e)
      portal?.onGameEvent(e)
    },
    update(dt: number): void {
      bumperVisuals?.update(dt)
      garlands?.update(dt)
      atmosphere?.update(dt)
      portal?.update(dt)
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
      bumperVisuals = null
      garlands = null
      atmosphere = null
      portal = null
      transition = null
    },
  }
}
