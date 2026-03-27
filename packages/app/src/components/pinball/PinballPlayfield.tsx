import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const PLAYFIELD_URL = '/playfield/playfield.glb';

/**
 * Three.js GLTFLoader « nettoie » les noms : les "." disparaissent.
 * Dans le fichier c’est "flipper_left.glb" → à l’exécution c’est "flipper_leftglb".
 */
const FLIPPER_LEFT_NAME = 'flipper_leftglb';
const FLIPPER_RIGHT_NAME = 'flipper_rightglb';

/** Amplitude de battement (rad). Ajuster si le mouvement est trop faible/fort. */
const SWING_RAD = 0.65;

/** Lissage du mouvement (0 = instantané, 1 = très lent). */
const SWING_SMOOTH = 0.42;

/**
 * À partir du bord charnière (min X gauche / max X droite), recule le pivot vers le centre
 * de la palette sur une fraction de la largeur du bbox (0 = coin, ~0.2 = un peu au milieu du bord).
 */
const HINGE_INSET_FROM_EDGE = 0.18;

/**
 * Place un groupe pivot sur la charnière (sans Blender) : centre d’une face du bbox.
 * Ici : l’autre côté de la pièce (gauche = min X, droite = max X) — face opposée au centre du plateau.
 */
function attachFlipperAtHinge(
  flipper: THREE.Object3D,
  side: 'left' | 'right',
): THREE.Object3D {
  const parent = flipper.parent;
  if (!parent) return flipper;

  flipper.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(flipper);
  const { min, max } = box;
  const midY = (min.y + max.y) / 2;
  const midZ = (min.z + max.z) / 2;
  const widthX = max.x - min.x;
  const inset = widthX * HINGE_INSET_FROM_EDGE;

  const hingeX = side === 'left' ? min.x + inset : max.x - inset;

  const hingeWorld = new THREE.Vector3(hingeX, midY, midZ);

  const pivot = new THREE.Group();
  pivot.name = `${flipper.name}_pivot`;

  const hingeLocal = hingeWorld.clone();
  parent.worldToLocal(hingeLocal);
  pivot.position.copy(hingeLocal);

  parent.add(pivot);
  pivot.attach(flipper);

  return pivot;
}

export default function PinballPlayfield() {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mountEl = mountRef.current;
    if (!mountEl) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#050816');
    const loader = new GLTFLoader();

    const { clientWidth, clientHeight } = mountEl;
    const camera = new THREE.PerspectiveCamera(60, clientWidth / clientHeight, 0.1, 100000);
    const cameraTarget = new THREE.Vector3(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(clientWidth, clientHeight);
    renderer.shadowMap.enabled = true;
    mountEl.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 1.0));
    const dir = new THREE.DirectionalLight(0xffffff, 1.2);
    dir.position.set(200, 500, 300);
    dir.castShadow = true;
    scene.add(dir);

    const modelRoot = new THREE.Group();
    scene.add(modelRoot);

    let playfieldRoot: THREE.Group | null = null;
    const geos: THREE.BufferGeometry[] = [];
    const mats: THREE.Material[] = [];

    const collectDisposables = (root: THREE.Object3D) => {
      root.traverse((c) => {
        if (!(c instanceof THREE.Mesh)) return;
        if (c.geometry) geos.push(c.geometry);
        const m = c.material;
        if (Array.isArray(m)) m.forEach((x) => mats.push(x));
        else if (m) mats.push(m);
        c.castShadow = true;
        c.receiveShadow = true;
      });
    };

    const getBBox = (o: THREE.Object3D) => new THREE.Box3().setFromObject(o);

    let leftPivot: THREE.Object3D | null = null;
    let rightPivot: THREE.Object3D | null = null;
    let leftSwing = 0;
    let rightSwing = 0;
    let leftTarget = 0;
    let rightTarget = 0;

    const init = async () => {
      try {
        const gltf = await loader.loadAsync(PLAYFIELD_URL);
        playfieldRoot = gltf.scene;
        collectDisposables(playfieldRoot);
        modelRoot.add(playfieldRoot);

        const leftFlipper = playfieldRoot.getObjectByName(FLIPPER_LEFT_NAME) ?? null;
        const rightFlipper = playfieldRoot.getObjectByName(FLIPPER_RIGHT_NAME) ?? null;
        if (!leftFlipper) console.warn(`Introuvable : "${FLIPPER_LEFT_NAME}"`);
        if (!rightFlipper) console.warn(`Introuvable : "${FLIPPER_RIGHT_NAME}"`);

        const tb = getBBox(modelRoot);
        modelRoot.position.sub(tb.getCenter(new THREE.Vector3()));
        modelRoot.updateMatrixWorld(true);

        if (leftFlipper) leftPivot = attachFlipperAtHinge(leftFlipper, 'left');
        if (rightFlipper) rightPivot = attachFlipperAtHinge(rightFlipper, 'right');

        const fb = getBBox(modelRoot);
        const fc = fb.getCenter(new THREE.Vector3());
        const fsz = fb.getSize(new THREE.Vector3());
        const maxS = Math.max(fsz.x, fsz.z);
        const fov = (camera.fov * Math.PI) / 180;
        const dist = (maxS * 0.7) / Math.tan(fov / 2);

        camera.position.set(fc.x, fc.y + dist * 0.75, fc.z + dist * 0.55);
        camera.near = Math.max(0.01, dist / 200);
        camera.far = dist * 20;
        camera.updateProjectionMatrix();
        cameraTarget.copy(fc);
        camera.lookAt(cameraTarget);

        mountEl.focus();
      } catch (err) {
        console.error('Erreur chargement playfield :', err);
      }
    };

    void init();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') e.preventDefault();
      if (e.repeat) return;
      if (e.key === 'ArrowLeft' || e.key === 'q' || e.key === 'Q') leftTarget = 1;
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') rightTarget = 1;
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') e.preventDefault();
      if (e.key === 'ArrowLeft' || e.key === 'q' || e.key === 'Q') leftTarget = 0;
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') rightTarget = 0;
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    let frameId: number;
    const animate = () => {
      leftSwing += (leftTarget * SWING_RAD - leftSwing) * SWING_SMOOTH;
      rightSwing += (rightTarget * SWING_RAD - rightSwing) * SWING_SMOOTH;

      if (leftPivot) leftPivot.rotation.y = leftSwing;
      if (rightPivot) rightPivot.rotation.y = -rightSwing;

      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };
    frameId = requestAnimationFrame(animate);

    const handleResize = () => {
      if (!mountEl) return;
      const { clientWidth: w, clientHeight: h } = mountEl;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      camera.lookAt(cameraTarget);
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      mountEl.removeChild(renderer.domElement);
      if (playfieldRoot) modelRoot.remove(playfieldRoot);
      geos.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
      renderer.dispose();
    };
  }, []);

  return (
    <div className="relative min-h-screen bg-black text-zinc-100">
      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 space-y-1 p-4 text-center text-sm font-mono uppercase tracking-[0.2em] text-zinc-400">
        <div>Playfield 3D</div>
        <div className="text-[10px] font-normal normal-case tracking-normal text-zinc-500">
          Palettes : ← / Q (gauche) · → / D (droite)
        </div>
      </header>
      <main
        ref={mountRef}
        className="h-screen w-full cursor-grab outline-none focus:outline-none"
        tabIndex={0}
        aria-label="Terrain de flipper — cliquez puis utilisez Q/D ou les flèches"
      />
    </div>
  );
}
