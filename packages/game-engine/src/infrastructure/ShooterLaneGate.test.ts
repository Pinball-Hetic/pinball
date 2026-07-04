import { test, expect, describe, beforeAll, beforeEach } from 'bun:test';
import * as RAPIER from '@dimforge/rapier3d-compat';
import { surfaceYAtZ, resetSurfaceCoefficients } from '../domain/PlayfieldGeometry';

// Use the real Rapier descriptor builders (no mock.module — bun's is
// process-global and would poison sibling test files). A capturing stub world
// records the descriptors so we can assert the gate geometry off their real
// properties.
beforeAll(async () => {
  await RAPIER.init();
});

// ── Capturing stub world ─────────────────────────────────────────────────────
class FakeWorld {
  createdBodies = 0;
  createdColliders = 0;
  lastBodyDesc: RAPIER.RigidBodyDesc | null = null;
  lastColliderDesc: RAPIER.ColliderDesc | null = null;
  removedColliders: Array<{ collider: unknown; wakeUp: boolean }> = [];
  removedBodies: unknown[] = [];

  createRigidBody(desc: RAPIER.RigidBodyDesc) {
    this.createdBodies += 1;
    this.lastBodyDesc = desc;
    return { __body: true, id: this.createdBodies };
  }
  createCollider(desc: RAPIER.ColliderDesc, _body: unknown) {
    this.createdColliders += 1;
    this.lastColliderDesc = desc;
    return { __collider: true, id: this.createdColliders };
  }
  removeCollider(collider: unknown, wakeUp: boolean) {
    this.removedColliders.push({ collider, wakeUp });
  }
  removeRigidBody(body: unknown) {
    this.removedBodies.push(body);
  }
}

const LANE = {
  xMin: -0.2,
  topZ: -0.3,
  leftWallTopZ: -0.1,
  wallHeight: 0.04,
  restitution: 0.3,
  friction: 0.5,
};

async function loadGate() {
  const mod = await import('./ShooterLaneGate');
  return mod.ShooterLaneGate;
}

beforeEach(() => {
  resetSurfaceCoefficients();
});

describe('ShooterLaneGate', () => {
  test('isClosed() est false avant tout close()', async () => {
    const ShooterLaneGate = await loadGate();
    const gate = new ShooterLaneGate();
    expect(gate.isClosed()).toBe(false);
  });

  test('close() crée un corps + collider et passe isClosed() à true', async () => {
    const ShooterLaneGate = await loadGate();
    const world = new FakeWorld();
    const gate = new ShooterLaneGate();
    gate.bind(world as never, LANE as never);

    gate.close();

    expect(gate.isClosed()).toBe(true);
    expect(world.createdBodies).toBe(1);
    expect(world.createdColliders).toBe(1);
  });

  test('close() sans bind() ne crée rien (world null)', async () => {
    const ShooterLaneGate = await loadGate();
    const gate = new ShooterLaneGate();
    gate.close();
    expect(gate.isClosed()).toBe(false);
  });

  test('close() est idempotent : second appel ne recrée pas le collider', async () => {
    const ShooterLaneGate = await loadGate();
    const world = new FakeWorld();
    const gate = new ShooterLaneGate();
    gate.bind(world as never, LANE as never);

    gate.close();
    gate.close();

    expect(world.createdBodies).toBe(1);
    expect(world.createdColliders).toBe(1);
  });

  test('open() retire collider + corps et repasse isClosed() à false', async () => {
    const ShooterLaneGate = await loadGate();
    const world = new FakeWorld();
    const gate = new ShooterLaneGate();
    gate.bind(world as never, LANE as never);

    gate.close();
    gate.open();

    expect(gate.isClosed()).toBe(false);
    expect(world.removedColliders).toHaveLength(1);
    expect(world.removedColliders[0]!.wakeUp).toBe(true);
    expect(world.removedBodies).toHaveLength(1);
  });

  test('open() est sûr quand le portail est déjà ouvert', async () => {
    const ShooterLaneGate = await loadGate();
    const world = new FakeWorld();
    const gate = new ShooterLaneGate();
    gate.bind(world as never, LANE as never);

    gate.open();

    expect(world.removedColliders).toHaveLength(0);
    expect(world.removedBodies).toHaveLength(0);
  });

  test('open() sans world ne plante pas', async () => {
    const ShooterLaneGate = await loadGate();
    const gate = new ShooterLaneGate();
    expect(() => gate.open()).not.toThrow();
  });

  test('close → open → close re-crée un nouveau portail', async () => {
    const ShooterLaneGate = await loadGate();
    const world = new FakeWorld();
    const gate = new ShooterLaneGate();
    gate.bind(world as never, LANE as never);

    gate.close();
    gate.open();
    gate.close();

    expect(gate.isClosed()).toBe(true);
    expect(world.createdBodies).toBe(2);
    expect(world.createdColliders).toBe(2);
  });

  test('dispose() ouvre le portail et délie le world', async () => {
    const ShooterLaneGate = await loadGate();
    const world = new FakeWorld();
    const gate = new ShooterLaneGate();
    gate.bind(world as never, LANE as never);
    gate.close();

    gate.dispose();

    expect(gate.isClosed()).toBe(false);
    expect(world.removedColliders).toHaveLength(1);
    // After dispose the world is null: a new close() creates nothing.
    gate.close();
    expect(world.createdBodies).toBe(1);
  });

  describe('géométrie du portail', () => {
    test('positionne le mur sur X = xMin + inset et au milieu Z du couloir', async () => {
      const ShooterLaneGate = await loadGate();
      const world = new FakeWorld();
      const gate = new ShooterLaneGate();
      gate.bind(world as never, LANE as never);

      gate.close();

      const inset = 0.005;
      const t = world.lastBodyDesc!.translation;
      expect(t.x).toBeCloseTo(LANE.xMin + inset, 6);
      const midZ = (LANE.topZ + LANE.leftWallTopZ) / 2;
      expect(t.z).toBeCloseTo(midZ, 6);
    });

    test('hauteur Y = milieu surface + moitié de wallHeight', async () => {
      const ShooterLaneGate = await loadGate();
      const world = new FakeWorld();
      const gate = new ShooterLaneGate();
      gate.bind(world as never, LANE as never);

      gate.close();

      const yTop = surfaceYAtZ(LANE.topZ);
      const yBot = surfaceYAtZ(LANE.leftWallTopZ);
      const expectedY = (yTop + yBot) / 2 + LANE.wallHeight / 2;
      expect(world.lastBodyDesc!.translation.y).toBeCloseTo(expectedY, 6);
    });

    test('demi-dimensions cuboid = thickness/2, wallHeight/2, halfZ', async () => {
      const ShooterLaneGate = await loadGate();
      const world = new FakeWorld();
      const gate = new ShooterLaneGate();
      gate.bind(world as never, LANE as never);

      gate.close();

      const halfZ = (LANE.leftWallTopZ - LANE.topZ) / 2;
      const he = (world.lastColliderDesc!.shape as { halfExtents: { x: number; y: number; z: number } })
        .halfExtents;
      expect(he.x).toBeCloseTo(0.01 / 2, 6);
      expect(he.y).toBeCloseTo(LANE.wallHeight / 2, 6);
      expect(he.z).toBeCloseTo(halfZ, 6);
    });

    test('applique restitution et friction du lane', async () => {
      const ShooterLaneGate = await loadGate();
      const world = new FakeWorld();
      const gate = new ShooterLaneGate();
      gate.bind(world as never, LANE as never);

      gate.close();

      expect(world.lastColliderDesc!.restitution).toBe(LANE.restitution);
      expect(world.lastColliderDesc!.friction).toBe(LANE.friction);
    });

    test('rotation = quaternion d inclinaison autour de X (tilt du tapis)', async () => {
      const ShooterLaneGate = await loadGate();
      const world = new FakeWorld();
      const gate = new ShooterLaneGate();
      gate.bind(world as never, LANE as never);

      gate.close();

      const yTop = surfaceYAtZ(LANE.topZ);
      const yBot = surfaceYAtZ(LANE.leftWallTopZ);
      const tilt = Math.atan2(yTop - yBot, LANE.leftWallTopZ - LANE.topZ);
      const r = world.lastBodyDesc!.rotation;
      expect(r.x).toBeCloseTo(Math.sin(tilt / 2), 6);
      expect(r.y).toBeCloseTo(0, 6);
      expect(r.z).toBeCloseTo(0, 6);
      expect(r.w).toBeCloseTo(Math.cos(tilt / 2), 6);
    });
  });
});
