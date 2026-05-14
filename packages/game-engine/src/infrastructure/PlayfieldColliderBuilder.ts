import RAPIER from "@dimforge/rapier3d-compat";
import {
  BALL_RESTITUTION,
  BALL_FRICTION,
  BUMPER_POSITIONS,
  BUMPER_RADIUS,
  BUMPER_RESTITUTION,
  SLINGSHOT_LEFT_CENTER,
  SLINGSHOT_RIGHT_CENTER,
  SLINGSHOT_RESTITUTION,
  PLAYFIELD_SURFACE_Y,
  WALL_LEFT_X,
  WALL_RIGHT_X,
  WALL_TOP_Z,
  WALL_BOTTOM_Z,
  WALL_HEIGHT,
  WALL_THICKNESS,
  DRAIN_SWITCH_CENTER,
} from "../domain/Ball";

export class PlayfieldColliderBuilder {
  static build(
    world: RAPIER.World,
    bounds?: {
      leftX: number;
      rightX: number;
      topZ: number;
      bottomZ: number;
      surfaceY: number;
      laneSepX: number;
    },
  ): Map<number, string> {
    const roles = new Map<number, string>();

    const leftX = bounds?.leftX ?? WALL_LEFT_X;
    const rightX = bounds?.rightX ?? WALL_RIGHT_X;
    const topZ = bounds?.topZ ?? WALL_TOP_Z;
    const bottomZ = bounds?.bottomZ ?? WALL_BOTTOM_Z;
    const surfaceY = bounds?.surfaceY ?? PLAYFIELD_SURFACE_Y;
    const laneSepX = bounds?.laneSepX ?? 0.22;

    const centerX = (leftX + rightX) / 2;
    const centerZ = (topZ + bottomZ) / 2;
    const halfLenZ = (bottomZ - topZ) / 2;
    const halfLenX = (rightX - leftX) / 2;
    const halfH = WALL_HEIGHT / 2;

    const addBox = (
      hx: number,
      hy: number,
      hz: number,
      px: number,
      py: number,
      pz: number,
      role?: string,
      restitution = BALL_RESTITUTION,
      friction = BALL_FRICTION,
    ): RAPIER.Collider => {
      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(px, py, pz),
      );
      const desc = RAPIER.ColliderDesc.cuboid(hx, hy, hz)
        .setRestitution(restitution)
        .setFriction(friction)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
      const col = world.createCollider(desc, body);
      if (role) roles.set(col.handle, role);
      return col;
    };

    // Left wall
    addBox(
      WALL_THICKNESS / 2,
      halfH,
      halfLenZ,
      leftX,
      surfaceY + halfH,
      centerZ,
    );

    // Right wall (main terrain, stops before lane start)
    const laneStartZ = bottomZ - (bottomZ - topZ) * 0.35;
    const rHalfLenFixed = (laneStartZ - topZ) / 2;
    addBox(
      WALL_THICKNESS / 2,
      halfH,
      rHalfLenFixed,
      rightX,
      surfaceY + halfH,
      (topZ + laneStartZ) / 2,
    );

    // Outer right wall (launcher lane)
    addBox(
      WALL_THICKNESS / 2,
      halfH,
      halfLenZ,
      rightX,
      surfaceY + halfH,
      centerZ,
    );

    // Top wall
    addBox(
      halfLenX,
      halfH,
      WALL_THICKNESS / 2,
      centerX,
      surfaceY + halfH,
      topZ,
    );

    // Lane separator — bas de la lane uniquement, ne couvre pas le coude de sortie
    if (bounds) {
      const laneLen = (bounds.bottomZ - bounds.topZ) * 0.14;
      addBox(
        0.004,
        0.06,
        laneLen,
        bounds.laneSepX - 0.004,
        bounds.surfaceY + 0.03,
        bounds.bottomZ - laneLen,
      );
    }

    // Drain
    const drainBody = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(
        DRAIN_SWITCH_CENTER.x,
        surfaceY + halfH,
        WALL_BOTTOM_Z + WALL_THICKNESS / 2,
      ),
    );
    const drainCol = world.createCollider(
      RAPIER.ColliderDesc.cuboid(
        (WALL_RIGHT_X - WALL_LEFT_X) / 2,
        halfH,
        WALL_THICKNESS / 2,
      )
        .setRestitution(BALL_RESTITUTION)
        .setFriction(BALL_FRICTION)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      drainBody,
    );
    roles.set(drainCol.handle, "drain");

    // Bumpers
    for (let i = 0; i < BUMPER_POSITIONS.length; i++) {
      const pos = BUMPER_POSITIONS[i];
      const bBody = world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(pos.x, pos.y, pos.z),
      );
      const bCol = world.createCollider(
        RAPIER.ColliderDesc.ball(BUMPER_RADIUS)
          .setRestitution(BUMPER_RESTITUTION)
          .setFriction(0)
          .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
        bBody,
      );
      roles.set(bCol.handle, `bumper_${i}`);
    }

    // Slingshots
    const addSlingshot = (
      cx: number,
      cy: number,
      cz: number,
      ry: number,
      role: string,
    ) => {
      const b = world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed()
          .setTranslation(cx, cy, cz)
          .setRotation(eulerYToQuat(ry)),
      );
      const col = world.createCollider(
        RAPIER.ColliderDesc.cuboid(0.08, 0.025, 0.03)
          .setRestitution(SLINGSHOT_RESTITUTION)
          .setFriction(0)
          .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
        b,
      );
      roles.set(col.handle, role);
    };
    addSlingshot(
      SLINGSHOT_LEFT_CENTER.x,
      SLINGSHOT_LEFT_CENTER.y,
      SLINGSHOT_LEFT_CENTER.z,
      Math.PI / 6,
      "slingshot_left",
    );
    addSlingshot(
      SLINGSHOT_RIGHT_CENTER.x,
      SLINGSHOT_RIGHT_CENTER.y,
      SLINGSHOT_RIGHT_CENTER.z,
      -Math.PI / 6,
      "slingshot_right",
    );

    return roles;
  }
}

function eulerYToQuat(ry: number): {
  x: number;
  y: number;
  z: number;
  w: number;
} {
  return { x: 0, y: Math.sin(ry / 2), z: 0, w: Math.cos(ry / 2) };
}
