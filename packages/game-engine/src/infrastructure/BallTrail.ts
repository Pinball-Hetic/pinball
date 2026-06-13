import * as THREE from 'three';

// Traînée de feu de la bille — pool fixe de sprites (planes additifs), zéro
// alloc par frame, zéro lumière. Texture radiale générée par canvas.

const POOL = 24;
const PLANE = 0.008;
const LIFE = 0.3; // s
const EMIT_RATE = 80; // sprites/s à intensité 1
const DRIFT_Y = 0.02; // dérive verticale (unités/s)

const COLOR_FIRE = 0xff6a00;
const COLOR_ALTERNATE = 0xb14dff;
const COLOR_FEVER_A = 0xff8800;
const COLOR_FEVER_B = 0x00c8ff;

interface TrailSprite {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  life: number; // restant ; 0 = libre
}

function makeRadialTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 16;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.7)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 16, 16);
  return new THREE.CanvasTexture(c);
}

export class BallTrail {
  private group = new THREE.Group();
  private sprites: TrailSprite[] = [];
  private texture: THREE.CanvasTexture;
  private emitAccum = 0;
  private feverFlip = 0;
  private maxActive = POOL; // plafonné par le QualityGovernor

  constructor() {
    this.texture = makeRadialTexture();
    const geo = new THREE.PlaneGeometry(PLANE, PLANE);
    for (let i = 0; i < POOL; i++) {
      const mat = new THREE.MeshBasicMaterial({
        map: this.texture,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      mesh.renderOrder = 940;
      this.group.add(mesh);
      this.sprites.push({ mesh, mat, life: 0 });
    }
  }

  mount(scene: THREE.Scene): void {
    scene.add(this.group);
  }

  // Plafond du pool actif (QualityGovernor : 24 → 12 au cran le plus bas).
  setMaxSprites(n: number): void {
    this.maxActive = Math.max(0, Math.min(POOL, n));
  }

  private spawn(pos: { x: number; y: number; z: number }, color: number): void {
    let s: TrailSprite | undefined;
    for (let i = 0; i < this.maxActive; i++) {
      if (this.sprites[i].life <= 0) {
        s = this.sprites[i];
        break;
      }
    }
    if (!s) return;
    s.life = LIFE;
    s.mesh.visible = true;
    s.mesh.position.set(pos.x, pos.y, pos.z);
    s.mesh.scale.setScalar(1);
    s.mat.color.setHex(color);
    s.mat.opacity = 1;
  }

  /**
   * @param intensity 0..1 — densité d'émission (0 = trail off).
   * @param opts alternateWorld (teinte violette) / fever (teinte alternée).
   * @param camQuat orientation caméra pour billboarder les planes.
   */
  update(
    dt: number,
    ballPos: { x: number; y: number; z: number },
    intensity: number,
    opts: { alternateWorld: boolean; fever: boolean },
    camQuat: THREE.Quaternion,
  ): void {
    // Émission proportionnelle à l'intensité.
    if (intensity > 0) {
      this.emitAccum += intensity * EMIT_RATE * dt;
      while (this.emitAccum >= 1) {
        this.emitAccum -= 1;
        let color = opts.alternateWorld ? COLOR_ALTERNATE : COLOR_FIRE;
        if (opts.fever) {
          this.feverFlip ^= 1;
          color = this.feverFlip ? COLOR_FEVER_A : COLOR_FEVER_B;
        }
        this.spawn(ballPos, color);
      }
    }

    // Avance les sprites vivants (decay scale + alpha, dérive +Y).
    for (const s of this.sprites) {
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) {
        s.mesh.visible = false;
        s.mat.opacity = 0;
        continue;
      }
      const t = s.life / LIFE; // 1 → 0
      s.mat.opacity = t;
      s.mesh.scale.setScalar(0.4 + t * 1.1);
      s.mesh.position.y += DRIFT_Y * dt;
      s.mesh.quaternion.copy(camQuat);
    }
  }

  dispose(): void {
    for (const s of this.sprites) s.mat.dispose();
    this.sprites[0]?.mesh.geometry.dispose();
    this.texture.dispose();
    this.group.removeFromParent();
    this.sprites = [];
  }
}
