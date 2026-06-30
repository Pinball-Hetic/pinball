import type * as THREE from 'three';
import {
  PlayfieldCinematicStrobe as BaseCinematicStrobe,
  type DecorLights,
  type PlayfieldCinematicStrobeConfig,
} from '@pinball/game-engine';
import type { BumperVisuals } from './BumperVisuals';
import type { GarlandLights } from './GarlandLights';

export type { PlayfieldCinematicStrobeConfig };

// Version Stranger Things : pilote GarlandLights + BumperVisuals via le port décor.
// Composition (et non héritage) pour garder la signature mount à 4 args.
export class PlayfieldCinematicStrobe {
  private base = new BaseCinematicStrobe();

  mount(
    root: THREE.Object3D,
    garlandLights: GarlandLights | null,
    bumperVisuals: BumperVisuals | null,
    config: PlayfieldCinematicStrobeConfig,
  ): void {
    const decor: DecorLights[] = [];
    if (garlandLights) decor.push(garlandLights);
    if (bumperVisuals) decor.push(bumperVisuals);
    this.base.mount(root, config, decor);
  }

  apply(on: boolean, fullMap: boolean, mix: number): void {
    this.base.apply(on, fullMap, mix);
  }

  setShadeOpacity(opacity: number): void {
    this.base.setShadeOpacity(opacity);
  }

  applyHoldShade(opacity: number): void {
    this.base.applyHoldShade(opacity);
  }

  applyFightFlicker(shade: number, flashMix: number): void {
    this.base.applyFightFlicker(shade, flashMix);
  }

  stop(): void {
    this.base.stop();
  }

  dispose(): void {
    this.base.dispose();
  }
}
