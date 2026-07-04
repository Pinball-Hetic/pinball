import { test, expect, describe, mock, beforeEach } from 'bun:test';
import { surfaceYAtZ, resetSurfaceCoefficients } from '../domain/PlayfieldGeometry';

// ── Mock RAPIER (wasm) ───────────────────────────────────────────────────────
// Avoid initializing the native module: ShooterLaneGate only uses the
// descriptor factories. Capture the arguments via chainable stubs to check the
// gate geometry.
type Captured = {
  translation?: { x: number; y: number; z: number };
  rotation?: { x: number; y: number; z: number; w: number };
  cuboid?: { hx: number; hy: number; hz: number };
  restitution?: number;
  friction?: number;
};

let captured: Captured;

function makeRigidBodyDesc() {
  const desc = {
    setTranslation(x: number, y: number, z: number) {
      captured.translation = { x, y, z };
      return desc;
    },
    setRotation(r: { x: number; y: number; z: number; w: number }) {
      captured.rotation = r;
      return desc;
    },
  };
  return desc;
}

function makeColliderDesc() {
  const desc = {
    setRestitution(v: number) {
      captured.restitution = v;
      return desc;
    },
    setFriction(v: number) {
      captured.friction = v;
      return desc;
    },
  };
  return desc;
}

const rapierStub = {
  RigidBodyDesc: {
    fixed: () => makeRigidBodyDesc(),
  },
  ColliderDesc: {
    cuboid: (hx: number, hy: number, hz: number) => {
      captured.cuboid = { hx, hy, hz };
      return makeColliderDesc();
    },
  },
};
// Expose the factories as named exports (the SUT uses `import * as RAPIER`) and
// under default, so the mock works regardless of import style.
mock.module('@dimforge/rapier3d-compat', () => ({ ...rapierStub, default: rapierStub }));

// ── Stub world ───────────────────────────────────────────────────────────────
class FakeWorld {
  createdBodies = 0;
  createdColliders = 0;
  removedColliders: Array<{ collider: unknown; wakeUp: boolean }> = [];
  removedBodies: unknown[] = [];

  createRigidBody(_desc: unknown) {
    this.createdBodies += 1;
    return { __body: true, id: this.createdBodies };
  }
  createCollider(_desc: unknown, _body: unknown) {
    this.createdColliders += 1;
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
  captured = {};
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
      expect(captured.translation!.x).toBeCloseTo(LANE.xMin + inset, 6);
      const midZ = (LANE.topZ + LANE.leftWallTopZ) / 2;
      expect(captured.translation!.z).toBeCloseTo(midZ, 6);
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
      expect(captured.translation!.y).toBeCloseTo(expectedY, 6);
    });

    test('demi-dimensions cuboid = thickness/2, wallHeight/2, halfZ', async () => {
      const ShooterLaneGate = await loadGate();
      const world = new FakeWorld();
      const gate = new ShooterLaneGate();
      gate.bind(world as never, LANE as never);

      gate.close();

      const halfZ = (LANE.leftWallTopZ - LANE.topZ) / 2;
      expect(captured.cuboid!.hx).toBeCloseTo(0.01 / 2, 6);
      expect(captured.cuboid!.hy).toBeCloseTo(LANE.wallHeight / 2, 6);
      expect(captured.cuboid!.hz).toBeCloseTo(halfZ, 6);
    });

    test('applique restitution et friction du lane', async () => {
      const ShooterLaneGate = await loadGate();
      const world = new FakeWorld();
      const gate = new ShooterLaneGate();
      gate.bind(world as never, LANE as never);

      gate.close();

      expect(captured.restitution).toBe(LANE.restitution);
      expect(captured.friction).toBe(LANE.friction);
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
      expect(captured.rotation!.x).toBeCloseTo(Math.sin(tilt / 2), 6);
      expect(captured.rotation!.y).toBe(0);
      expect(captured.rotation!.z).toBe(0);
      expect(captured.rotation!.w).toBeCloseTo(Math.cos(tilt / 2), 6);
    });
  });
});
