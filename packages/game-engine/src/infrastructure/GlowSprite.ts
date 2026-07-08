import * as THREE from 'three';

let sharedTexture: THREE.Texture | null = null;

function glowTexture(): THREE.Texture {
  if (sharedTexture) return sharedTexture;
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 32;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.65)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  sharedTexture = new THREE.CanvasTexture(c);
  return sharedTexture;
}

export class GlowSprite {
  readonly sprite: THREE.Sprite;
  private mat: THREE.SpriteMaterial;
  private baseSize: number;

  constructor(color: number, size: number) {
    this.baseSize = size;
    this.mat = new THREE.SpriteMaterial({
      map: glowTexture(),
      color,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    this.sprite = new THREE.Sprite(this.mat);
    this.sprite.scale.setScalar(size);
  }

  setColor(hex: number): void {
    this.mat.color.setHex(hex);
  }

  set(intensity: number, scaleMul = 1): void {
    this.mat.opacity = Math.max(0, Math.min(1, intensity));
    this.sprite.scale.setScalar(this.baseSize * scaleMul);
  }

  dispose(): void {
    this.mat.dispose();
    this.sprite.removeFromParent();
  }
}
