import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// ── Constants ──────────────────────────────────────────────────────────────────
const PLAYFIELD_URL      = '/playfield/pinball-machine.glb';
// Modèle Sketchfab "Pinball Machine" par Ranguel (CC Attribution)
// Le GLB expose un seul nœud "flipper" (mesh combiné gauche+droite).
// Les deux constantes pointent vers le même nœud ; seul le pivot gauche
// sera animé indépendamment (le droit partagera le même mesh).
const FLIPPER_LEFT_NAME  = 'flipper';
const FLIPPER_RIGHT_NAME = 'flipper';

/** Amplitude de battement des flippers (rad). */
const SWING_RAD = 0.65;
/** Lissage du mouvement des flippers (0 = instantané). */
const SWING_SMOOTH = 0.42;
/** Recul du pivot vers le centre de la palette (fraction de la largeur). */
const HINGE_INSET_FROM_EDGE = 0.18;

const FIXED_STEP = 1 / 480;
const MAX_SUB    = 20;

const INITIAL_LIVES = 3;
const BUMPER_SCORE  = 100;

/** Durée max de charge du plongeur (ms) — relâcher Espace lance. */
const PLUNGER_CHARGE_MS = 1800;
/** Facteur vitesse min / max selon la charge (évite un tap trop faible). */
const PLUNGER_MIN_FACTOR = 0.32;
const PLUNGER_MAX_FACTOR = 1;

/**
 * Plateau « vertical » (mur de flipper) : on tourne le GLB (plateau horizontal dans le fichier)
 * puis gravité monde sur **-Z** ; la bille est lancée en **+Z** et retombe avec la même gravité.
 * Sinon : plateau horizontal classique, gravité **-Y**.
 */
const PLAYFIELD_VERTICAL = true;

/** Module de la gravité monde (|-Y| ou |-Z| selon PLAYFIELD_VERTICAL). */
const PHYS_GRAVITY_MAG = 420;

/** Référence pour impulsions arcade (bumpers). */
const ARCADE_IMPULSE_REF = 1100;

// ── Types ──────────────────────────────────────────────────────────────────────
type GameState = 'idle' | 'playing' | 'game_over';

// ── Helper : attache un flipper à son pivot de charnière ──────────────────────
/**
 * Crée un groupe pivot positionné sur la charnière du flipper (bord interne),
 * puis y attache le flipper. Retourne le pivot.
 */
function attachFlipperAtHinge(
  flipper: THREE.Object3D,
  side: 'left' | 'right',
): THREE.Object3D {
  const parent = flipper.parent;
  if (!parent) return flipper;

  flipper.updateMatrixWorld(true);
  const box    = new THREE.Box3().setFromObject(flipper);
  const { min, max } = box;
  const midY   = (min.y + max.y) / 2;
  const midZ   = (min.z + max.z) / 2;
  const widthX = max.x - min.x;
  const inset  = widthX * HINGE_INSET_FROM_EDGE;
  const hingeX = side === 'left' ? min.x + inset : max.x - inset;

  const pivot = new THREE.Group();
  pivot.name  = `${flipper.name}_pivot`;

  const hingeWorld = new THREE.Vector3(hingeX, midY, midZ);
  const hingeLocal = hingeWorld.clone();
  parent.worldToLocal(hingeLocal);
  pivot.position.copy(hingeLocal);
  parent.add(pivot);
  pivot.attach(flipper);
  return pivot;
}

// ── Helper : split géométrique du flipper unique en deux moitiés ──────────────
/**
 * Cas B — le GLB expose un seul nœud "flipper" contenant les deux palettes.
 *
 * Algorithme :
 *  1. On transforme chaque vertex en world space (matrixWorld du mesh).
 *  2. Pour chaque triangle, on calcule le centroïde world-X.
 *     - centroïde X ≤ 0  → moitié gauche
 *     - centroïde X  > 0 → moitié droite
 *     (le modèle est centré sur l'origine juste avant l'appel)
 *  3. On reconvertit les positions retenues en espace local du parent du flipper
 *     (via inverse de parentMatrixWorld) pour que les pivots d'animation
 *     tournent dans le même repère que l'ancien code.
 *  4. On recompute les normales depuis la géométrie (computeVertexNormals).
 *
 * Les deux THREE.Mesh retournés sont prêts à être ajoutés à flipperObj.parent.
 */
function splitFlipperIntoTwo(
  flipperObj: THREE.Object3D,
): [THREE.Mesh | null, THREE.Mesh | null] {

  // Trouver le premier Mesh dans l'objet (peut être un Group)
  let src: THREE.Mesh | null = null;
  if (flipperObj instanceof THREE.Mesh) {
    src = flipperObj;
  } else {
    flipperObj.traverse((c) => {
      if (!src && c instanceof THREE.Mesh) src = c as THREE.Mesh;
    });
  }
  if (!src || !flipperObj.parent) return [null, null];

  src.updateMatrixWorld(true);
  flipperObj.parent.updateMatrixWorld(true);

  const worldMat  = src.matrixWorld;
  const toParent  = flipperObj.parent.matrixWorld.clone().invert();
  const geom      = src.geometry as THREE.BufferGeometry;
  const posAttr   = geom.attributes.position as THREE.BufferAttribute;
  const uvAttr    = geom.attributes.uv       as THREE.BufferAttribute | undefined;
  const vertCount = posAttr.count;

  // Positions world-X (pour décision split) et parent-local (pour la géo finale)
  const wX:         number[]   = new Array(vertCount);
  const localVerts: number[][] = new Array(vertCount);
  const tmp = new THREE.Vector3();
  for (let i = 0; i < vertCount; i++) {
    tmp.fromBufferAttribute(posAttr, i).applyMatrix4(worldMat);
    wX[i] = tmp.x;
    tmp.applyMatrix4(toParent);
    localVerts[i] = [tmp.x, tmp.y, tmp.z];
  }

  // Indices (indexed ou non-indexed)
  const idxArr: number[] = geom.index
    ? Array.from(geom.index.array as ArrayLike<number>)
    : Array.from({ length: vertCount }, (_, i) => i);

  // Tri des triangles par centroïde world-X
  const leftTris:  number[] = [];
  const rightTris: number[] = [];
  for (let t = 0; t < idxArr.length; t += 3) {
    const a = idxArr[t], b = idxArr[t + 1], c = idxArr[t + 2];
    const cx = (wX[a] + wX[b] + wX[c]) / 3;
    (cx <= 0 ? leftTris : rightTris).push(a, b, c);
  }

  // Construire une BufferGeometry compacte (re-index pour ne garder que les verts utilisés)
  const buildGeom = (tris: number[]): THREE.BufferGeometry | null => {
    if (tris.length === 0) return null;
    const remap = new Map<number, number>();
    const pos: number[] = [], uvs: number[] = [], idx: number[] = [];
    for (const old of tris) {
      if (!remap.has(old)) {
        remap.set(old, pos.length / 3);
        const [lx, ly, lz] = localVerts[old];
        pos.push(lx, ly, lz);
        if (uvAttr) uvs.push(uvAttr.getX(old), uvAttr.getY(old));
      }
      idx.push(remap.get(old)!);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    if (uvs.length) g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    g.computeVertexNormals(); // recalcul depuis la géo (PBR smooth)
    return g;
  };

  // Récupérer le matériau (cloner pour que chaque moitié soit indépendante)
  const baseMat = src.material as THREE.MeshStandardMaterial;
  const makeMesh = (tris: number[], name: string): THREE.Mesh | null => {
    const g = buildGeom(tris);
    if (!g) return null;
    const m = new THREE.Mesh(g, baseMat.clone());
    m.name = name;
    m.castShadow = m.receiveShadow = true;
    return m;
  };

  return [
    makeMesh(leftTris,  'flipper_left_split'),
    makeMesh(rightTris, 'flipper_right_split'),
  ];
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function PinballPlayfield() {
  const mountRef = useRef<HTMLDivElement | null>(null);

  // ── UI state ────────────────────────────────────────────────────────────────
  const [score,     setScore]     = useState(0);
  const [lives,     setLives]     = useState(INITIAL_LIVES);
  const [gameState, setGameState] = useState<GameState>('idle');

  // Refs miroirs pour usage dans le RAF sans closures périmées
  const scoreRef     = useRef(0);
  const livesRef     = useRef(INITIAL_LIVES);
  const gameStateRef = useRef<GameState>('idle');

  useEffect(() => {
    const mountEl = mountRef.current;
    if (!mountEl) return;

    // ── Three.js setup ───────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#050816');
    const loader = new GLTFLoader();

    const { clientWidth, clientHeight } = mountEl;
    const camera = new THREE.PerspectiveCamera(60, clientWidth / clientHeight, 0.1, 100_000);
    const cameraTarget = new THREE.Vector3();

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(clientWidth, clientHeight);
    renderer.shadowMap.enabled = true;
    mountEl.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 1.0));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(200, 500, 300);
    dirLight.castShadow = true;
    scene.add(dirLight);

    const modelRoot = new THREE.Group();
    scene.add(modelRoot);

    // Ressources à libérer au démontage
    let playfieldRoot: THREE.Group | null = null;
    const disposableGeos: THREE.BufferGeometry[] = [];
    const disposableMats: THREE.Material[]        = [];

    const collectDisposables = (root: THREE.Object3D) => {
      root.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        if (child.geometry) disposableGeos.push(child.geometry);
        const m = child.material;
        if (Array.isArray(m)) m.forEach((x) => disposableMats.push(x));
        else if (m) disposableMats.push(m);
        child.castShadow    = true;
        child.receiveShadow = true;
      });
    };

    // ── Flipper visual state ─────────────────────────────────────────────────
    let leftPivot:     THREE.Object3D | null = null;
    let rightPivot:    THREE.Object3D | null = null;
    let leftFlipperObj:  THREE.Object3D | null = null;
    let rightFlipperObj: THREE.Object3D | null = null;
    let leftSwing  = 0, rightSwing  = 0;
    let leftTarget = 0, rightTarget = 0;
    let prevLeftSwing = 0, prevRightSwing = 0;

    // ── Physics state ────────────────────────────────────────────────────────
    let physWorld:        CANNON.World | null = null;
    let ballBody:         CANNON.Body  | null = null;
    let ballMesh:         THREE.Mesh   | null = null;
    let ballRadius                            = 0;
    let spawnX = 0, spawnY = 0, spawnZ = 0;
    /** Module de vitesse au lancement (keyup → spawnBall). */
    let launchVelMag = 0;
    /** Couloir surtout le long de X (vers le terrain) ou de Z (vers le haut du plateau). */
    let launchAxis: 'x' | 'z' = 'z';
    let drainZ     = Infinity;
    let drainAtMaxZ = true;
    let leftFlipperBody:  CANNON.Body | null = null;
    let rightFlipperBody: CANNON.Body | null = null;
    let prevFrameTime = 0;
    let laneMinX = Infinity;   // seuil X du couloir lanceur (set lors de l'init)
    let laneMaxX = Infinity;
    /** Lanceur sur le côté +X (terrain principal à -X). */
    let laneIsOnRight = true;
    let hasLeftLauncher = false; // true dès que la balle a quitté le couloir
    /** Vitesse de lancement de référence (module, avant charge plongeur). */
    let launchSpeedBase = 0;
    let tableYPhys = 0;
    /** Hauteur max raisonnable pour la bille (plafond invisible). */
    let ballCeilingY = 0;
    let ballCeilingZ = Infinity;
    let physicsReady = false;
    let isChargingPlunger = false;
    let chargeStartTime = 0;

    // ── Helpers de jeu ───────────────────────────────────────────────────────
    const updateGameState = (state: GameState) => {
      gameStateRef.current = state;
      setGameState(state);
    };

    const spawnBall = () => {
      if (!ballBody || !ballMesh) return;
      hasLeftLauncher = false;
      ballBody.position.set(spawnX, spawnY, spawnZ);
      const mag = launchVelMag;
      if (PLAYFIELD_VERTICAL) {
        ballBody.velocity.set(0, 0, mag);
      } else {
        const vx = launchAxis === 'x' ? (laneIsOnRight ? -1 : 1) * mag : 0;
        const vz = launchAxis === 'z' ? (drainAtMaxZ ? -1 : 1) * mag : 0;
        ballBody.velocity.set(vx, 0, vz);
      }
      ballBody.angularVelocity.set(0, 0, 0);
      (ballBody as CANNON.Body & { _launchSettle?: number })._launchSettle = 22;
      ballBody.wakeUp();
      ballMesh.visible = true;
      updateGameState('playing');
    };

    const handleDrain = () => {
      if (!ballMesh) return;
      ballMesh.visible = false;
      if (ballBody) {
        ballBody.velocity.setZero();
        ballBody.angularVelocity.setZero();
        ballBody.sleep();
      }
      const newLives = livesRef.current - 1;
      livesRef.current = newLives;
      setLives(newLives);
      updateGameState(newLives <= 0 ? 'game_over' : 'idle');
    };

    const resetGame = () => {
      scoreRef.current = 0;
      setScore(0);
      livesRef.current = INITIAL_LIVES;
      setLives(INITIAL_LIVES);
      updateGameState('idle');
    };

    // ── GLTF + Physics setup ─────────────────────────────────────────────────
    const init = async () => {
      try {
        const gltf = await loader.loadAsync(PLAYFIELD_URL);
        playfieldRoot = gltf.scene;
        collectDisposables(playfieldRoot);
        modelRoot.add(playfieldRoot);

        // ── Étape 2 : log de tous les nœuds du GLB (debug / identification) ──
        gltf.scene.traverse((child) => {
          if (child.name) console.log('[GLB Node]', child.name, child.type);
        });

        // ── Étape 5 (optionnel) : override de matériaux ──────────────────────
        // Le GLB Sketchfab embarque ses propres textures PBR — on les conserve
        // mais on renforce l'émissivité des flippers pour un effet arcade.
        gltf.scene.traverse((child) => {
          if (!(child instanceof THREE.Mesh)) return;
          const nameLC = child.name.toLowerCase();
          const mat = child.material as THREE.MeshStandardMaterial;
          if (!mat || Array.isArray(mat)) return;
          if (nameLC.includes('flipper') && !nameLC.includes('button')) {
            mat.emissive        = new THREE.Color('#ff6600');
            mat.emissiveIntensity = 0.28;
          }
        });


        // ── Récupérer le nœud flipper unique du GLB ─────────────────────────
        // FLIPPER_RIGHT_NAME est intentionnellement ignoré ici : le GLB Sketchfab
        // n'expose qu'un seul nœud "flipper". Le flipper droit est créé par clone
        // + miroir (Cas A) juste après le centrage du modèle.
        const baseFlipper = playfieldRoot.getObjectByName(FLIPPER_LEFT_NAME) ?? null;
        if (!baseFlipper) console.warn(`[Playfield] Introuvable : "${FLIPPER_LEFT_NAME}"`);

        // ① Centrer le modèle EN PREMIER — toutes les coordonnées ci-dessous seront centrées
        const tb = new THREE.Box3().setFromObject(modelRoot);
        modelRoot.position.sub(tb.getCenter(new THREE.Vector3()));
        if (PLAYFIELD_VERTICAL) {
          modelRoot.rotation.x = Math.PI / 2;
        }
        modelRoot.updateMatrixWorld(true);

        // ── Cas B : split géométrique ─────────────────────────────────────────
        // Le modèle est centré sur l'origine (X=0). On divise le mesh "flipper"
        // en triangles dont le centroïde world-X ≤ 0 (gauche) et > 0 (droite).
        // Chaque moitié devient un THREE.Mesh indépendant avec ses propres
        // BufferGeometry, pivot d'animation et corps Cannon.js.
        let leftFlipper:  THREE.Object3D | null = null;
        let rightFlipper: THREE.Object3D | null = null;

        if (baseFlipper?.parent) {
          const [lMesh, rMesh] = splitFlipperIntoTwo(baseFlipper);

          if (lMesh && rMesh) {
            baseFlipper.visible = false;              // cacher le mesh original fusionné
            baseFlipper.parent.add(lMesh);
            baseFlipper.parent.add(rMesh);
            disposableGeos.push(lMesh.geometry, rMesh.geometry);
            disposableMats.push(
              lMesh.material as THREE.Material,
              rMesh.material as THREE.Material,
            );
            leftFlipper  = lMesh;
            rightFlipper = rMesh;
            console.info(
              `[Flipper] Split géométrique OK — ` +
              `gauche="${lMesh.name}" ${lMesh.geometry.attributes.position.count} verts | ` +
              `droite="${rMesh.name}" ${rMesh.geometry.attributes.position.count} verts`,
            );
          } else {
            // Fallback : le split a renvoyé 0 triangles d'un côté
            // → le mesh est peut-être un seul flipper (pas une fusion gauche+droite)
            leftFlipper  = baseFlipper;
            rightFlipper = baseFlipper;
            console.warn(
              '[Flipper] Split échoué (0 triangles côté gauche ou droit) — ' +
              'mesh unique utilisé en fallback. Vérifier la position X du nœud "flipper".',
            );
          }
        }

        // ② Sauvegarder les bbox des flippers APRÈS centrage + clonage
        leftFlipper?.updateMatrixWorld(true);
        rightFlipper?.updateMatrixWorld(true);
        const leftFlipperBBox  = leftFlipper  ? new THREE.Box3().setFromObject(leftFlipper)  : null;
        const rightFlipperBBox = rightFlipper ? new THREE.Box3().setFromObject(rightFlipper) : null;

        // ③ Attacher les flippers à leurs pivots de charnière
        if (leftFlipper)  { leftPivot  = attachFlipperAtHinge(leftFlipper,  'left');  leftFlipperObj  = leftFlipper; }
        if (rightFlipper) { rightPivot = attachFlipperAtHinge(rightFlipper, 'right'); rightFlipperObj = rightFlipper; }

        // ── Caméra : face au flipper (centrée sur le plateau, regard vers fc, pas de décalé latéral en X)
        const fb  = new THREE.Box3().setFromObject(modelRoot);
        const fc  = fb.getCenter(new THREE.Vector3());
        const fsz = fb.getSize(new THREE.Vector3());
        const maxS = Math.max(fsz.x, fsz.y, fsz.z);
        const fov  = (camera.fov * Math.PI) / 180;
        const dist = (maxS * 0.72) / Math.tan(fov / 2);
        if (PLAYFIELD_VERTICAL) {
          // Mur de jeu dans ~YZ : on se place devant le plateau sur +Z, axe de vue passant par le centre
          camera.position.set(fc.x, fc.y, fc.z + dist * 1.06);
        } else {
          // Plateau horizontal : vue joueur face à la machine (centrée X), légère élévation
          camera.position.set(fc.x, fc.y + dist * 0.42, fc.z + dist * 0.95);
        }
        camera.near = Math.max(0.01, dist / 200);
        camera.far  = dist * 20;
        camera.updateProjectionMatrix();
        cameraTarget.copy(fc);
        camera.lookAt(cameraTarget);

        // ── Physique ─────────────────────────────────────────────────────────
        // Référence unique pour les flippers (utilisée à plusieurs endroits)
        const flipperRefBBox = leftFlipperBBox ?? rightFlipperBBox;

        // Orientation du drain : flippers côté Z+ (vers caméra) ou Z- ?
        // Maintenant que les bboxes sont capturées APRÈS centrage, la comparaison est fiable.
        const flipperCenterZ = flipperRefBBox
          ? flipperRefBBox.getCenter(new THREE.Vector3()).z
          : fc.z + 1; // fallback : on suppose Z+
        drainAtMaxZ = flipperCenterZ > fc.z;

        physWorld = new CANNON.World({
          gravity: PLAYFIELD_VERTICAL
            ? new CANNON.Vec3(0, 0, -PHYS_GRAVITY_MAG)
            : new CANNON.Vec3(0, -PHYS_GRAVITY_MAG, 0),
        });
        physWorld.broadphase = new CANNON.SAPBroadphase(physWorld);
        physWorld.allowSleep  = true;

        // Matériaux de contact
        const ballMat    = new CANNON.Material('ball');
        const tableMat   = new CANNON.Material('table');
        const bumperMat  = new CANNON.Material('bumper');
        const flipperMat = new CANNON.Material('flipper');
        const wallMat    = new CANNON.Material('wall'); // murs périphériques — rebond plus vif que la table
        const laneMat    = new CANNON.Material('lane'); // rails du couloir lanceur

        // Restitution un peu plus basse sur table / lane pour limiter les pics Trimesh.
        // Ex. three.js ballshooter : Rapier + sol lisse → pas de Trimesh ; ici restitution très basse = pas de cliquetis
        physWorld.addContactMaterial(new CANNON.ContactMaterial(ballMat, tableMat,   { friction: 0.26, restitution: 0.03 }));
        physWorld.addContactMaterial(new CANNON.ContactMaterial(ballMat, bumperMat,  { friction: 0.0,  restitution: 0.65 }));
        physWorld.addContactMaterial(new CANNON.ContactMaterial(ballMat, flipperMat, { friction: 0.06, restitution: 0.48 }));
        physWorld.addContactMaterial(new CANNON.ContactMaterial(ballMat, wallMat,    { friction: 0.03, restitution: 0.36 }));
        physWorld.addContactMaterial(new CANNON.ContactMaterial(ballMat, laneMat,    { friction: 0.08, restitution: 0.06 }));


        // Surface plateau (bumpers / flippers) = bas des flippers
        const tableY = flipperRefBBox
          ? flipperRefBBox.min.y
          : fb.min.y + fsz.y * 0.25;

        console.info(`[Physics] tableY=${tableY.toFixed(3)}, fb.min.y=${fb.min.y.toFixed(3)}, fsz=${fsz.x.toFixed(2)}×${fsz.y.toFixed(2)}×${fsz.z.toFixed(2)}`);

        // Helpers de nom
        // Nœuds bumpers du nouveau GLB : "pop bumper", "pop bumper left",
        // "pop bumper right", "pop bumper guard" → matchent 'pop' et 'bumper' ✓
        const isBumperName = (nameLC: string) =>
          nameLC.includes('bump') ||
          nameLC.includes('bumper') ||
          nameLC.includes('pop') ||
          nameLC.includes('kicker') ||
          nameLC.includes('slingshot');   // "slingshot" du nouveau modèle Sketchfab

        const isWallName = (nameLC: string) =>
          nameLC.includes('wall') ||
          nameLC.includes('rail') ||
          nameLC.includes('guide') ||
          nameLC.includes('lane');

        // ── Rayon de la bille calculé tôt (nécessaire pour dimensionner les murs) ──
        if (flipperRefBBox) {
          const flipSz  = flipperRefBBox.getSize(new THREE.Vector3());
          const flipLen = Math.max(flipSz.x, flipSz.z);
          ballRadius = flipLen / 10;
        } else {
          ballRadius = fsz.x / 60;
        }

        // ── Détection du launcher (tôt pour connaître laneWallFaceX avant création des murs) ──
        const isLauncherName = (nameLC: string) =>
          nameLC.includes('plunger') || nameLC.includes('launcher') ||
          nameLC.includes('lanceur') || nameLC.includes('launch');
        let launcherBBox: THREE.Box3 | null = null;
        modelRoot.traverse((obj) => {
          const nameLC = obj.name.toLowerCase();
          if (!isLauncherName(nameLC)) return;
          if (obj.parent && isLauncherName(obj.parent.name.toLowerCase())) return;
          const bb = new THREE.Box3().setFromObject(obj);
          launcherBBox = launcherBBox ? launcherBBox.union(bb) : bb;
        });
        // laneWallFaceX = bord de séparation entre couloir et terrain principal
        const laneWallFaceX = launcherBBox
          ? (launcherBBox as THREE.Box3).min.x
          : (fb.max.x - fsz.x * 0.09);
        laneIsOnRight = laneWallFaceX > fc.x;

        // ── Collision trimesh : géométrie réelle du playfield ─────────────────
        // Chaque THREE.Mesh statique du GLTF devient un CANNON.Trimesh.
        // La bille rebondit sur la vraie forme du plateau (pas de boxes invisibles).
        //
        // Exclusions :
        //   1. Flippers (corps cinématiques séparés)
        //   2. Bumpers (cylindres + events)
        //   3. Meshes dans la zone du launcher (bbox overlaps laneZone)
        //      → évite que le tube/boîtier du plongeur emprisonne la bille

        // Zone X du couloir de lancement (tout ce qui est au-delà de laneWallFaceX)
        // On l'expose en outer scope pour la correction de drift dans animate()
        laneMinX = laneIsOnRight ? laneWallFaceX : fb.min.x;
        laneMaxX = laneIsOnRight ? fb.max.x : laneWallFaceX;

        // Hauteur de roulement : le couloir peut être au-dessus du bas des flippers ;
        // si on spawn avec tableY (flipper) seul, la bille est sous le sol du lanceur → éjection verticale.
        const rollSurfaceY = Math.max(
          tableY,
          launcherBBox ? (launcherBBox as THREE.Box3).min.y : tableY,
          fb.min.y,
        );
        tableYPhys = rollSurfaceY;
        // Plafond « logique » seulement (pas de collider) — évite les micro-sauts dus au plafond physique
        ballCeilingY = rollSurfaceY + Math.max(fsz.y * 0.92, 420);
        ballCeilingZ = fc.z + fsz.z * 0.58;

        const skipForTrimesh = (obj: THREE.Object3D): boolean => {
          const nameLC = obj.name.toLowerCase();
          if (nameLC.includes('flipper'))    return true;
          if (nameLC.includes('bump') || nameLC.includes('bumper') || nameLC.includes('pop')) return true;
          if (nameLC.includes('ball'))       return true;
          // Exclure la vitre (formerait un plafond qui bloque la bille)
          if (nameLC.includes('glass'))      return true;
          // Exclure les pièces extérieures du cabinet (pas de collision utile)
          if (nameLC.includes('score board') || nameLC.includes('coin slot') ||
              nameLC.includes('exit cover')  || nameLC.includes('feet') ||
              nameLC.includes('shoulder'))   return true;
          // Exclure tout mesh dont le centre X est dans la colonne du lanceur
          if (obj instanceof THREE.Mesh) {
            obj.updateMatrixWorld(true);
            const objBB = new THREE.Box3().setFromObject(obj);
            const cx = (objBB.min.x + objBB.max.x) / 2;
            if (cx >= laneMinX && cx <= laneMaxX) return true;
          }
          return false;
        };

        const tmpVec3 = new THREE.Vector3();
        let trimeshCount = 0;
        let totalTris    = 0;
        const includedNames: string[] = [];
        const excludedNames: string[] = [];

        playfieldRoot.updateMatrixWorld(true);
        playfieldRoot.traverse((obj) => {
          if (!(obj instanceof THREE.Mesh)) return;

          if (skipForTrimesh(obj)) {
            excludedNames.push(obj.name || '(unnamed)');
            return;
          }
          includedNames.push(obj.name || '(unnamed)');

          const geom = obj.geometry as THREE.BufferGeometry;
          const posAttr = geom.attributes.position;
          if (!posAttr || posAttr.count < 3) return;

          const worldMatrix = obj.matrixWorld;
          const vertCount = posAttr.count;
          const vertices: number[] = new Array(vertCount * 3);
          for (let i = 0; i < vertCount; i++) {
            tmpVec3.fromBufferAttribute(posAttr, i).applyMatrix4(worldMatrix);
            vertices[i * 3]     = tmpVec3.x;
            vertices[i * 3 + 1] = tmpVec3.y;
            vertices[i * 3 + 2] = tmpVec3.z;
          }

          let indices: number[];
          if (geom.index) {
            indices = Array.from(geom.index.array as ArrayLike<number>);
          } else {
            indices = new Array(vertCount);
            for (let i = 0; i < vertCount; i++) indices[i] = i;
          }
          if (indices.length < 3) return;

          // Parois/rails → wallMat (rebond plus vif) ; surface de jeu → tableMat
          const nameLC = obj.name.toLowerCase();
          const meshMat = (nameLC.includes('wall') || nameLC.includes('rail') ||
                           nameLC.includes('guide') || nameLC.includes('lane'))
            ? wallMat : tableMat;

          try {
            const trimesh = new CANNON.Trimesh(vertices, indices);
            const body = new CANNON.Body({ mass: 0, material: meshMat });
            body.addShape(trimesh);
            body.position.set(0, 0, 0);
            physWorld!.addBody(body);
            trimeshCount++;
            totalTris += indices.length / 3;
          } catch (e) {
            console.warn(`[Physics] Trimesh "${obj.name}" rejeté :`, e);
          }
        });

        // Sol de sécurité : rattrape la balle si elle tombe à travers un trou du trimesh
        // (observé py=-42 dans les logs — le sol trimesh a des lacunes)
        const floorSafety = new CANNON.Body({ mass: 0, material: tableMat });
        floorSafety.addShape(new CANNON.Box(new CANNON.Vec3(fsz.x, 5, fsz.z)));
        floorSafety.position.set(fc.x, rollSurfaceY - ballRadius * 10, fc.z);
        physWorld.addBody(floorSafety);

        // Murs de sécurité extérieurs (balle s'échappait à px=-1817, pz=-3318)
        const wL = new CANNON.Body({ mass: 0, material: wallMat });
        wL.addShape(new CANNON.Box(new CANNON.Vec3(5, fsz.y * 2, fsz.z + 20)));
        wL.position.set(fb.min.x - 10, fc.y, fc.z); physWorld.addBody(wL);
        const wR = new CANNON.Body({ mass: 0, material: wallMat });
        wR.addShape(new CANNON.Box(new CANNON.Vec3(5, fsz.y * 2, fsz.z + 20)));
        wR.position.set(fb.max.x + 10, fc.y, fc.z); physWorld.addBody(wR);
        const wTop = new CANNON.Body({ mass: 0, material: wallMat });
        wTop.addShape(new CANNON.Box(new CANNON.Vec3(fsz.x + 20, fsz.y * 2, 5)));
        wTop.position.set(fc.x, fc.y, fb.min.z - 10); physWorld.addBody(wTop);
        const wBot = new CANNON.Body({ mass: 0, material: wallMat });
        wBot.addShape(new CANNON.Box(new CANNON.Vec3(fsz.x + 20, fsz.y * 2, 5)));
        wBot.position.set(fc.x, fc.y, fb.max.z + 10); physWorld.addBody(wBot);

        // Rails du couloir lanceur (les meshes du tube sont exclus du Trimesh)
        if (launcherBBox) {
          const lb    = launcherBBox as THREE.Box3;
          const lsz   = lb.getSize(new THREE.Vector3());
          const lcx   = (lb.min.x + lb.max.x) / 2;
          const lcz   = (lb.min.z + lb.max.z) / 2;

          // Sol du couloir : sans ça, aucun Trimesh sous la bille dans la colonne lanceur → chute en Y puis
          // choc / rebond (saut puis retombée visuel au lancement).
          const laneFloorHalfY = 2.8;
          const laneFloor      = new CANNON.Body({ mass: 0, material: tableMat });
          laneFloor.addShape(
            new CANNON.Box(new CANNON.Vec3(lsz.x / 2, laneFloorHalfY, lsz.z / 2)),
          );
          laneFloor.position.set(lcx, rollSurfaceY - laneFloorHalfY, lcz);
          physWorld.addBody(laneFloor);

          const wallT = Math.max(2.5, ballRadius * 0.35);
          const wallH = Math.min(
            Math.max(
              flipperRefBBox ? flipperRefBBox.max.y - rollSurfaceY + ballRadius * 2.5 : 32,
              ballRadius * 4,
            ),
            ballRadius * 14,
          );
          const yRail = rollSurfaceY + wallH / 2;

          const outerX = laneIsOnRight ? lb.max.x - wallT / 2 : lb.min.x + wallT / 2;
          const outer = new CANNON.Body({ mass: 0, material: laneMat });
          outer.addShape(new CANNON.Box(new CANNON.Vec3(wallT / 2, wallH / 2, lsz.z / 2)));
          outer.position.set(outerX, yRail, lcz);
          physWorld.addBody(outer);
          // Pas de mur « fond de couloir » : pouvait coincer / projeter la bille verticalement
        }

        // Zone de drain : légèrement au-delà du bord côté flippers
        drainZ = drainAtMaxZ
          ? fb.max.z + ballRadius * 4
          : fb.min.z - ballRadius * 4;

        // ── Bumpers ──────────────────────────────────────────────────────────
        // Les nœuds bumpers sont des Groups (pas des Mesh) — on doit traverser
        // tous les Object3D. On saute si le parent a déjà matché pour éviter les doublons.
        let bumpersFound = 0;
        modelRoot.traverse((obj) => {
          const nameLC = obj.name.toLowerCase();
          if (!isBumperName(nameLC)) return;
          // Éviter de traiter un enfant si le parent a déjà un nom de bumper
          if (obj.parent && isBumperName(obj.parent.name.toLowerCase())) return;

          obj.updateMatrixWorld(true);
          const bb  = new THREE.Box3().setFromObject(obj);
          const bc  = bb.getCenter(new THREE.Vector3());
          const bs  = bb.getSize(new THREE.Vector3());
          const rawRad = Math.min(bs.x, bs.z) / 2;
          const rad = Math.max(rawRad, ballRadius * 1.5);
          const h   = Math.max(bs.y, rad * 0.5);

          const bumperBody = new CANNON.Body({ mass: 0, material: bumperMat });
          bumperBody.addShape(new CANNON.Cylinder(rad, rad, h, 8));
          // Ancrer le bas du cylindre sur la surface (Y=tableY) pour éviter kick vertical
          bumperBody.position.set(bc.x, tableY + h / 2, bc.z);
          physWorld!.addBody(bumperBody);

          // Collision : impulsion radiale + score
          bumperBody.addEventListener('collide', (event: { body: CANNON.Body }) => {
            const other = event.body;
            const dx  = other.position.x - bumperBody.position.x;
            const dz  = other.position.z - bumperBody.position.z;
            const len = Math.sqrt(dx * dx + dz * dz);
            if (len > 0) {
              const forceMag = ballRadius * ARCADE_IMPULSE_REF * 0.28;
              other.applyImpulse(
                new CANNON.Vec3((dx / len) * forceMag, 0, (dz / len) * forceMag),
                other.position,
              );
            }
            scoreRef.current += BUMPER_SCORE;
            setScore(scoreRef.current);
          });

          bumpersFound++;
        });

        if (bumpersFound === 0) {
          console.warn('[Physics] Aucun bumper trouvé. Vérifier le GLTF.');
        } else {
          console.info(`[Physics] ${bumpersFound} bumper(s) détecté(s).`);
        }

        // (wall.glb / laneWallBody est créé plus bas avec des dimensions précises)

        // ── Corps cinématiques des flippers ──────────────────────────────────
        // KINEMATIC = 4 dans cannon-es (CANNON.Body.KINEMATIC)
        const KINEMATIC = 4 as const;

        const makeFlipperBody = (bbox: THREE.Box3 | null, label: string): CANNON.Body | null => {
          if (!bbox) return null;
          const sz = bbox.getSize(new THREE.Vector3());
          const cx = bbox.getCenter(new THREE.Vector3());
          const body = new CANNON.Body({ mass: 0, type: KINEMATIC, material: flipperMat });
          // Hauteur = taille visuelle exacte (pas wt) pour éviter que la bille
          // se retrouve dans le corps du flipper au spawn
          body.addShape(
            new CANNON.Box(new CANNON.Vec3(sz.x / 2, sz.y / 2, sz.z / 2)),
          );
          body.position.set(cx.x, cx.y, cx.z);
          physWorld!.addBody(body);
          return body;
        };

        leftFlipperBody  = makeFlipperBody(leftFlipperBBox, 'left');
        rightFlipperBody = makeFlipperBody(rightFlipperBBox, 'right');

        // ── Bille ─────────────────────────────────────────────────────────────
        // ballRadius est déjà calculé plus haut (avant les murs)
        console.info(`[Physics] ballRadius=${ballRadius.toFixed(4)}`);

        ballBody = new CANNON.Body({
          mass: 0.07,
          shape: new CANNON.Sphere(ballRadius),
          material: ballMat,
          linearDamping: 0.02,
          angularDamping: 0.38,
        });
        ballBody.allowSleep = false; // jamais d'auto-sleep → évite le gel mid-field
        physWorld.addBody(ballBody);

        // Mesh visuel argenté métallique
        const ballGeo       = new THREE.SphereGeometry(ballRadius, 24, 24);
        const ballVisualMat = new THREE.MeshStandardMaterial({ color: 0xd4d4d4, metalness: 0.95, roughness: 0.08 });
        ballMesh = new THREE.Mesh(ballGeo, ballVisualMat);
        ballMesh.castShadow    = true;
        ballMesh.receiveShadow = true;
        ballMesh.visible       = false; // caché jusqu'au premier lancer
        scene.add(ballMesh);

        // Spawn : couloir du lanceur — launcherBBox déjà détecté dans la section murs.
        if (launcherBBox) {
          const launcherBounds = launcherBBox as THREE.Box3;
          const center = launcherBounds.getCenter(new THREE.Vector3());
          const size   = launcherBounds.getSize(new THREE.Vector3());
          const safeHalfLane = Math.max(ballRadius * 1.4, Math.min(size.x / 2, ballRadius * 2.6));
          const maxOffset = Math.max(0, size.x / 2 - safeHalfLane);
          const laneBias  = maxOffset * 0.35;
          const biasDir   = center.x > fc.x ? -1 : 1;
          spawnX = center.x + biasDir * laneBias;

        } else {
          spawnX = fb.max.x - ballRadius * 8;
        }
        // Centre de la sphère : surface de roulement réelle (couloir vs flipper)
        spawnY = rollSurfaceY + ballRadius;
        spawnZ = launcherBBox
          ? (launcherBBox as THREE.Box3).getCenter(new THREE.Vector3()).z
          : (drainAtMaxZ ? fb.max.z - fsz.z * 0.08 : fb.min.z + fsz.z * 0.08);

        if (launcherBBox) {
          const lb = launcherBBox as THREE.Box3;
          const pad = ballRadius * 2.8;
          if (laneIsOnRight) spawnX = Math.min(spawnX, lb.max.x - pad);
          else spawnX = Math.max(spawnX, lb.min.x + pad);
        }

        // Axe du couloir : beaucoup de GLTF ont un lanceur long en X (vers le terrain), pas en Z.
        if (launcherBBox) {
          const lb  = launcherBBox as THREE.Box3;
          const lsz = lb.getSize(new THREE.Vector3());
          launchAxis = lsz.x > lsz.z * 1.06 ? 'x' : 'z';
        } else {
          launchAxis = 'z';
        }
        if (PLAYFIELD_VERTICAL) launchAxis = 'z';

        // Distance le long de l’axe de lancement jusqu’à la sortie du couloir
        let launchDist = Math.max(ballRadius * 2, fsz.z * 0.1);
        if (launcherBBox) {
          const lb  = launcherBBox as THREE.Box3;
          const lsz = lb.getSize(new THREE.Vector3());
          if (launchAxis === 'x') {
            const xExit = laneIsOnRight ? lb.min.x : lb.max.x;
            launchDist = Math.abs(spawnX - xExit);
            launchDist = Math.max(ballRadius * 2.5, Math.min(launchDist, lsz.x * 0.95));
          } else {
            const zExit = drainAtMaxZ ? lb.min.z : lb.max.z;
            launchDist = Math.abs(spawnZ - zExit);
            launchDist = Math.max(ballRadius * 2.5, Math.min(launchDist, lsz.z * 0.95));
          }
        }
        // Vitesse de plongeur : calibrée en unités/s selon la taille du plateau et la longueur du couloir,
        // sans formule √(2 g d) liée à la gravité — sinon chaque changement de g casse le lancement.
        const tableSpan = Math.max(fsz.x, fsz.z, 120);
        let laneNorm = 0.42;
        if (launcherBBox) {
          const lb  = launcherBBox as THREE.Box3;
          const lsz = lb.getSize(new THREE.Vector3());
          const denom = launchAxis === 'x' ? lsz.x : lsz.z;
          laneNorm = launchDist / Math.max(denom, 1e-6);
        }
        laneNorm = THREE.MathUtils.clamp(laneNorm, 0.14, 1.05);
        launchSpeedBase = THREE.MathUtils.clamp(
          245 + 640 * laneNorm + tableSpan * 0.16,
          285,
          1180,
        );
        launchSpeedBase = Math.min(launchSpeedBase * 1.22, launchSpeedBase + 380);
        launchVelMag = launchSpeedBase;
        console.info(
          `[Physics] spawn=(${spawnX.toFixed(1)},${spawnY.toFixed(1)},${spawnZ.toFixed(1)}) axis=${launchAxis} ` +
          `launchDist=${launchDist.toFixed(1)} laneNorm=${laneNorm.toFixed(2)} launchSpeedBase=${launchSpeedBase.toFixed(1)} ` +
          `g=${PLAYFIELD_VERTICAL ? `-Z ${PHYS_GRAVITY_MAG}` : `-Y ${PHYS_GRAVITY_MAG}`} ballR=${ballRadius.toFixed(2)}`,
        );

        // Placer la bille au spawn en état endormi
        ballBody.position.set(spawnX, spawnY, spawnZ);
        ballBody.sleep();

        physicsReady = true;
        mountEl.focus();
        console.info('[Playfield] ✔ Physique initialisée — maintenir ESPACE, relâcher pour lancer.');
      } catch (err) {
        console.error('[Playfield] Erreur chargement :', err);
      }
    };

    void init();

    // ── Inputs ────────────────────────────────────────────────────────────────
    const onKeyDown = (e: KeyboardEvent) => {
      if (['ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
      if (e.repeat) return;
      if (e.key === 'ArrowLeft'  || e.key === 'q' || e.key === 'Q') leftTarget  = 1;
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') rightTarget = 1;
      if (e.key === ' ') {
        if (gameStateRef.current === 'game_over') {
          resetGame();
          return;
        }
        if (gameStateRef.current === 'idle' && physicsReady && ballBody) {
          isChargingPlunger = true;
          chargeStartTime   = performance.now();
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (['ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
      if (e.key === 'ArrowLeft'  || e.key === 'q' || e.key === 'Q') leftTarget  = 0;
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') rightTarget = 0;
      if (e.key === ' ' && gameStateRef.current === 'idle' && isChargingPlunger) {
        isChargingPlunger = false;
        if (!physicsReady || !ballBody || launchSpeedBase <= 0) return;
        const t =
          Math.min(1, (performance.now() - chargeStartTime) / PLUNGER_CHARGE_MS) ** 1.15;
        const factor =
          PLUNGER_MIN_FACTOR + (PLUNGER_MAX_FACTOR - PLUNGER_MIN_FACTOR) * t;
        launchVelMag = launchSpeedBase * factor;
        spawnBall();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup',   onKeyUp);

    // ── Sync d'un corps cinématique de flipper ────────────────────────────────
    /**
     * Copie le transform Three.js du flipper → corps Cannon.js cinématique.
     * Calcule la vélocité angulaire pour que Cannon.js transfère l'énergie à la bille.
     */
    const syncFlipperBody = (
      body:    CANNON.Body    | null,
      flipper: THREE.Object3D | null,
      swing:   number,
      prevSw:  number,
      dt:      number,
      side:    'left' | 'right',
    ) => {
      if (!body || !flipper) return;
      flipper.updateMatrixWorld(true);
      const wp = new THREE.Vector3();
      const wq = new THREE.Quaternion();
      flipper.getWorldPosition(wp);
      flipper.getWorldQuaternion(wq);
      body.position.set(wp.x, wp.y, wp.z);
      body.quaternion.set(wq.x, wq.y, wq.z, wq.w);
      const angVel = dt > 0 ? (swing - prevSw) / dt : 0;
      const sign   = side === 'left' ? 1 : -1;
      body.angularVelocity.set(0, angVel * sign, 0);
    };

    // ── Boucle de rendu ───────────────────────────────────────────────────────
    let frameId: number;

    const animate = (time: number) => {
      frameId = requestAnimationFrame(animate);

      const dt = prevFrameTime > 0 ? Math.min((time - prevFrameTime) / 1000, 0.05) : 0.016;
      prevFrameTime = time;

      // Pas physique
      if (physWorld) physWorld.step(FIXED_STEP, dt, MAX_SUB);

      // Pendant l’éjection : plateau horizontal → pas de vy parasite ; vertical → lancement pur +Z (vx,vy nuls)
      if (ballBody && ballMesh?.visible && gameStateRef.current === 'playing') {
        const bb = ballBody as CANNON.Body & { _launchSettle?: number };
        if ((bb._launchSettle ?? 0) > 0) {
          if (PLAYFIELD_VERTICAL) {
            ballBody.velocity.x = 0;
            ballBody.velocity.y = 0;
          } else {
            ballBody.velocity.y = 0;
          }
        }
      }

      // Flippers visuels
      leftSwing  += (leftTarget  * SWING_RAD - leftSwing)  * SWING_SMOOTH;
      rightSwing += (rightTarget * SWING_RAD - rightSwing) * SWING_SMOOTH;
      if (leftPivot)  leftPivot.rotation.y  =  leftSwing;
      if (rightPivot) rightPivot.rotation.y = -rightSwing;

      // Sync corps cinématiques
      syncFlipperBody(leftFlipperBody,  leftFlipperObj,  leftSwing,  prevLeftSwing,  dt, 'left');
      syncFlipperBody(rightFlipperBody, rightFlipperObj, rightSwing, prevRightSwing, dt, 'right');
      prevLeftSwing  = leftSwing;
      prevRightSwing = rightSwing;

      // Sync bille Three.js ← Cannon.js + détection drain
      if (ballBody && ballMesh && ballMesh.visible && gameStateRef.current === 'playing') {
        const { position: p, quaternion: q, velocity: v } = ballBody;

        const spd = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
        const bbAny = ballBody as CANNON.Body & {
          _prevSpd?: number;
          _stuckFc?: number;
          _launchSettle?: number;
        };
        const prevSpd = bbAny._prevSpd ?? 0;
        bbAny._prevSpd = spd;
        if ((bbAny._launchSettle ?? 0) > 0) bbAny._launchSettle!--;

        // Lissage des pics Trimesh (normales / triangles dégénérés)
        if (
          (bbAny._launchSettle ?? 0) <= 0 &&
          spd > prevSpd * 2.2 &&
          spd > 380 &&
          prevSpd > 2
        ) {
          const s = (prevSpd * 1.85) / spd;
          v.x *= s;
          v.y *= s;
          v.z *= s;
        }
        if ((bbAny._launchSettle ?? 0) <= 0 && spd > 2200) {
          const s = 2200 / spd;
          v.x *= s;
          v.y *= s;
          v.z *= s;
        }

        // Anti micro-saut (plateau horizontal uniquement ; en vertical la chute est sur Z)
        if (!PLAYFIELD_VERTICAL) {
          const restY = tableYPhys + ballRadius;
          const dy      = p.y - restY;
          const settle  = bbAny._launchSettle ?? 0;
          if (
            settle <= 0 &&
            Math.abs(v.x) < 72 &&
            Math.abs(v.z) < 72 &&
            spd < 360 &&
            dy > -ballRadius * 0.2 &&
            dy < ballRadius * 0.12 &&
            v.y > -26 &&
            v.y < 26
          ) {
            v.y *= 0.35;
            if (Math.abs(v.y) < 9) {
              v.y = 0;
              if (dy < ballRadius * 0.05) p.y = restY;
            }
          } else if (settle <= 0 && v.y > 360) {
            v.y *= 0.84;
          }

          if (p.y > ballCeilingY - 8) {
            p.y = Math.min(p.y, ballCeilingY - 4);
            if (v.y > 0) v.y *= 0.15;
          }
        } else if (ballCeilingZ < Infinity && p.z > ballCeilingZ - 6) {
          p.z = Math.min(p.z, ballCeilingZ - 3);
          if (v.z > 0) v.z *= 0.2;
        }

        // Réintégration du couloir : correction proportionnelle au dt (remplace +400/frame)
        const inLauncher =
          laneMinX < Infinity &&
          p.x >= laneMinX - ballRadius * 2 &&
          p.x <= laneMaxX + ballRadius * 2;
        if (!hasLeftLauncher && !inLauncher) hasLeftLauncher = true;
        if (hasLeftLauncher && inLauncher) {
          const reEnter = laneIsOnRight ? v.x > 5 : v.x < -5;
          if (reEnter) {
            const pushDir = laneIsOnRight ? -1 : 1;
            v.x += pushDir * 2400 * dt;
          }
        }

        // Débloquer les équilibres parasites (vitesse quasi nulle pendant longtemps)
        if (spd < 1.1) bbAny._stuckFc = (bbAny._stuckFc ?? 0) + 1;
        else bbAny._stuckFc = 0;
        if ((bbAny._stuckFc ?? 0) > 140 && spd < 0.65) {
          const j = 90;
          v.x += (Math.random() - 0.5) * j;
          v.z += (Math.random() - 0.5) * j;
          if (!PLAYFIELD_VERTICAL) {
            p.y = Math.max(p.y, tableYPhys + ballRadius * 1.01);
          }
          bbAny._stuckFc = 0;
        }

        ballMesh.position.set(p.x, p.y, p.z);
        ballMesh.quaternion.set(q.x, q.y, q.z, q.w);

        const pastDrain = drainAtMaxZ ? p.z > drainZ : p.z < drainZ;
        if (pastDrain) handleDrain();
      }

      renderer.render(scene, camera);
    };

    frameId = requestAnimationFrame(animate);

    // ── Resize ────────────────────────────────────────────────────────────────
    const handleResize = () => {
      if (!mountEl) return;
      const { clientWidth: w, clientHeight: h } = mountEl;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      camera.lookAt(cameraTarget);
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // ── Cleanup ───────────────────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize',   handleResize);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup',   onKeyUp);
      if (mountEl.contains(renderer.domElement)) mountEl.removeChild(renderer.domElement);
      if (playfieldRoot) modelRoot.remove(playfieldRoot);
      if (ballMesh) {
        scene.remove(ballMesh);
        ballMesh.geometry.dispose();
        (ballMesh.material as THREE.Material).dispose();
      }
      disposableGeos.forEach((g) => g.dispose());
      disposableMats.forEach((m) => m.dispose());
      renderer.dispose();
    };
  }, []);

  // ── JSX ───────────────────────────────────────────────────────────────────
  const hintLine =
    gameState === 'idle'
      ? '▶  Maintenir ESPACE — relâcher pour lancer'
      : gameState === 'game_over'
        ? 'ESPACE pour rejouer'
        : null;

  return (
    <div className="relative min-h-screen bg-black text-zinc-100">

      {/* ── HUD ─────────────────────────────────────────────────────────── */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between px-5 pt-4">

        {/* Score + vies */}
        <div className="font-mono space-y-1.5">
          <div className="text-3xl font-bold tabular-nums tracking-widest drop-shadow-[0_0_8px_rgba(255,180,0,0.6)]">
            {String(score).padStart(7, '0')}
          </div>
          <div className="flex gap-1.5 text-lg">
            {Array.from({ length: INITIAL_LIVES }).map((_, i) => (
              <span
                key={i}
                className="transition-opacity duration-300"
                style={{ opacity: i < lives ? 1 : 0.2 }}
              >
                ●
              </span>
            ))}
          </div>
        </div>

        {/* Raccourcis clavier */}
        <div className="text-right font-mono text-[10px] text-zinc-500 space-y-0.5 leading-relaxed">
          <div>Q / ← — Flipper gauche</div>
          <div>D / → — Flipper droit</div>
          <div>ESPACE — Charger / lancer</div>
        </div>
      </header>

      {/* ── Overlay état (idle / game_over) ─────────────────────────────── */}
      {(gameState === 'idle' || gameState === 'game_over') && (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-4">
          {gameState === 'game_over' && (
            <p className="font-mono text-4xl font-bold uppercase tracking-[0.25em] text-red-400 drop-shadow-[0_0_16px_rgba(239,68,68,0.8)]">
              Game Over
            </p>
          )}
          {hintLine && (
            <p className="animate-pulse font-mono text-sm uppercase tracking-[0.3em] text-zinc-400">
              {hintLine}
            </p>
          )}
        </div>
      )}

      {/* ── Canvas Three.js ─────────────────────────────────────────────── */}
      <main
        ref={mountRef}
        className="h-screen w-full cursor-grab outline-none focus:outline-none"
        tabIndex={0}
        aria-label="Terrain de flipper — Q/D ou ← → pour les flippers, maintenir ESPACE et relâcher pour lancer"
      />
    </div>
  );
}
