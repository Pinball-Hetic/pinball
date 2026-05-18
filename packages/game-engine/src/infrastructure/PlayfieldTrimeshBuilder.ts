import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

const SKIP = new Set([
  'ball', 'box', 'glass', 'feet', 'score_board', 'coin_slot',
  'plunger_panel', 'exit_cover', 'plate', 'start_button', 'spinner',
  'flipper', 'flipper_buttons', 'flipper_left_split', 'flipper_right_split',
  'pop_bumper', 'pop_bumper_left', 'pop_bumper_right', 'pop_bumper_guard',
  'drop_target_left_1', 'drop_target_left_2',
  'drop_target_right_1', 'drop_target_right_2', 'drop_target_right_3',
  'switch_out', 'switch_center_pop_bumper_zone', 'switch_left_pop_bumper_zone',
  'switch_right_pop_bumper_zone', 'switch_plunger', 'switch_rocket', 'switch_slingshot',
  'launcher',
  'separator_left', 'separator_right',
  'plastic_pop_bumper_zone',
]);

function isSkipped(node: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = node;
  while (current) {
    if (SKIP.has(current.name.toLowerCase())) return true;
    current = current.parent;
  }
  return false;
}

export class PlayfieldTrimeshBuilder {
  static build(playfieldRoot: THREE.Object3D, world: RAPIER.World): void {
    playfieldRoot.updateMatrixWorld(true);

    const trimGeos: THREE.BufferGeometry[] = [];

    playfieldRoot.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (isSkipped(child)) return;

      child.updateMatrixWorld(true);
      const geo = child.geometry.clone() as THREE.BufferGeometry;
      geo.applyMatrix4(child.matrixWorld);

      const posOnly = new THREE.BufferGeometry();
      posOnly.setAttribute('position', geo.getAttribute('position'));
      if (geo.index) posOnly.setIndex(geo.index);
      trimGeos.push(posOnly);
    });

    if (trimGeos.length === 0) return;

    const allVerts: number[] = [];
    const allIdx: number[] = [];
    let offset = 0;

    for (const g of trimGeos) {
      const posAttr = g.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < posAttr.count; i++) {
        allVerts.push(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
      }
      const idxArr = g.index
        ? Array.from(g.index.array as ArrayLike<number>)
        : Array.from({ length: posAttr.count }, (_, k) => k);
      for (const idx of idxArr) allIdx.push(idx + offset);
      offset += posAttr.count;
    }

    const trimBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    world.createCollider(
      RAPIER.ColliderDesc.trimesh(
        new Float32Array(allVerts),
        new Uint32Array(allIdx),
      ).setRestitution(0.35).setFriction(0.15),
      trimBody,
    );
  }
}
