import * as THREE from 'three';
import * as RAPIER from '@dimforge/rapier3d-compat';
import { layout } from '../layout';
import {
  PORTAL_ENTER_TEXTURE_URL,
  RETURN_PORTAL_TEXTURE_URL,
  UPSIDE_DOWN_TRANSITION_BLACKOUT,
  UPSIDE_DOWN_TRANSITION_HOLD,
  UPSIDE_DOWN_TRANSITION_RESTORE,
  UPSIDE_DOWN_TRANSITION_REVEAL,
  UPSIDE_DOWN_TRANSITION_STROBE_HZ,
  UPSIDE_DOWN_TRANSITION_TREMOR,
} from './UpsideDownConstants';
import { easeOut, ShakeBasis, TransitionTimeline, tremorOffset } from '@pinball/game-engine';
import { CameraBillboardSprite } from '@pinball/game-engine';
import type { GarlandLights } from './GarlandLights';
import type { BumperVisuals } from './BumperVisuals';
import { PlayfieldCinematicStrobe, strangerthingsDecor } from './PlayfieldCinematicStrobe';

const DEFAULT_TEXTURE_URL = PORTAL_ENTER_TEXTURE_URL;
const BILLBOARD_DEPTH = 0.38;
const BILLBOARD_PAD = 1.12;

function fullScreenSpriteScale(camera: THREE.Camera, depth: number): THREE.Vector3 {
  const cam = camera as THREE.PerspectiveCamera;
  const vFov = (cam.fov * Math.PI) / 180;
  const height = 2 * depth * Math.tan(vFov / 2) * BILLBOARD_PAD;
  const width = height * cam.aspect * BILLBOARD_PAD;
  return new THREE.Vector3(width, height, 1);
}

type SetupConfig = {
  root: THREE.Object3D;
  scene: THREE.Scene;
  camera: THREE.Camera;
  garlandLights: GarlandLights | null;
  bumperVisuals: BumperVisuals | null;
};

type StartConfig = {
  ballMesh: THREE.Object3D;
  ballBody: RAPIER.RigidBody;
  /** Fullscreen texture (default: upsidedown.jpg). */
  textureUrl?: string;
  onRevealStart?: () => void;
  onTremorStart?: () => void;
};

type CompleteHandler = () => void;

export class UpsideDownTransition {
  private camera: THREE.Camera | null = null;
  private playfieldRoot: THREE.Object3D | null = null;

  private cinematicStrobe = new PlayfieldCinematicStrobe();
  private billboard = new CameraBillboardSprite();

  private timeline = new TransitionTimeline({
    blackout: UPSIDE_DOWN_TRANSITION_BLACKOUT,
    reveal: UPSIDE_DOWN_TRANSITION_REVEAL,
    hold: UPSIDE_DOWN_TRANSITION_HOLD,
    restore: UPSIDE_DOWN_TRANSITION_RESTORE,
    tremor: UPSIDE_DOWN_TRANSITION_TREMOR,
    strobeHz: UPSIDE_DOWN_TRANSITION_STROBE_HZ,
    hasReveal: true,
  });
  private active = false;
  private pendingTextureUrl: string | null = null;
  private ballMesh: THREE.Object3D | null = null;
  private ballBody: RAPIER.RigidBody | null = null;
  private onComplete: CompleteHandler | null = null;
  private onRevealStart: (() => void) | null = null;
  private onTremorStart: (() => void) | null = null;
  private tremorStarted = false;
  private shakeBasis = new ShakeBasis();

  setup(config: SetupConfig): void {
    this.dispose();
    this.camera = config.camera;
    this.playfieldRoot = config.root;

    this.cinematicStrobe.mount(
      config.root,
      {
        flashColor: 0x9933ff,
        flashIntensity: 2.4,
        flashPosition: new THREE.Vector3(
          layout.sensors.portal.x,
          layout.sensors.portal.y + 0.12,
          layout.sensors.portal.z,
        ),
      },
      strangerthingsDecor(config.garlandLights, config.bumperVisuals),
    );

    this.billboard.mount(config.scene, config.camera, {
      textureUrl: DEFAULT_TEXTURE_URL,
      center: new THREE.Vector2(0.5, 0.5),
      scale: fullScreenSpriteScale(config.camera, BILLBOARD_DEPTH),
      depth: BILLBOARD_DEPTH,
      yOffset: 0,
    });
    void this.billboard.preloadTexture(RETURN_PORTAL_TEXTURE_URL);
  }

  isActive(): boolean {
    return this.active;
  }

  start(config: StartConfig, onComplete: CompleteHandler): void {
    if (!this.camera) return;

    const textureUrl = config.textureUrl ?? DEFAULT_TEXTURE_URL;
    this.pendingTextureUrl = textureUrl;
    this.billboard.hide();

    void this.billboard.setTextureUrl(textureUrl).then(() => {
      if (this.pendingTextureUrl !== textureUrl) return;
      this.beginActiveTransition(config, onComplete);
    });
  }

  private beginActiveTransition(config: StartConfig, onComplete: CompleteHandler): void {
    if (!this.camera) return;
    if (this.billboard.getActiveTextureUrl() !== (config.textureUrl ?? DEFAULT_TEXTURE_URL)) return;

    this.active = true;
    this.timeline.reset();
    this.timeline.begin();
    this.ballMesh = config.ballMesh;
    this.ballBody = config.ballBody;
    this.onComplete = onComplete;
    this.onRevealStart = config.onRevealStart ?? null;
    this.onTremorStart = config.onTremorStart ?? null;
    this.tremorStarted = false;

    if (this.ballMesh) {
      this.ballMesh.visible = false;
      this.ballMesh.scale.setScalar(1);
    }
    if (this.ballBody) {
      this.ballBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
      this.ballBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
    this.billboard.show();
  }

  update(dt: number): void {
    if (!this.active || this.timeline.getPhase() === 'idle') return;

    this.billboard.sync();

    const textureReady =
      this.billboard.isReady() &&
      this.billboard.getActiveTextureUrl() === this.pendingTextureUrl;

    const d = this.timeline.tick(dt);

    if (d.phase === 'blackout') {
      this.cinematicStrobe.apply(d.on, false, d.blackoutMix);
      this.billboard.setOpacity(0);
      if (d.enteredReveal) this.onRevealStart?.();
      return;
    }

    if (d.phase === 'reveal') {
      this.cinematicStrobe.apply(d.on, false, 1);
      this.billboard.setOpacity(textureReady && d.on ? easeOut(d.revealT) * 0.95 : 0);
      if (d.enteredHold) {
        this.billboard.setOpacity(textureReady ? 0.95 : 0);
        this.cinematicStrobe.applyHoldShade(0.72);
      }
      return;
    }

    if (d.phase === 'hold') {
      this.billboard.setOpacity(textureReady ? 0.95 : 0);
      this.cinematicStrobe.setShadeOpacity(0.72);
      return;
    }

    if (d.phase === 'restore') {
      this.cinematicStrobe.apply(d.on, false, d.darkMix * 0.5);
      this.billboard.setOpacity(textureReady ? 0.95 * d.darkMix : 0);
      if (d.enteredTremor) {
        this.captureShakeBases();
        this.cinematicStrobe.stop();
        this.billboard.hide();
        if (!this.tremorStarted) {
          this.tremorStarted = true;
          this.onTremorStart?.();
        }
      }
      return;
    }

    if (d.phase === 'tremor') {
      this.applyTremor();
      if (d.finished) this.finish();
    }
  }

  dispose(): void {
    this.resetAtmosphere();

    this.cinematicStrobe.dispose();
    this.billboard.dispose();

    this.camera = null;
    this.playfieldRoot = null;
    this.cinematicStrobe = new PlayfieldCinematicStrobe();
    this.billboard = new CameraBillboardSprite();
    this.onComplete = null;
    this.onRevealStart = null;
    this.onTremorStart = null;
    this.tremorStarted = false;
    this.active = false;
    this.timeline.reset();
    this.pendingTextureUrl = null;
  }

  private resetAtmosphere(): void {
    this.restoreShakeBases();
    this.timeline.reset();
    this.active = false;
    this.tremorStarted = false;
    this.pendingTextureUrl = null;

    this.cinematicStrobe.stop();
    this.billboard.hide();
  }

  private captureShakeBases(): void {
    this.shakeBasis.capture(this.camera, this.playfieldRoot);
  }

  private restoreShakeBases(): void {
    this.shakeBasis.restore(this.camera, this.playfieldRoot);
  }

  private applyTremor(): void {
    const o = tremorOffset(this.timeline.getElapsed(), 0.45, 0.0032);

    if (this.camera) {
      this.camera.position.set(
        this.shakeBasis.camPos.x + o.camX,
        this.shakeBasis.camPos.y + o.camY,
        this.shakeBasis.camPos.z + o.camZ,
      );
    }

    if (this.playfieldRoot) {
      this.playfieldRoot.rotation.x = this.shakeBasis.rootRot.x + o.rootRotX;
      this.playfieldRoot.rotation.z = this.shakeBasis.rootRot.z + o.rootRotZ;
    }
  }

  private finish(): void {
    if (!this.active) return;

    this.restoreShakeBases();

    if (this.ballMesh) {
      this.ballMesh.scale.setScalar(1);
      this.ballMesh.visible = true;
    }
    if (this.ballBody) {
      this.ballBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
      this.ballBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }

    this.resetAtmosphere();

    this.ballMesh = null;
    this.ballBody = null;
    const done = this.onComplete;
    this.onComplete = null;
    done?.();
  }
}
