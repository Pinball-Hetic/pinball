import * as THREE from 'three';
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

/** Port décor optionnel (DIP) : pilote des lumières/visuels au rythme du strobe. */
export interface DecorLights {
  setStrobe(active: boolean, on: boolean, normalWhenOn?: boolean): void;
}

export class PlayfieldCinematicStrobe {
  private shade = new PlayfieldShadeOverlay();
  private flashLight: THREE.PointLight | null = null;
  private flashRoot: THREE.Object3D | null = null;
  private decor: DecorLights[] = [];
  private flashIntensity = 2.4;

  // La PointLight n'est DANS la scène que quand elle flashe (perf).
  private setFlash(intensity: number): void {
    if (!this.flashLight) return;
    this.flashLight.intensity = intensity;
    if (intensity > 0) {
      if (this.flashRoot && !this.flashLight.parent) this.flashRoot.add(this.flashLight);
    } else if (this.flashLight.parent) {
      this.flashLight.removeFromParent();
    }
  }

  mount(
    root: THREE.Object3D,
    config: PlayfieldCinematicStrobeConfig,
    decor: DecorLights[] = [],
  ): void {
    this.dispose();
    this.decor = decor;
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
    this.flashRoot = root; // ajout/retrait à la demande
  }

  apply(on: boolean, fullMap: boolean, mix: number): void {
    this.shade.setOpacity(playfieldShadeStrobeOpacity(on, fullMap, mix));

    const active = mix > 0.02;
    this.setFlash(on && !fullMap ? this.flashIntensity * mix : 0);

    for (const d of this.decor) d.setStrobe(active, on, fullMap);
  }

  /** Flash sans shade overlay — pour les maps qui ne veulent pas de voile noir. */
  applyFlashOnly(on: boolean, mix: number): void {
    this.shade.setOpacity(0);
    this.setFlash(on ? this.flashIntensity * mix : 0);
  }

  setShadeOpacity(opacity: number): void {
    this.shade.setOpacity(opacity);
  }

  applyHoldShade(opacity: number): void {
    this.setShadeOpacity(opacity);
    this.clearFlashAndDecor();
  }

  applyFightFlicker(shade: number, flashMix: number): void {
    this.shade.setOpacity(shade);
    this.setFlash(this.flashIntensity * flashMix);
    for (const d of this.decor) d.setStrobe(false, false);
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
    this.flashRoot = null;
    this.decor = [];
    this.shade = new PlayfieldShadeOverlay();
  }

  private clearFlashAndDecor(): void {
    this.setFlash(0);
    for (const d of this.decor) d.setStrobe(false, false);
  }
}
