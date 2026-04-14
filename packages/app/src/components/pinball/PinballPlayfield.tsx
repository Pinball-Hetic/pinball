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

/** Pas physique fixe — évite le tunneling. */
const FIXED_STEP = 1 / 60;
/** Nombre max de sous-pas par frame. */
const MAX_SUB = 3;

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

        const gravZ = drainAtMaxZ ? 1.5 : -1.5;
        physWorld = new CANNON.World({
          gravity: new CANNON.Vec3(0, -9.75, gravZ),
        });
        physWorld.broadphase = new CANNON.SAPBroadphase(physWorld);
        physWorld.allowSleep  = true;

        // Matériaux de contact
        const ballMat    = new CANNON.Material('ball');
        const tableMat   = new CANNON.Material('table');
        const bumperMat  = new CANNON.Material('bumper');
        const flipperMat = new CANNON.Material('flipper');

        physWorld.addContactMaterial(new CANNON.ContactMaterial(ballMat, tableMat,   { friction: 0.2,  restitution: 0.4  }));
        physWorld.addContactMaterial(new CANNON.ContactMaterial(ballMat, bumperMat,  { friction: 0.0,  restitution: 0.85 }));
        physWorld.addContactMaterial(new CANNON.ContactMaterial(ballMat, flipperMat, { friction: 0.1,  restitution: 0.55 }));

        const wt = fsz.x * 0.04; // épaisseur des murs physiques

        // Surface de jeu réelle = bas des flippers (pas fb.min.y qui inclut les pieds/structure)
        const tableY = flipperRefBBox
          ? flipperRefBBox.min.y          // bas du flipper = surface de jeu
          : fb.min.y + fsz.y * 0.25;     // fallback si flippers introuvables

        console.info(`[Physics] tableY=${tableY.toFixed(3)}, fb.min.y=${fb.min.y.toFixed(3)}, fsz=${fsz.x.toFixed(2)}×${fsz.y.toFixed(2)}×${fsz.z.toFixed(2)}`);

        // Sol : centré sur tableY, assez épais pour éviter le tunneling
        const floor = new CANNON.Body({ mass: 0, material: tableMat });
        floor.addShape(new CANNON.Box(new CANNON.Vec3(fsz.x / 2 + wt, wt, fsz.z / 2 + wt)));
        floor.position.set(fc.x, tableY - wt, fc.z);
        physWorld.addBody(floor);

        // Mur gauche
        const wallL = new CANNON.Body({ mass: 0, material: tableMat });
        wallL.addShape(new CANNON.Box(new CANNON.Vec3(wt, fsz.y + 1, fsz.z / 2 + wt)));
        wallL.position.set(fb.min.x - wt, fc.y, fc.z);
        physWorld.addBody(wallL);

        // Mur droit
        const wallR = new CANNON.Body({ mass: 0, material: tableMat });
        wallR.addShape(new CANNON.Box(new CANNON.Vec3(wt, fsz.y + 1, fsz.z / 2 + wt)));
        wallR.position.set(fb.max.x + wt, fc.y, fc.z);
        physWorld.addBody(wallR);

        // Mur du fond (haut de la table, côté opposé aux flippers)
        const backZ = drainAtMaxZ ? fb.min.z : fb.max.z;
        const wallBack = new CANNON.Body({ mass: 0, material: tableMat });
        wallBack.addShape(new CANNON.Box(new CANNON.Vec3(fsz.x / 2 + wt * 2, fsz.y + 1, wt)));
        wallBack.position.set(fc.x, fc.y, backZ + (drainAtMaxZ ? -wt : wt));
        physWorld.addBody(wallBack);

        // Zone de drain : légèrement au-delà du bord côté flippers
        drainZ = drainAtMaxZ
          ? fb.max.z + fsz.z * 0.06
          : fb.min.z - fsz.z * 0.06;

        // ── Bumpers ──────────────────────────────────────────────────────────
        let bumpersFound = 0;
        modelRoot.traverse((obj) => {
          if (!(obj instanceof THREE.Mesh)) return;
          if (!obj.name.toLowerCase().includes('bump')) return;

          obj.updateMatrixWorld(true);
          const bb  = new THREE.Box3().setFromObject(obj);
          const bc  = bb.getCenter(new THREE.Vector3());
          const bs  = bb.getSize(new THREE.Vector3());
          const rad = Math.max(bs.x, bs.z) / 2;
          const h   = Math.max(bs.y, rad * 0.5);

          const bumperBody = new CANNON.Body({ mass: 0, material: bumperMat });
          bumperBody.addShape(new CANNON.Cylinder(rad, rad, h, 8));
          bumperBody.position.set(bc.x, bc.y, bc.z);
          physWorld!.addBody(bumperBody);

          // Collision : impulsion radiale + score
          bumperBody.addEventListener('collide', (event: { body: CANNON.Body }) => {
            const other = event.body;
            const dx  = other.position.x - bumperBody.position.x;
            const dz  = other.position.z - bumperBody.position.z;
            const len = Math.sqrt(dx * dx + dz * dz);
            if (len > 0) {
              const forceMag = fsz.x * 2.5;
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
          console.warn('[Physics] Aucun bumper trouvé (objets dont le nom contient "bump"). Vérifier le GLTF.');
        } else {
          console.info(`[Physics] ${bumpersFound} bumper(s) détecté(s).`);
        }

        // ── Corps cinématiques des flippers ──────────────────────────────────
        // KINEMATIC = 4 dans cannon-es (CANNON.Body.KINEMATIC)
        const KINEMATIC = 4 as const;

        const makeFlipperBody = (bbox: THREE.Box3 | null): CANNON.Body | null => {
          if (!bbox) return null;
          const sz = bbox.getSize(new THREE.Vector3());
          const cx = bbox.getCenter(new THREE.Vector3());
          const body = new CANNON.Body({ mass: 0, type: KINEMATIC, material: flipperMat });
          // On garantit une épaisseur minimum pour détecter les collisions
          body.addShape(
            new CANNON.Box(new CANNON.Vec3(sz.x / 2, Math.max(sz.y / 2, wt), sz.z / 2)),
          );
          body.position.set(cx.x, cx.y, cx.z);
          physWorld!.addBody(body);
          return body;
        };

        leftFlipperBody  = makeFlipperBody(leftFlipperBBox);
        rightFlipperBody = makeFlipperBody(rightFlipperBBox);

        // ── Bille ─────────────────────────────────────────────────────────────
        // Rayon basé sur la taille du flipper (référence réaliste) :
        // un vrai flipper fait ~80 mm, une vraie bille ~27 mm → bille ≈ flipper_longueur / 6
        if (flipperRefBBox) {
          const flipSz = flipperRefBBox.getSize(new THREE.Vector3());
          const flipLen = Math.max(flipSz.x, flipSz.z); // longueur = plus grande dim horizontale
          ballRadius = flipLen / 6;
        } else {
          ballRadius = fsz.x / 40; // fallback conservateur
        }
        console.info(`[Physics] ballRadius=${ballRadius.toFixed(4)}`);

        ballBody = new CANNON.Body({
          mass: 1,
          shape: new CANNON.Sphere(ballRadius),
          material: ballMat,
          linearDamping: 0.05,
          angularDamping: 0.4,
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

        // Spawn : lane droite, ON the surface de jeu (tableY + ballRadius)
        spawnX = fb.max.x - ballRadius * 3;
        spawnY = tableY + ballRadius + ballRadius * 0.1; // bille posée sur la surface
        spawnZ = drainAtMaxZ ? fb.max.z - fsz.z * 0.1 : fb.min.z + fsz.z * 0.1;

        // Vélocité de lancement vers le haut de la table (opposé au drain)
        // sqrt(2 * gravZ * fsz.z) = vitesse minimale pour traverser la table × 1.5
        const minLaunch = Math.sqrt(2 * 1.5 * fsz.z);
        launchVelZ = drainAtMaxZ ? -(minLaunch * 1.5) : (minLaunch * 1.5);
        console.info(`[Physics] spawnY=${spawnY.toFixed(3)}, launchVelZ=${launchVelZ.toFixed(2)}`);

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
        const { position: p, quaternion: q } = ballBody;
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
