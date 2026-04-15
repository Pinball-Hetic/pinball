import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// ── Constants ──────────────────────────────────────────────────────────────────
const PLAYFIELD_URL      = '/playfield/playfield.glb';
const FLIPPER_LEFT_NAME  = 'flipper_leftglb';
const FLIPPER_RIGHT_NAME = 'flipper_rightglb';

/** Amplitude de battement des flippers (rad). */
const SWING_RAD = 0.65;
/** Lissage du mouvement des flippers (0 = instantané). */
const SWING_SMOOTH = 0.42;
/** Recul du pivot vers le centre de la palette (fraction de la largeur). */
const HINGE_INSET_FROM_EDGE = 0.18;

/** Pas physique fixe — substep court pour éviter le tunneling à haute vitesse. */
const FIXED_STEP = 1 / 240;
/** Nombre max de sous-pas par frame (4 substeps à 60fps = couverture complète). */
const MAX_SUB = 10;

const INITIAL_LIVES = 3;
const BUMPER_SCORE  = 100;

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
    let launchVelZ = 0;
    let drainZ     = Infinity;
    let drainAtMaxZ = true;
    let leftFlipperBody:  CANNON.Body | null = null;
    let rightFlipperBody: CANNON.Body | null = null;
    let prevFrameTime = 0;

    // ── Helpers de jeu ───────────────────────────────────────────────────────
    const updateGameState = (state: GameState) => {
      gameStateRef.current = state;
      setGameState(state);
    };

    const spawnBall = () => {
      if (!ballBody || !ballMesh) return;
      ballBody.position.set(spawnX, spawnY, spawnZ);
      ballBody.velocity.set(0, 0, launchVelZ);
      ballBody.angularVelocity.set(0, 0, 0);
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


        // Récupérer les flippers
        const leftFlipper  = playfieldRoot.getObjectByName(FLIPPER_LEFT_NAME)  ?? null;
        const rightFlipper = playfieldRoot.getObjectByName(FLIPPER_RIGHT_NAME) ?? null;
        if (!leftFlipper)  console.warn(`[Playfield] Introuvable : "${FLIPPER_LEFT_NAME}"`);
        if (!rightFlipper) console.warn(`[Playfield] Introuvable : "${FLIPPER_RIGHT_NAME}"`);

        // ① Centrer le modèle EN PREMIER — toutes les coordonnées ci-dessous seront centrées
        const tb = new THREE.Box3().setFromObject(modelRoot);
        modelRoot.position.sub(tb.getCenter(new THREE.Vector3()));
        modelRoot.updateMatrixWorld(true);

        // ② Sauvegarder les bbox des flippers APRÈS centrage (coordonnées physiques correctes)
        leftFlipper?.updateMatrixWorld(true);
        rightFlipper?.updateMatrixWorld(true);
        const leftFlipperBBox  = leftFlipper  ? new THREE.Box3().setFromObject(leftFlipper)  : null;
        const rightFlipperBBox = rightFlipper ? new THREE.Box3().setFromObject(rightFlipper) : null;

        // ③ Attacher les flippers à leurs pivots de charnière
        if (leftFlipper)  { leftPivot      = attachFlipperAtHinge(leftFlipper, 'left');   leftFlipperObj  = leftFlipper; }
        if (rightFlipper) { rightPivot     = attachFlipperAtHinge(rightFlipper, 'right'); rightFlipperObj = rightFlipper; }

        // ── Caméra ───────────────────────────────────────────────────────────
        const fb  = new THREE.Box3().setFromObject(modelRoot);
        const fc  = fb.getCenter(new THREE.Vector3());
        const fsz = fb.getSize(new THREE.Vector3());
        const maxS = Math.max(fsz.x, fsz.z);
        const fov  = (camera.fov * Math.PI) / 180;
        const dist = (maxS * 0.7) / Math.tan(fov / 2);
        camera.position.set(fc.x, fc.y + dist * 0.75, fc.z + dist * 0.55);
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

        const gravZ = drainAtMaxZ ? 500 : -500;
        physWorld = new CANNON.World({
          gravity: new CANNON.Vec3(0, -1200, gravZ),
        });
        physWorld.broadphase = new CANNON.SAPBroadphase(physWorld);
        physWorld.allowSleep  = true;

        // Matériaux de contact
        const ballMat    = new CANNON.Material('ball');
        const tableMat   = new CANNON.Material('table');
        const bumperMat  = new CANNON.Material('bumper');
        const flipperMat = new CANNON.Material('flipper');
        const wallMat    = new CANNON.Material('wall'); // murs périphériques — rebond plus vif que la table

        physWorld.addContactMaterial(new CANNON.ContactMaterial(ballMat, tableMat,   { friction: 0.1,  restitution: 0.02 }));
        physWorld.addContactMaterial(new CANNON.ContactMaterial(ballMat, bumperMat,  { friction: 0.0,  restitution: 0.45 }));
        physWorld.addContactMaterial(new CANNON.ContactMaterial(ballMat, flipperMat, { friction: 0.1,  restitution: 0.25 }));
        physWorld.addContactMaterial(new CANNON.ContactMaterial(ballMat, wallMat,    { friction: 0.02, restitution: 0.30 }));


        // Surface de jeu de référence = bas des flippers (utilisée pour spawn bille)
        const tableY = flipperRefBBox
          ? flipperRefBBox.min.y          // bas du flipper = surface de jeu
          : fb.min.y + fsz.y * 0.25;     // fallback si flippers introuvables

        console.info(`[Physics] tableY=${tableY.toFixed(3)}, fb.min.y=${fb.min.y.toFixed(3)}, fsz=${fsz.x.toFixed(2)}×${fsz.y.toFixed(2)}×${fsz.z.toFixed(2)}`);

        // Helpers de nom
        const isBumperName = (nameLC: string) =>
          nameLC.includes('bump') ||
          nameLC.includes('bumper') ||
          nameLC.includes('pop') ||
          nameLC.includes('kicker');

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
        const laneIsOnRight = laneWallFaceX > fc.x;

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
        const laneMinX = laneIsOnRight ? laneWallFaceX : fb.min.x;
        const laneMaxX = laneIsOnRight ? fb.max.x      : laneWallFaceX;

        const skipForTrimesh = (obj: THREE.Object3D): boolean => {
          const nameLC = obj.name.toLowerCase();
          if (nameLC.includes('flipper'))  return true;
          if (nameLC.includes('bump') || nameLC.includes('bumper') || nameLC.includes('pop')) return true;
          if (nameLC.includes('ball'))     return true;
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

        // Zone de drain : légèrement au-delà du bord côté flippers
        drainZ = drainAtMaxZ
          ? fb.max.z + ballRadius * 4
          : fb.min.z - ballRadius * 4;

        // #region agent log v23
        fetch('http://127.0.0.1:7386/ingest/1bbfc8c6-de63-478c-8ead-cebcbb8d6ffa',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4b9fd4'},body:JSON.stringify({sessionId:'4b9fd4',runId:'v23',location:'PinballPlayfield.tsx',message:'trimeshInit',data:{trimeshCount,totalTris:Math.round(totalTris),ballRadius:+ballRadius.toFixed(2),tableY,drainZ:+drainZ.toFixed(1),laneMinX:+laneMinX.toFixed(1),laneMaxX:+laneMaxX.toFixed(1),includedCount:includedNames.length,excludedCount:excludedNames.length,includedNames,excludedNames},timestamp:Date.now()})}).catch(()=>{});
        // #endregion

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
              // Impulsion calibrée pour mm : ~300 mm/s (≈ 0.3 m/s, flipper réaliste)
              const forceMag = ballRadius * 35;
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
          mass: 1,
          shape: new CANNON.Sphere(ballRadius),
          material: ballMat,
          linearDamping: 0.02,
          angularDamping: 0.05,
        });
        ballBody.allowSleep     = true;
        ballBody.sleepSpeedLimit = 0.1;
        ballBody.sleepTimeLimit  = 1;
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
        // Spawn au-dessus du flipper body (maxY) + marge d'un rayon
        const flipperBodyTopY = flipperRefBBox ? flipperRefBBox.max.y : tableY;
        spawnY = flipperBodyTopY + ballRadius * 2;
        spawnZ = drainAtMaxZ ? fb.max.z - fsz.z * 0.08 : fb.min.z + fsz.z * 0.08;

        // Vélocité de lancement : poussée horizontale sur l'axe Z uniquement
        // (pas de composante Y → la bille ne décolle pas de la table)
        // Formule physique : v_min = √(2·g·d) pour atteindre le haut contre la gravité Z.
        // On prend 1.6× ce minimum pour arriver avec de la vitesse résiduelle.
        const gravZAbs  = Math.abs(gravZ);
        const minLaunch = Math.sqrt(2 * gravZAbs * fsz.z);
        const launchSpeed = minLaunch * 1.3;
        launchVelZ = drainAtMaxZ ? -launchSpeed : launchSpeed;
        console.info(`[Physics] spawnY=${spawnY.toFixed(3)}, launchVelZ=${launchVelZ.toFixed(2)}, minLaunch=${minLaunch.toFixed(2)}, ballRadius=${ballRadius.toFixed(3)}`);

        // Placer la bille au spawn en état endormi
        ballBody.position.set(spawnX, spawnY, spawnZ);
        ballBody.sleep();

        mountEl.focus();
        console.info('[Playfield] ✔ Physique initialisée — appuyer sur ESPACE pour lancer.');
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
        if      (gameStateRef.current === 'idle')      spawnBall();
        else if (gameStateRef.current === 'game_over') resetGame();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (['ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
      if (e.key === 'ArrowLeft'  || e.key === 'q' || e.key === 'Q') leftTarget  = 0;
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') rightTarget = 0;
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
    ) => {
      if (!body || !flipper) return;
      flipper.updateMatrixWorld(true);
      const wp = new THREE.Vector3();
      const wq = new THREE.Quaternion();
      flipper.getWorldPosition(wp);
      flipper.getWorldQuaternion(wq);
      body.position.set(wp.x, wp.y, wp.z);
      body.quaternion.set(wq.x, wq.y, wq.z, wq.w);
      // Vitesse angulaire autour de Y → Cannon.js transfère l'élan à la bille au contact
      body.angularVelocity.set(0, dt > 0 ? (swing - prevSw) / dt : 0, 0);
    };

    // ── Boucle de rendu ───────────────────────────────────────────────────────
    let frameId: number;

    const animate = (time: number) => {
      frameId = requestAnimationFrame(animate);

      const dt = prevFrameTime > 0 ? Math.min((time - prevFrameTime) / 1000, 0.05) : 0.016;
      prevFrameTime = time;

      // Pas physique
      if (physWorld) physWorld.step(FIXED_STEP, dt, MAX_SUB);

      // Flippers visuels
      leftSwing  += (leftTarget  * SWING_RAD - leftSwing)  * SWING_SMOOTH;
      rightSwing += (rightTarget * SWING_RAD - rightSwing) * SWING_SMOOTH;
      if (leftPivot)  leftPivot.rotation.y  =  leftSwing;
      if (rightPivot) rightPivot.rotation.y = -rightSwing;

      // Sync corps cinématiques
      syncFlipperBody(leftFlipperBody,  leftFlipperObj,  leftSwing,  prevLeftSwing,  dt);
      syncFlipperBody(rightFlipperBody, rightFlipperObj, rightSwing, prevRightSwing, dt);
      prevLeftSwing  = leftSwing;
      prevRightSwing = rightSwing;

      // Sync bille Three.js ← Cannon.js + détection drain
      if (ballBody && ballMesh && ballMesh.visible && gameStateRef.current === 'playing') {
        const { position: p, quaternion: q, velocity: v } = ballBody;

        // #region agent log v24 spike-detect
        if(typeof (ballBody as any)._fc==='undefined'){(ballBody as any)._fc=0;(ballBody as any)._prevSpd=0;}
        const _fc=(ballBody as any)._fc++;
        const _spd=Math.sqrt(v.x*v.x+v.y*v.y+v.z*v.z);
        const _prev=(ballBody as any)._prevSpd as number;
        // Log spike : vitesse qui double en une frame (rebond anormal)
        if(_spd>_prev*2&&_spd>300){fetch('http://127.0.0.1:7386/ingest/1bbfc8c6-de63-478c-8ead-cebcbb8d6ffa',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4b9fd4'},body:JSON.stringify({sessionId:'4b9fd4',runId:'v24',hypothesisId:'H-spike',location:'PinballPlayfield.tsx:animate',message:'spike',data:{px:+p.x.toFixed(1),py:+p.y.toFixed(1),pz:+p.z.toFixed(1),prevSpd:+_prev.toFixed(1),newSpd:+_spd.toFixed(1),ratio:+(_spd/_prev).toFixed(2),vx:+v.x.toFixed(1),vy:+v.y.toFixed(1),vz:+v.z.toFixed(1),fc:_fc},timestamp:Date.now()})}).catch(()=>{});}
        (ballBody as any)._prevSpd=_spd;
        // Log every 60 frames
        if(_fc%60===0){fetch('http://127.0.0.1:7386/ingest/1bbfc8c6-de63-478c-8ead-cebcbb8d6ffa',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4b9fd4'},body:JSON.stringify({sessionId:'4b9fd4',runId:'v24',location:'PinballPlayfield.tsx:animate',message:'ball',data:{px:+p.x.toFixed(1),py:+p.y.toFixed(1),pz:+p.z.toFixed(1),spd:+_spd.toFixed(1),fc:_fc},timestamp:Date.now()})}).catch(()=>{});}
        // Velocity cap : empêche les rebonds Trimesh abusifs (> 2000 mm/s)
        const MAX_SPD = 2000;
        if(_spd>MAX_SPD){const s=MAX_SPD/_spd;v.x*=s;v.y*=s;v.z*=s;}
        // #endregion

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
    gameState === 'idle'      ? '▶  ESPACE pour lancer la bille' :
    gameState === 'game_over' ? 'ESPACE pour rejouer'             : null;

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
          <div>ESPACE — Lancer</div>
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
        aria-label="Terrain de flipper — Q/D ou ← → pour les flippers, ESPACE pour lancer"
      />
    </div>
  );
}
