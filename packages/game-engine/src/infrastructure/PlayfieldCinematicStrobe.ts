import * as THREE from 'three';
import type { BumperVisuals } from './BumperVisuals';
import type { GarlandLights } from './GarlandLights';
import { PlayfieldShadeOverlay, playfieldShadeStrobeOpacity } from './PlayfieldShadeOverlay';

export type PlayfieldCinematicStrobeConfig = {
  shadeColor?: number;
  shadeRenderOrder?: number;
  flashColor: number;
  flashIntensity: number;
  flashPosition: THREE.Vector3;
  flashDistance?: number;
  flashDecay?: number;
};

export class PlayfieldCinematicStrobe {
  private shade = new PlayfieldShadeOverlay();
  private flashLight: THREE.PointLight | null = null;
  private garlandLights: GarlandLights | null = null;
  private bumperVisuals: BumperVisuals | null = null;
  private flashIntensity = 2.4;

  mount(
    root: THREE.Object3D,
    garlandLights: GarlandLights | null,
    bumperVisuals: BumperVisuals | null,
    config: PlayfieldCinematicStrobeConfig,
  ): void {
    this.dispose();
    this.garlandLights = garlandLights;
    this.bumperVisuals = bumperVisuals;
    this.flashIntensity = config.flashIntensity;

    this.shade.mount(root, {
      color: config.shadeColor ?? 0x000000,
      renderOrder: config.shadeRenderOrder ?? 600,
    });

    this.flashLight = new THREE.PointLight(
      config.flashColor,
      0,
      config.flashDistance ?? 0.55,
      config.flashDecay ?? 2,
    );
    this.flashLight.position.copy(config.flashPosition);
    root.add(this.flashLight);
  }

  apply(on: boolean, fullMap: boolean, mix: number): void {
    this.shade.setOpacity(playfieldShadeStrobeOpacity(on, fullMap, mix));

    const active = mix > 0.02;
    if (this.flashLight) {
      this.flashLight.intensity = on && !fullMap ? this.flashIntensity * mix : 0;
    }

    this.garlandLights?.setStrobe(active, on, fullMap);
    this.bumperVisuals?.setStrobe(active, on, fullMap);
  }

  setShadeOpacity(opacity: number): void {
    this.shade.setOpacity(opacity);
  }

  applyHoldShade(opacity: number): void {
    this.setShadeOpacity(opacity);
    this.clearFlashAndDecor();
  }

  stop(): void {
    this.shade.hide();
    this.clearFlashAndDecor();
  }

  dispose(): void {
    this.shade.dispose();
    if (this.flashLight) {
      this.flashLight.dispose();
      this.flashLight.parent?.remove(this.flashLight);
    }
    this.flashLight = null;
    this.garlandLights = null;
    this.bumperVisuals = null;
    this.shade = new PlayfieldShadeOverlay();
  }

  private clearFlashAndDecor(): void {
    if (this.flashLight) this.flashLight.intensity = 0;
    this.garlandLights?.setStrobe(false, false);
    this.bumperVisuals?.setStrobe(false, false);
  }
}
