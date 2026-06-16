import RAPIER from '@dimforge/rapier3d-compat';
import type { MapLayout } from '@pinball/game-engine';

/** Rayon du sensor de déclenchement du portail (Sacred Realm). */
const PORTAL_SENSOR_RADIUS = 0.042;

type SetupConfig = {
  world: RAPIER.World;
  colliderMap: Map<number, string>;
  layout: MapLayout;
  /** Appelé avec `true` à la création (portail toujours ouvert en Zelda). */
  onOpenChange: (open: boolean) => void;
};

/**
 * Portail Sacred Realm (Zelda).
 *
 * Crée un sensor sphérique au centre de la map (`layout.sensors.portal`),
 * l'enregistre dans `colliderMap` sous le rôle `portal_enter`, et notifie
 * immédiatement `onOpenChange(true)` (le portail Zelda est toujours ouvert —
 * pas de condition de score comme dans ST).
 *
 * Le `CollisionEventProcessor` gère le reste :
 * - monde normal  → émet `PORTAL_ENTER`
 * - monde alternatif → émet `RETURN_PORTAL_ENTER`
 */
export class ZeldaPortal {
  private world: RAPIER.World | null = null;
  private sensorBody: RAPIER.RigidBody | null = null;
  private sensorCollider: RAPIER.Collider | null = null;
  private colliderMap: Map<number, string> | null = null;

  setup(config: SetupConfig): void {
    this.dispose();

    this.world = config.world;
    this.colliderMap = config.colliderMap;

    const pos = config.layout.sensors.portal;
    this.sensorBody = config.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(pos.x, pos.y, pos.z),
    );
    this.sensorCollider = config.world.createCollider(
      RAPIER.ColliderDesc.ball(PORTAL_SENSOR_RADIUS)
        .setSensor(true)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      this.sensorBody,
    );
    config.colliderMap.set(this.sensorCollider.handle, 'portal_enter');

    // Le portail Zelda est toujours ouvert — pas de phase d'ouverture animée.
    config.onOpenChange(true);
  }

  dispose(): void {
    if (this.sensorCollider) {
      this.colliderMap?.delete(this.sensorCollider.handle);
      this.world?.removeCollider(this.sensorCollider, true);
      this.sensorCollider = null;
    }
    if (this.sensorBody) {
      this.world?.removeRigidBody(this.sensorBody);
      this.sensorBody = null;
    }
    this.world = null;
    this.colliderMap = null;
  }
}
