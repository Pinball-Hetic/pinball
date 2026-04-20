import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// ── Constants ──────────────────────────────────────────────────────────────────
const PLAYFIELD_URL      = '/playfield/pinball-machine.glb';
// Modèle Sketchfab "Pinball Machine" par Ranguel (CC Attribution)
// Le GLB expose un seul nœud "flipper" (mesh combiné gauche+droite).
// Le GLB n’a qu’un nœud « flipper » ; split + deux pivots en font gauche / droite.
const FLIPPER_LEFT_NAME = 'flipper';

/** Amplitude de battement des flippers (rad). */
const SWING_RAD = 0.65;
/** Lissage du mouvement des flippers (0 = instantané). */
const SWING_SMOOTH = 0.42;
/** Recul du pivot vers le centre de la palette (fraction de la largeur). */
const HINGE_INSET_FROM_EDGE = 0.18;

const FIXED_STEP = 1 / 720;
const MAX_SUB    = 52;

const INITIAL_LIVES = 3;
const BUMPER_SCORE  = 100;

/** Durée max de charge du plongeur (ms) — relâcher Espace lance. */
const PLUNGER_CHARGE_MS = 1800;
/** Facteur vitesse min / max selon la charge (évite un tap trop faible). */
const PLUNGER_MIN_FACTOR = 0.38;
/** Plafond relatif charge max : évite les lancers trop violents au clavier. */
const PLUNGER_MAX_FACTOR = 0.82;
/** Raideur du ressort (cible = tirage max progressif pendant ESPACE). */
const PLUNGER_SPRING_K = 3400;
/** Amortissement du ressort (réduit le rebond sur les butées 0 / max tirage). */
const PLUNGER_SPRING_C = 92;
/** Contribution de la vitesse du ressort au module de lancement au relâchement. */
const PLUNGER_LAUNCH_VS_GAIN = 0.52;
/** Multiplicateur global au lancement (compense gravité forte + friction rail). */
const PLUNGER_LAUNCH_MULTIPLIER = 2.15;
/** Impulsion supplémentaire suivant « le haut » du plateau (−gravité), selon la charge (0–1). */
const PLUNGER_UP_BOOST = 920;
/** Coup supplémentaire le long du couloir (unités/s, échelle charge) pour franchir tout le rail. */
const PLUNGER_CORRIDOR_SPEED = 280;
/** Vitesse minimale (module) à la sortie du couloir — sinon la gravité (~275) étouffe le tir vers le haut. */
const PLUNGER_MIN_EXIT_SPEED = 395;

/** Masse Cannon de la bille — identique en dynamique après phase cinématique au plongeur. */
const BALL_PHYS_MASS = 0.09;

/**
 * Plateau « vertical » (mur de flipper) : on tourne le GLB (plateau horizontal dans le fichier)
 * puis gravité monde sur **-Y** : avec une normale de tapis ~+Z après rotation, « -Z seul » est **normal** au mur
 * → pas de composante tangentielle → la bille ne roule pas). La vitesse initiale reste un vecteur 3D vers le terrain.
 * Sinon : plateau horizontal classique, gravité **-Y**.
 */
const PLAYFIELD_VERTICAL = true;

/** Module de la gravité monde (|-Y|). */
const PHYS_GRAVITY_MAG = 275;

/**
 * Rayon min = fraction de la plus petite dimension du plateau (après centrage du GLB).
 * Si on ne fait que « flipLen/10 », un bbox flipper trop petit donne une bille microscopique :
 * quasi invisible et contacts Trimesh instables → impression que la bille ne bouge pas.
 */
const MIN_BALL_RADIUS_FOOTPRINT_FRAC = 0.019;

/**
 * Borne inférieure **relative** au plateau : le min en « unités monde » était neutralisé par le plafond
 * `tableFootprint * MAX_…` — sur un GLB petit en unités la bille devenait sub-pixel/invisible.
 */
const MIN_BALL_RADIUS_CLAMP_FRAC = 0.022;

/** Plafond relatif — bille pas disproportionnée si bbox flipper est aberrante. */
const MAX_BALL_RADIUS_FOOTPRINT_FRAC = 0.065;

/** Référence pour impulsions arcade (bumpers). */
const ARCADE_IMPULSE_REF = 520;

/** Évite setState / respawn en rafale si la bille reste dans la zone drain plusieurs frames. */
const DRAIN_COOLDOWN_MS = 320;

const PINBALL_BOUND_REST = 0.42;
const PINBALL_MAX_SPEED = 920;
const PLUNGER_BURST_MAX_SPEED = 520;
const GUIDE_LAUNCH_MS = 620;
const GUIDE_LAUNCH_SPEED = 418;

/** Réduit un intervalle [lo,hi] d’une marge ; si trop étroit, retourne le centre. */
function clampAxisWithPad(lo: number, hi: number, pad: number): { min: number; max: number } {
  let a = lo + pad;
  let b = hi - pad;
  if (a <= b) return { min: a, max: b };
  const m = (lo + hi) / 2;
  return { min: m, max: m };
}

/** Marge rayon + petit jeu pour que le centre de la sphère reste dans le volume jouable (GLB). */
function ballKeepInsidePad(r: number) {
  return r * 1.14 + 0.001;
}

/**
 * Rétrécit une AABB vers son centre : l’AABB du GLB entier a des « coins » vides une fois la machine pivotée ;
 * on resserre surtout X/Z pour rester **sur** le jeu.
 */
function shrinkWorldAabbTowardCenter(box: THREE.Box3, factor: number): THREE.Box3 {
  const c    = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const hx   = (size.x * factor) / 2;
  const hy   = (size.y * factor) / 2;
  const hz   = (size.z * factor) / 2;
  const out  = new THREE.Box3();
  out.min.set(c.x - hx, c.y - hy, c.z - hz);
  out.max.set(c.x + hx, c.y + hy, c.z + hz);
  return out;
}

/**
 * Centre de la sphère sur le mesh plateau (raycast monde).
 * On **rejette** les impacts hors d’une AABB resserrée sur le GLB : sinon le premier triangle
 * touche souvent le socle / le décor / un flanc → bille dans le vide (en bas à droite, etc.).
 */
function sampleBallCenterOnPlayfieldSurface(
  playfieldRoot: THREE.Object3D,
  ballRadius: number,
  worldX: number,
  worldZ: number,
  verticalCabinet: boolean,
  raySkyY: number,
  rayFrontZ: number,
  anchorY: number,
): THREE.Vector3 | null {
  playfieldRoot.updateMatrixWorld(true);
  const fullBb = new THREE.Box3().setFromObject(playfieldRoot);
  /** Zone impact : ni trop large (socle), ni trop étroit (aucun triangle accepté → pas de snap). */
  const hitValidRegion = shrinkWorldAabbTowardCenter(fullBb, 0.86);

  const rc       = new THREE.Raycaster();
  const nWorld   = new THREE.Vector3();
  const upAgainstGrav = verticalCabinet
    ? new THREE.Vector3(0, 0, 1)
    : new THREE.Vector3(0, 1, 0);

  /** Surface « jouable » : après rotation du GLB le tapis peut avoir une normale ~+Y ou ~+Z monde. */
  const acceptPlayfieldNormal = (): boolean => {
    if (!verticalCabinet) return nWorld.dot(upAgainstGrav) >= 0.22;
    const towardZ = nWorld.dot(upAgainstGrav);
    const towardY = Math.abs(nWorld.y);
    const upY = nWorld.dot(new THREE.Vector3(0, 1, 0));
    return towardZ >= 0.12 || towardY >= 0.38 || upY >= 0.14;
  };

  const centerFromHit = (h: THREE.Intersection): THREE.Vector3 | null => {
    const nl = h.face?.normal;
    if (!nl) return null;
    const mesh = h.object as THREE.Mesh;
    const tag = mesh.name.toLowerCase();
    if (tag.includes('glass')) return null;
    nWorld.copy(nl).transformDirection(mesh.matrixWorld).normalize();
    if (!acceptPlayfieldNormal()) return null;
    return h.point.clone().addScaledVector(nWorld, ballRadius);
  };

  const tryRay = (origin: THREE.Vector3, dir: THREE.Vector3): THREE.Vector3 | null => {
    rc.set(origin, dir);
    const hits = rc.intersectObject(playfieldRoot, true);
    for (const h of hits) {
      if (!hitValidRegion.containsPoint(h.point)) continue;
      const c = centerFromHit(h);
      if (c) return c;
    }
    // Second passage : région élargie + même logique normale (souvent nécessaire en cabinet vertical).
    const looseRegion = shrinkWorldAabbTowardCenter(fullBb, 0.92);
    let best: THREE.Vector3 | null = null;
    let bestD2 = Infinity;
    for (const h of hits) {
      if (!looseRegion.containsPoint(h.point)) continue;
      const c = centerFromHit(h);
      if (!c) continue;
      const dx = h.point.x - worldX;
      const dz = h.point.z - worldZ;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = c;
      }
    }
    return best;
  };

  let p = tryRay(new THREE.Vector3(worldX, raySkyY, worldZ), new THREE.Vector3(0, -1, 0));
  if (!p && verticalCabinet) {
    p = tryRay(new THREE.Vector3(worldX, anchorY, rayFrontZ), new THREE.Vector3(0, 0, -1));
  }
  return p;
}

/** Corps dynamique bille (`CANNON.Sphere`), même monde que le plateau Trimesh / bumpers / flippers. */
function buildPinballBallBody(
  world: CANNON.World,
  ballMat: CANNON.Material,
  radius: number,
): CANNON.Body {
  const body = new CANNON.Body({
    mass:           BALL_PHYS_MASS,
    shape:          new CANNON.Sphere(radius),
    material:       ballMat,
    linearDamping:  0.038,
    angularDamping: 0.095,
  });
  body.allowSleep = false;
  world.addBody(body);
  return body;
}

function enforcePinballXYZConstraints(
  ballBody: CANNON.Body | null,
  pinBallConstraintReady: boolean,
  gameStatePlaying: boolean,
  pinBallMin: THREE.Vector3,
  pinBallMax: THREE.Vector3,
  verticalCabinet: boolean,
): void {
  if (!pinBallConstraintReady || !ballBody || !gameStatePlaying) return;
  const p = ballBody.position;
  const v = ballBody.velocity;
  const rest = PINBALL_BOUND_REST;
  const edgeRestX = verticalCabinet ? Math.min(rest + 0.34, 0.82) : rest;

  if (p.x < pinBallMin.x) {
    p.x = pinBallMin.x;
    if (v.x < 0) v.x *= -edgeRestX;
  } else if (p.x > pinBallMax.x) {
    p.x = pinBallMax.x;
    if (v.x > 0) v.x *= -edgeRestX;
  }
  if (!verticalCabinet) {
    if (p.y < pinBallMin.y) {
      p.y = pinBallMin.y;
      if (v.y < 0) v.y *= -rest;
    } else if (p.y > pinBallMax.y) {
      p.y = pinBallMax.y;
      if (v.y > 0) v.y *= -rest;
    }
  } else if (p.y > pinBallMax.y) {
    p.y = pinBallMax.y;
    if (v.y > 0) v.y *= -rest;
  }
  if (!verticalCabinet) {
    if (p.z < pinBallMin.z) {
      p.z = pinBallMin.z;
      if (v.z < 0) v.z *= -rest;
    } else if (p.z > pinBallMax.z) {
      p.z = pinBallMax.z;
      if (v.z > 0) v.z *= -rest;
    }
  } else {
    const rz = Math.min(rest + 0.22, 0.72);
    if (p.z < pinBallMin.z) {
      p.z = pinBallMin.z;
      if (v.z < 0) v.z *= -rz;
    } else if (p.z > pinBallMax.z) {
      p.z = pinBallMax.z;
      if (v.z > 0) v.z *= -rz;
    }
  }

  const spd = Math.hypot(v.x, v.y, v.z);
  if (spd > PINBALL_MAX_SPEED) {
    const s = PINBALL_MAX_SPEED / spd;
    v.x *= s;
    v.y *= s;
    v.z *= s;
  }
}

// ── GLTF / décor : masquer billes embarquées ─────────────────────────────────

/**
 * Masque les billes/sphères décoratives du GLB (réserve, preview…).
 * La seule bille jouable est la sphère ajoutée en code (`pinball_ball`) ; sinon on voit des doublons
 * et une « bille » qui flotte hors du plateau pendant que Cannon déplace la vraie.
 */
function hideEmbeddedGltfBallDecor(root: THREE.Object3D, fsz: THREE.Vector3) {
  const footprint       = Math.min(fsz.x, fsz.y, fsz.z);
  const maxDecorSphere  = footprint * 0.072;

  root.updateMatrixWorld(true);
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;

    let p: THREE.Object3D | null = child;
    for (let d = 0; d < 10 && p; d++, p = p.parent) {
      const n = p.name.toLowerCase();
      if (n.includes('bump') || n.includes('bumper')) return;
      if (n.includes('flipper')) return;
    }

    const nameLC = child.name.toLowerCase();
    if (nameLC.includes('bearing')) return;

    let hide = false;
    if (
      nameLC.includes('ball')
      || /\bsphere\b/i.test(child.name)
      || /^sphere[\s_.-]*\d*$/i.test(child.name.trim())
    ) {
      hide = true;
    }

    if (!hide && child.geometry instanceof THREE.SphereGeometry) {
      child.updateMatrixWorld(true);
      const bb = new THREE.Box3().setFromObject(child);
      const sz = bb.getSize(new THREE.Vector3());
      const maxDim = Math.max(sz.x, sz.y, sz.z);
      if (maxDim > 1e-9 && maxDim <= maxDecorSphere) hide = true;
    }

    // Billes décoratives souvent en icosaèdre / octaèdre (pas SphereGeometry)
    if (!hide) {
      const g = child.geometry;
      if (
        g instanceof THREE.IcosahedronGeometry
        || g instanceof THREE.OctahedronGeometry
      ) {
        child.updateMatrixWorld(true);
        const bb = new THREE.Box3().setFromObject(child);
        const sz = bb.getSize(new THREE.Vector3());
        const maxDim = Math.max(sz.x, sz.y, sz.z);
        if (maxDim > 1e-9 && maxDim <= maxDecorSphere * 4.5) hide = true;
      }
    }

    if (hide) child.visible = false;
  });
}

/**
 * Masque les sphères résiduelles Sketchfab (souvent rose/blanc hors plateau) —
 * second passage plus large que `hideEmbeddedGltfBallDecor`.
 */
function hideStrayBallMeshesFromGltf(playfieldRoot: THREE.Object3D, tableSpan: number) {
  const maxDimHide = Math.max(tableSpan * 0.2, 72);
  /** Billes décor Sketchfab « taille joueur » hors du tube pinball_ball — masquer même si > maxDimHide. */
  const decorBallMaxDim = Math.max(tableSpan * 0.48, 180);
  playfieldRoot.updateMatrixWorld(true);
  playfieldRoot.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    if (obj.name === 'pinball_ball') return;

    /** Toute sphère brute du GLB hors notre mesh jouable → doublons visibles dans le vide. */
    const g0 = obj.geometry;
    if (g0 instanceof THREE.SphereGeometry) {
      obj.visible = false;
      return;
    }

    let q: THREE.Object3D | null = obj;
    for (let d = 0; d < 14 && q; d++, q = q.parent) {
      const n = q.name.toLowerCase();
      if (n.includes('bump') || n.includes('bumper')) return;
      if (n.includes('flipper')) return;
      if (n.includes('glass')) return;
    }

    obj.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(obj);
    const sz = bb.getSize(new THREE.Vector3());
    const md = Math.max(sz.x, sz.y, sz.z);

    const nameLC = obj.name.toLowerCase();
    const g      = obj.geometry;
    const ballLike =
      nameLC.includes('ball')
      || /\bsphere\b/i.test(nameLC)
      || g instanceof THREE.SphereGeometry
      || g instanceof THREE.IcosahedronGeometry
      || g instanceof THREE.OctahedronGeometry;

    if (ballLike && md <= decorBallMaxDim && md > 1e-9) {
      obj.visible = false;
      return;
    }

    if (md > maxDimHide || md < 1e-9) return;

    if (ballLike) obj.visible = false;
  });
}

// ── Rendu Three.js : mesh bille (Cannon reste la vérité sur la pose monde) ───

/** Mesh de la bille : position = copie du corps Cannon après contraintes. */
function buildPinballBallMesh(radius: number): { mesh: THREE.Mesh; stripeTexture: THREE.CanvasTexture } {
  const stripeCv = document.createElement('canvas');
  stripeCv.width = 128;
  stripeCv.height = 64;
  const sctx = stripeCv.getContext('2d');
  if (sctx) {
    sctx.fillStyle = '#dde4ee';
    sctx.fillRect(0, 0, 128, 64);
    sctx.fillStyle = '#2a3544';
    for (let row = 0; row < 64; row += 10) sctx.fillRect(0, row, 128, 4);
  }
  const stripeTexture = new THREE.CanvasTexture(stripeCv);
  stripeTexture.wrapS = THREE.RepeatWrapping;
  stripeTexture.wrapT = THREE.RepeatWrapping;
  stripeTexture.anisotropy = 4;

  const ballGeo       = new THREE.SphereGeometry(radius, 32, 32);
  // MeshBasic : visible même si l’éclairage ou le offset depth rate la sphère ; la physique garde `radius`.
  const ballVisualMat = new THREE.MeshBasicMaterial({
    map: stripeTexture,
    // Contraste fort : lisible sur le plateau ; sans depthTest la bille reste visible derrière la vitre GLB.
    color:      0xffaa33,
    depthTest:  false,
    depthWrite: false,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(ballGeo, ballVisualMat);
  mesh.name        = 'pinball_ball';
  mesh.castShadow  = false;
  mesh.receiveShadow = false;
  mesh.visible     = false;
  mesh.frustumCulled = false;
  mesh.renderOrder = 999;
  return { mesh, stripeTexture };
}

// ── Types ──────────────────────────────────────────────────────────────────────
type GameState = 'idle' | 'playing';

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
  /** Incrémenté à chaque cleanup : invalide tout `init()` async encore en cours (Strict Mode + navigation). */
  const playfieldInitGenRef = useRef(0);

  useEffect(() => {
    const mountEl = mountRef.current;
    if (!mountEl) return;

    const initGen = ++playfieldInitGenRef.current;

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

    /** Rayons pour `sampleBallCenterOnPlayfieldSurface` (calibrés sur la bbox du GLB après centrage). */
    let raySkyY = 8e5;
    let rayFrontZ = 8e5;
    let rayAnchorY = 0;

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
    /** Module de vitesse au lancement (relâcher ESPACE → lancer). */
    let launchVelMag = 0;
    /** Couloir surtout le long de X (vers le terrain) ou de Z (vers le haut du plateau). */
    let launchAxis: 'x' | 'z' = 'z';
    /** Direction monde normalisée du plongeur (doit inclure Y en vertical : plateau pivoté). */
    let launchDirX = 0;
    let launchDirY = 0;
    let launchDirZ = 1;
    let drainZ      = Infinity;
    /** Seuil bas : avec gravité -Y (cabinet vertical), drain quand la bille passe sous les flippers. */
    let drainMinY   = -Infinity;
    /** Point de référence (souvent centre flippers XZ) pour le test drain le long de `gravityDir`. */
    let drainRefX = 0;
    let drainRefY = -Infinity;
    let drainRefZ = 0;
    /** Direction monde **unitaire** de la gravité (Cannon `world.gravity` / |g|). */
    let gravityDirX = 0;
    let gravityDirY = -1;
    let gravityDirZ = 0;
    let drainAtMaxZ = true;
    let leftFlipperBody:  CANNON.Body | null = null;
    let rightFlipperBody: CANNON.Body | null = null;
    let prevFrameTime = 0;
    let laneMinX = Infinity;   // seuil X du couloir lanceur (set lors de l'init)
    let laneMaxX = Infinity;
    /** Bbox stricte du lanceur (≠ laneMinX/laneMaxX qui couvrent une demi-table). */
    let launcherXM0 = Infinity, launcherXM1 = -Infinity;
    let launcherZM0 = Infinity, launcherZM1 = -Infinity;
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
    let ballStripeTexture: THREE.CanvasTexture | null = null;
    let lastDrainAt = 0;
    /** Surface `rollSurfaceY` (avant échantillon raycast) pour repli. */
    let rollSurfaceYRef = 0;
    /** Repos plongeur (bas du couloir) + direction de **tirage** (opposée au lancement vers le plateau). */
    let plungerRestX = 0;
    let plungerRestY = 0;
    let plungerRestZ = 0;
    let pullDirX = 0;
    let pullDirY = 0;
    let pullDirZ = 1;
    let launchLaneFwdX = 0;
    let launchLaneFwdY = 0;
    let launchLaneFwdZ = 1;
    /** Déplacement max le long du couloir pendant la charge (unités monde). */
    let maxPlungerPull = 0;
    /** Compression du ressort le long de `pullDir` (0 = repos, jusqu’à `maxPlungerPull`). */
    let plungerCompression = 0;
    /** Vitesse scalaire de compression / détente (unités monde / s). */
    let plungerCompressionVel = 0;
    /** Tige plongeur (purement visuelle, suit le ressort). */
    let plungerRodMesh: THREE.Mesh | null = null;

    /** Boîte monde étendue (clamp physique large, inclut extension Z vers drain pour collisions). */
    const cabinetClampMin = new THREE.Vector3();
    const cabinetClampMax = new THREE.Vector3();
    let cabinetClampReady = false;
    const pinBallMin = new THREE.Vector3();
    const pinBallMax = new THREE.Vector3();
    let pinBallConstraintReady = false;
    const recoveryClampMin = new THREE.Vector3();
    const recoveryClampMax = new THREE.Vector3();
    let recoveryReady = false;

    const modelShellMin = new THREE.Vector3();
    const modelShellMax = new THREE.Vector3();
    let modelShellReady = false;

    const clampBallInsideModelShell = () => {
      if (!modelShellReady || !ballBody || gameStateRef.current !== 'playing') return;
      const p = ballBody.position;
      const v = ballBody.velocity;
      const damp = 0.38;

      if (p.x < modelShellMin.x) {
        p.x = modelShellMin.x;
        if (v.x < 0) v.x *= -damp;
      } else if (p.x > modelShellMax.x) {
        p.x = modelShellMax.x;
        if (v.x > 0) v.x *= -damp;
      }
      if (p.y < modelShellMin.y) {
        p.y = modelShellMin.y;
        if (v.y < 0) v.y *= -damp;
      } else if (p.y > modelShellMax.y) {
        p.y = modelShellMax.y;
        if (v.y > 0) v.y *= -damp;
      }
      if (p.z < modelShellMin.z) {
        p.z = modelShellMin.z;
        if (v.z < 0) v.z *= -damp;
      } else if (p.z > modelShellMax.z) {
        p.z = modelShellMax.z;
        if (v.z > 0) v.z *= -damp;
      }
    };

    // ── Helpers de jeu ───────────────────────────────────────────────────────
    const updateGameState = (state: GameState) => {
      gameStateRef.current = state;
      setGameState(state);
    };

    const plungerFactorFromCharge01 = (charge01: number) => {
      const t = Math.min(1, charge01) ** 1.15;
      return PLUNGER_MIN_FACTOR + (PLUNGER_MAX_FACTOR - PLUNGER_MIN_FACTOR) * t;
    };

    /** Aligne le centre physique sur la surface du plateau (GLB), puis reclamp pinball. */
    const snapBallCenterToPlayfieldMesh = () => {
      if (!ballBody) return;
      if (!playfieldRoot) {
        ballBody.position.y = rollSurfaceYRef + ballRadius;
        return;
      }
      let sx = ballBody.position.x;
      let sz = ballBody.position.z;
      if (pinBallConstraintReady) {
        sx = THREE.MathUtils.clamp(sx, pinBallMin.x, pinBallMax.x);
        sz = THREE.MathUtils.clamp(sz, pinBallMin.z, pinBallMax.z);
      }
      let sampled = sampleBallCenterOnPlayfieldSurface(
        playfieldRoot,
        ballRadius,
        sx,
        sz,
        PLAYFIELD_VERTICAL,
        raySkyY,
        rayFrontZ,
        rayAnchorY,
      );
      if (!sampled && pinBallConstraintReady) {
        sampled = sampleBallCenterOnPlayfieldSurface(
          playfieldRoot,
          ballRadius,
          (pinBallMin.x + pinBallMax.x) * 0.5,
          (pinBallMin.z + pinBallMax.z) * 0.5,
          PLAYFIELD_VERTICAL,
          raySkyY,
          rayFrontZ,
          rayAnchorY,
        );
      }
      if (sampled) {
        ballBody.position.set(sampled.x, sampled.y, sampled.z);
      } else {
        ballBody.position.x = sx;
        ballBody.position.z = sz;
        ballBody.position.y = rollSurfaceYRef + ballRadius;
      }
      if (pinBallConstraintReady) {
        ballBody.position.x = THREE.MathUtils.clamp(
          ballBody.position.x,
          pinBallMin.x,
          pinBallMax.x,
        );
        ballBody.position.y = THREE.MathUtils.clamp(
          ballBody.position.y,
          pinBallMin.y,
          pinBallMax.y,
        );
        ballBody.position.z = THREE.MathUtils.clamp(
          ballBody.position.z,
          pinBallMin.z,
          pinBallMax.z,
        );
      }
    };

    const forceBallKinematicAtRest = () => {
      if (!ballBody) return;
      if (ballBody.type !== CANNON.Body.KINEMATIC) {
        ballBody.type = CANNON.Body.KINEMATIC;
        ballBody.mass = 0;
        ballBody.updateMassProperties();
      }
    };

    const ensureBallDynamicPlaying = () => {
      if (!ballBody) return;
      if (ballBody.type !== CANNON.Body.DYNAMIC || Math.abs(ballBody.mass - BALL_PHYS_MASS) > 1e-6) {
        ballBody.type = CANNON.Body.DYNAMIC;
        ballBody.mass = BALL_PHYS_MASS;
        ballBody.updateMassProperties();
      }
    };

    const recoverBallIfOutsideCabinet = () => {
      if (!ballBody || !recoveryReady || gameStateRef.current !== 'playing') return;
      const p = ballBody.position;
      const fallenThroughPlayfield =
        PLAYFIELD_VERTICAL &&
        pinBallConstraintReady &&
        p.y < pinBallMin.y - ballRadius * 1.25;
      if (
        fallenThroughPlayfield ||
        p.x < recoveryClampMin.x ||
        p.x > recoveryClampMax.x ||
        p.y < recoveryClampMin.y ||
        p.y > recoveryClampMax.y ||
        p.z < recoveryClampMin.z ||
        p.z > recoveryClampMax.z
      ) {
        snapBallCenterToPlayfieldMesh();
        ballBody.velocity.x *= 0.38;
        ballBody.velocity.y *= 0.38;
        ballBody.velocity.z *= 0.38;
        ballBody.angularVelocity.x *= 0.5;
        ballBody.angularVelocity.y *= 0.5;
        ballBody.angularVelocity.z *= 0.5;
      }
    };

    const resetBallAtPlungerRest = () => {
      if (!ballBody || !ballMesh) return;
      ballBody.position.set(plungerRestX, plungerRestY, plungerRestZ);
      ballBody.velocity.set(0, 0, 0);
      ballBody.angularVelocity.set(0, 0, 0);
      (ballBody as CANNON.Body & { _guideLaunchUntilMs?: number })._guideLaunchUntilMs = 0;
      if (pinBallConstraintReady) {
        ballBody.position.x = THREE.MathUtils.clamp(
          ballBody.position.x,
          pinBallMin.x,
          pinBallMax.x,
        );
        ballBody.position.y = THREE.MathUtils.clamp(
          ballBody.position.y,
          pinBallMin.y,
          pinBallMax.y,
        );
        ballBody.position.z = THREE.MathUtils.clamp(
          ballBody.position.z,
          pinBallMin.z,
          pinBallMax.z,
        );
      }
      ballMesh.position.set(ballBody.position.x, ballBody.position.y, ballBody.position.z);
      ballMesh.visible = true;
      ballBody.wakeUp();
      plungerCompression = 0;
      plungerCompressionVel = 0;
      forceBallKinematicAtRest();
    };

    const launchBallFromPlunger = (charge01: number) => {
      if (!ballBody || !ballMesh) return;
      hasLeftLauncher = false;
      ensureBallDynamicPlaying();
      const magRaw = launchVelMag;
      const mag =
        PLAYFIELD_VERTICAL && PLUNGER_MIN_EXIT_SPEED > 0
          ? Math.max(magRaw, PLUNGER_MIN_EXIT_SPEED)
          : magRaw;
      const charge = Math.max(0.08, charge01);

      if (PLAYFIELD_VERTICAL) {
        const laneRaw = new THREE.Vector3(launchLaneFwdX, launchLaneFwdY, launchLaneFwdZ);
        if (laneRaw.lengthSq() < 1e-14) laneRaw.set(-0.55, 0.72, 0.18);
        laneRaw.normalize();
        const lane = laneRaw;
        const boost =
          PLUNGER_CORRIDOR_SPEED * charge * (0.52 + 0.28 * charge) +
          PLUNGER_UP_BOOST * 0.042 * charge * charge;
        const speed =
          Math.min(
            PLUNGER_BURST_MAX_SPEED,
            Math.max(mag, PLUNGER_MIN_EXIT_SPEED) * 0.79 + boost,
          );
        ballBody.velocity.set(lane.x * speed, lane.y * speed, lane.z * speed);
      } else {
        const upBoost = PLUNGER_UP_BOOST * charge * charge;
        const upX = -gravityDirX;
        const upY = -gravityDirY;
        const upZ = -gravityDirZ;
        ballBody.velocity.set(
          launchDirX * mag + upX * upBoost,
          launchDirY * mag + upY * upBoost,
          launchDirZ * mag + upZ * upBoost,
        );
      }
      if (PLAYFIELD_VERTICAL) {
        ballBody.angularVelocity.set(
          (Math.random() - 0.5) * 5,
          (Math.random() - 0.5) * 5,
          (Math.random() - 0.5) * 5,
        );
      } else {
        ballBody.angularVelocity.set(
          (Math.random() - 0.5) * 14,
          (Math.random() - 0.5) * 18,
          (Math.random() - 0.5) * 14,
        );
      }
      (ballBody as CANNON.Body & { _launchSettle?: number })._launchSettle = 14;
      if (PLAYFIELD_VERTICAL) {
        (
          ballBody as CANNON.Body & { _guideLaunchUntilMs?: number }
        )._guideLaunchUntilMs = performance.now() + GUIDE_LAUNCH_MS;
      }
      ballBody.wakeUp();
      ballMesh.visible = true;
      (ballBody as CANNON.Body & { _noDrainUntilMs?: number })._noDrainUntilMs =
        performance.now() + 900;
      updateGameState('playing');
    };

    const handleDrain = () => {
      if (!ballMesh) return;
      const now = performance.now();
      if (now - lastDrainAt < DRAIN_COOLDOWN_MS) return;
      lastDrainAt = now;
      ballMesh.visible = false;
      if (ballBody) {
        ballBody.velocity.setZero();
        ballBody.angularVelocity.setZero();
        ballBody.sleep();
      }
      let newLives = livesRef.current - 1;
      if (newLives <= 0) newLives = INITIAL_LIVES;
      livesRef.current = newLives;
      setLives(newLives);
      if (launchSpeedBase > 0 && ballBody) {
        resetBallAtPlungerRest();
        updateGameState('idle');
      } else {
        updateGameState('idle');
      }
    };

    // ── GLTF + Physics setup ─────────────────────────────────────────────────
    const init = async () => {
      try {
        const gltf = await loader.loadAsync(PLAYFIELD_URL);
        if (initGen !== playfieldInitGenRef.current) return;

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
        raySkyY    = fb.max.y + Math.max(220, fsz.y * 0.28);
        rayFrontZ  = fb.max.z + Math.max(320, fsz.z * 0.34);
        rayAnchorY = fc.y;
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

        hideEmbeddedGltfBallDecor(playfieldRoot, fsz);
        hideStrayBallMeshesFromGltf(playfieldRoot, Math.max(fsz.x, fsz.y, fsz.z));

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
          gravity: new CANNON.Vec3(0, -PHYS_GRAVITY_MAG, 0),
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
        physWorld.addContactMaterial(new CANNON.ContactMaterial(ballMat, tableMat,   { friction: 0.14, restitution: 0.04 }));
        physWorld.addContactMaterial(new CANNON.ContactMaterial(ballMat, bumperMat,  { friction: 0.02, restitution: 0.42 }));
        physWorld.addContactMaterial(new CANNON.ContactMaterial(ballMat, flipperMat, { friction: 0.09, restitution: 0.34 }));
        physWorld.addContactMaterial(new CANNON.ContactMaterial(ballMat, wallMat,    { friction: 0.05, restitution: 0.28 }));
        physWorld.addContactMaterial(new CANNON.ContactMaterial(ballMat, laneMat,    { friction: 0.075, restitution: 0.18 }));


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

        // ── Rayon de la bille calculé tôt (nécessaire pour dimensionner les murs) ──
        const tableFootprint = Math.min(fsz.x, fsz.z);
        if (flipperRefBBox) {
          const flipSz  = flipperRefBBox.getSize(new THREE.Vector3());
          const flipLen = Math.max(flipSz.x, flipSz.z);
          ballRadius = flipLen / 10;
        } else {
          ballRadius = fsz.x / 60;
        }
        ballRadius = Math.max(ballRadius, tableFootprint * MIN_BALL_RADIUS_FOOTPRINT_FRAC);
        const minBallR = tableFootprint * Math.max(
          MIN_BALL_RADIUS_FOOTPRINT_FRAC,
          MIN_BALL_RADIUS_CLAMP_FRAC,
        );
        const maxBallR = tableFootprint * MAX_BALL_RADIUS_FOOTPRINT_FRAC;
        ballRadius = THREE.MathUtils.clamp(ballRadius, minBallR, maxBallR);

        {
          const sp = Math.max(ballRadius * 1.06, 3.5);
          modelShellMin.set(fb.min.x + sp, fb.min.y + sp, fb.min.z + sp);
          modelShellMax.set(fb.max.x - sp, fb.max.y - sp, fb.max.z - sp);
          if (
            modelShellMin.x <= modelShellMax.x &&
            modelShellMin.y <= modelShellMax.y &&
            modelShellMin.z <= modelShellMax.z
          ) {
            modelShellReady = true;
          }
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

        if (PLAYFIELD_VERTICAL && launcherBBox) {
          const lb = launcherBBox as THREE.Box3;
          const lsz = lb.getSize(new THREE.Vector3());
          playfieldRoot.updateMatrixWorld(true);
          const playC = shrinkWorldAabbTowardCenter(
            new THREE.Box3().setFromObject(playfieldRoot),
            0.9,
          ).getCenter(new THREE.Vector3());
          const lcx = (lb.min.x + lb.max.x) * 0.5;
          const lcz = (lb.min.z + lb.max.z) * 0.5;
          if (lsz.x > lsz.z * 1.06) {
            laneIsOnRight = playC.x < lcx;
          } else {
            drainAtMaxZ = playC.z < lcz;
          }
        }

        // ── Collision trimesh : géométrie réelle du playfield ─────────────────
        // Chaque THREE.Mesh statique du GLTF devient un CANNON.Trimesh.
        // La bille rebondit sur la vraie forme du plateau (pas de boxes invisibles).
        //
        // Exclusions :
        //   1. Flippers (corps cinématiques séparés)
        //   2. Bumpers (cylindres + events)
        //   3. Meshes **uniquement** tube plongeur (overlap fort bbox launcher, pas toute la colonne X)
        //      → rampes / courbes reliées au terrain restent en Trimesh pour suivre la courbure

        // Zone X du couloir de lancement (tout ce qui est au-delà de laneWallFaceX)
        // On l'expose en outer scope pour la correction de drift dans animate()
        laneMinX = laneIsOnRight ? laneWallFaceX : fb.min.x;
        laneMaxX = laneIsOnRight ? fb.max.x : laneWallFaceX;

        if (launcherBBox) {
          const lb0 = launcherBBox as THREE.Box3;
          launcherXM0 = lb0.min.x;
          launcherXM1 = lb0.max.x;
          launcherZM0 = lb0.min.z;
          launcherZM1 = lb0.max.z;
        }

        // Hauteur de roulement : le couloir peut être au-dessus du bas des flippers ;
        // si on spawn avec tableY (flipper) seul, la bille est sous le sol du lanceur → éjection verticale.
        const rollSurfaceY = Math.max(
          tableY,
          launcherBBox ? (launcherBBox as THREE.Box3).min.y : tableY,
          fb.min.y,
        );
        tableYPhys = rollSurfaceY;
        rollSurfaceYRef = rollSurfaceY;
        // Plafond « logique » seulement (pas de collider) — évite les micro-sauts dus au plafond physique
        ballCeilingY = rollSurfaceY + Math.max(fsz.y * 0.92, 420);
        // Marge vers +Z pour que la bille puisse longer la rampe courbe en haut (caméra face +Z).
        ballCeilingZ = fc.z + fsz.z * 0.74;
        if (launcherBBox) {
          const lzMax = (launcherBBox as THREE.Box3).max.z;
          ballCeilingZ = Math.max(ballCeilingZ, lzMax + Math.max(ballRadius * 15, 32));
        }

        // Gravité alignée sur le plateau : du haut (bumpers) vers les flippers.
        // Après rotation du GLB, la « hauteur » du mur peut être surtout **Z** ou **Y** : on choisit l’axe qui a le plus grand déploiement flipper → haut du mesh.
        playfieldRoot.updateMatrixWorld(true);
        const pfGrav = new THREE.Box3().setFromObject(playfieldRoot);
        {
          let gdx = 0;
          let gdy = -1;
          let gdz = 0;
          if (PLAYFIELD_VERTICAL) {
            const botExtra = Math.max(ballRadius * 5, 36);
            const flipC = flipperRefBBox
              ? flipperRefBBox.getCenter(new THREE.Vector3())
              : fc.clone();
            const flipMinY = flipperRefBBox ? flipperRefBBox.min.y : pfGrav.min.y;
            const flipMinZ = flipperRefBBox ? flipperRefBBox.min.z : pfGrav.min.z;
            const spanY = Math.max(1e-6, pfGrav.max.y - flipMinY);
            const spanZ = Math.max(1e-6, pfGrav.max.z - flipMinZ);
            /** Sinon on prend trop souvent Z alors que la chute « vue joueur » est surtout en Y mur. */
            const useZPrimary = spanZ > spanY * 1.42;

            const topPadY = Math.max(fsz.y * 0.045, ballRadius * 2.2);
            const topPadZ = Math.max(fsz.z * 0.045, ballRadius * 2.2);

            let gVec = new THREE.Vector3(0, -1, 0);
            if (useZPrimary) {
              const zMid = (pfGrav.min.z + pfGrav.max.z) * 0.5;
              const flipZc = flipC.z;
              let topZ: number;
              let botZ: number;
              if (flipZc > zMid) {
                /** Flippers plutôt côté +Z : le « haut » du terrain (bumpers) est du côté −Z — la chute suit +Z vers les flippers. */
                topZ = pfGrav.min.z + topPadZ;
                botZ = flipperRefBBox
                  ? flipperRefBBox.max.z + botExtra * 0.22
                  : flipZc + Math.max(ballRadius * 8, 36);
              } else {
                /** Flippers côté −Z : bumpers vers +Z, chute vers −Z. */
                topZ = pfGrav.max.z - topPadZ;
                botZ = flipperRefBBox
                  ? flipperRefBBox.min.z - botExtra * 0.42
                  : pfGrav.min.z + ballRadius * 4;
              }
              if (topZ <= botZ + ballRadius * 0.25) {
                topZ = botZ + Math.max(fsz.z * 0.11, ballRadius * 18, 42);
              }
              const topPt = new THREE.Vector3(flipC.x, flipC.y, topZ);
              const botPt = new THREE.Vector3(flipC.x, flipC.y, botZ);
              gVec.subVectors(botPt, topPt);
            } else {
              let topY = pfGrav.max.y - topPadY;
              let botY = flipperRefBBox
                ? flipperRefBBox.min.y - botExtra * 0.42
                : pfGrav.min.y + ballRadius * 4;
              if (topY <= botY + ballRadius * 0.25) {
                topY = botY + Math.max(fsz.y * 0.11, ballRadius * 18, 42);
              }
              const topPt = new THREE.Vector3(flipC.x, topY, flipC.z);
              const botPt = new THREE.Vector3(flipC.x, botY, flipC.z);
              gVec.subVectors(botPt, topPt);
            }

            if (gVec.lengthSq() > 1e-10) {
              gVec.normalize();
              gdx = gVec.x;
              gdy = gVec.y;
              gdz = gVec.z;
              /** Y : si la chute remonte en Y, on inverse (Z est réglé par topZ/botZ ci-dessus). */
              if (!useZPrimary && gdy > 0.02) {
                gdx = -gdx;
                gdy = -gdy;
                gdz = -gdz;
              }
            }

            /**
             * Vue caméra face au plateau (+Z) : le tapis du mur vertical est ~ dans le plan XY.
             * Une gravité avec forte composante **Z** est presque **parallèle à la normale du tapis** :
             * la projection sur le sol « tombe » à ~0 → friction + contact ⇒ bille qui **n’avance pas**.
             * On impose donc **g ⊥ (0,0,1)** (tangente au mur).
             */
            const wallNormal = new THREE.Vector3(0, 0, 1);
            const gProj = new THREE.Vector3(gdx, gdy, gdz);
            const gn = wallNormal.dot(gProj);
            gProj.x -= wallNormal.x * gn;
            gProj.y -= wallNormal.y * gn;
            gProj.z -= wallNormal.z * gn;
            if (gProj.lengthSq() < 1e-12) {
              gProj.set(0, -1, 0);
            } else {
              gProj.normalize();
            }
            gdx = gProj.x;
            gdy = gProj.y;
            gdz = gProj.z;
          }
          gravityDirX = gdx;
          gravityDirY = gdy;
          gravityDirZ = gdz;
          physWorld.gravity.set(
            gravityDirX * PHYS_GRAVITY_MAG,
            gravityDirY * PHYS_GRAVITY_MAG,
            gravityDirZ * PHYS_GRAVITY_MAG,
          );
        }

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
          /**
           * Exclure seulement la géo **du tube** plongeur (overlap fort avec bbox launcher).
           * L’ancien test « centre X dans la colonne lanceur » retirait des meshes qui partagent
           * la courbe / rampe avec le terrain → trous de collision en haut : la bille ne suivait pas la courbure.
           */
          if (launcherBBox && obj instanceof THREE.Mesh) {
            obj.updateMatrixWorld(true);
            const objBB = new THREE.Box3().setFromObject(obj);
            const lb = launcherBBox as THREE.Box3;
            const ix = Math.max(objBB.min.x, lb.min.x);
            const ax = Math.min(objBB.max.x, lb.max.x);
            const iz = Math.max(objBB.min.z, lb.min.z);
            const az = Math.min(objBB.max.z, lb.max.z);
            if (ax > ix && az > iz) {
              const overlapXZ = (ax - ix) * (az - iz);
              const meshXZ =
                Math.max(objBB.max.x - objBB.min.x, 1e-6) * Math.max(objBB.max.z - objBB.min.z, 1e-6);
              const frac = overlapXZ / meshXZ;
              const colW = lb.max.x - lb.min.x;
              const meshW = objBB.max.x - objBB.min.x;
              const staysInsideLauncherStrip =
                objBB.min.x >= lb.min.x - ballRadius &&
                objBB.max.x <= lb.max.x + ballRadius * 2;
              const tubeLike = frac > 0.86 && staysInsideLauncherStrip && meshW < colW * 1.65;
              if (tubeLike) return true;
            }
          }
          return false;
        };

        const tmpVec3 = new THREE.Vector3();

        playfieldRoot.updateMatrixWorld(true);
        playfieldRoot.traverse((obj) => {
          if (!(obj instanceof THREE.Mesh)) return;

          if (skipForTrimesh(obj)) {
            return;
          }

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
          } catch (e) {
            console.warn(`[Physics] Trimesh "${obj.name}" rejeté :`, e);
          }
        });

        const floorHalfY = 14;
        const floorSafety = new CANNON.Body({ mass: 0, material: tableMat });
        floorSafety.addShape(new CANNON.Box(new CANNON.Vec3(fsz.x * 0.52, floorHalfY, fsz.z * 0.52)));
        floorSafety.position.set(fc.x, rollSurfaceY - ballRadius * 7 - floorHalfY, fc.z);
        physWorld.addBody(floorSafety);

        const voidCatchHalfY = 24;
        const voidCatch = new CANNON.Body({ mass: 0, material: tableMat });
        voidCatch.addShape(new CANNON.Box(new CANNON.Vec3(fsz.x * 0.78, voidCatchHalfY, fsz.z * 0.78)));
        voidCatch.position.set(fc.x, fb.min.y - voidCatchHalfY - 48, fc.z);
        physWorld!.addBody(voidCatch);

        const wallHalf = 26;
        const wL = new CANNON.Body({ mass: 0, material: wallMat });
        wL.addShape(new CANNON.Box(new CANNON.Vec3(wallHalf, fsz.y * 2.2, fsz.z + 44)));
        wL.position.set(fb.min.x - wallHalf - 4, fc.y, fc.z);
        physWorld.addBody(wL);
        const wR = new CANNON.Body({ mass: 0, material: wallMat });
        wR.addShape(new CANNON.Box(new CANNON.Vec3(wallHalf, fsz.y * 2.2, fsz.z + 44)));
        wR.position.set(fb.max.x + wallHalf + 4, fc.y, fc.z);
        physWorld.addBody(wR);
        const wTop = new CANNON.Body({ mass: 0, material: wallMat });
        wTop.addShape(new CANNON.Box(new CANNON.Vec3(fsz.x + 48, fsz.y * 2.2, 22)));
        wTop.position.set(fc.x, fc.y, fb.min.z - 22);
        physWorld.addBody(wTop);
        const wBot = new CANNON.Body({ mass: 0, material: wallMat });
        wBot.addShape(new CANNON.Box(new CANNON.Vec3(fsz.x + 48, fsz.y * 2.2, 22)));
        wBot.position.set(fc.x, fc.y, fb.max.z + 22);
        physWorld.addBody(wBot);

        if (launcherBBox) {
          const lb    = launcherBBox as THREE.Box3;
          const lsz   = lb.getSize(new THREE.Vector3());
          const lcx   = (lb.min.x + lb.max.x) / 2;
          const lcz   = (lb.min.z + lb.max.z) / 2;

          const laneFloorHalfY = 2.8;
          const laneFloor      = new CANNON.Body({ mass: 0, material: tableMat });
          laneFloor.addShape(
            new CANNON.Box(new CANNON.Vec3(lsz.x / 2, laneFloorHalfY, lsz.z / 2)),
          );
          laneFloor.position.set(lcx, rollSurfaceY - laneFloorHalfY, lcz);
          physWorld.addBody(laneFloor);

          const wallT = Math.max(2.5, ballRadius * 0.35);
          const laneSpanY = lb.max.y - rollSurfaceY + ballRadius * 2.5;
          const wallH = Math.min(
            Math.max(
              laneSpanY,
              flipperRefBBox ? flipperRefBBox.max.y - rollSurfaceY + ballRadius * 2.5 : 32,
              ballRadius * 4,
            ),
            ballRadius * 26,
          );
          const yRail = rollSurfaceY + wallH / 2;

          const outerX = laneIsOnRight ? lb.max.x - wallT / 2 : lb.min.x + wallT / 2;
          const outer = new CANNON.Body({ mass: 0, material: laneMat });
          outer.addShape(new CANNON.Box(new CANNON.Vec3(wallT / 2, wallH / 2, lsz.z / 2)));
          outer.position.set(outerX, yRail, lcz);
          physWorld.addBody(outer);

          const innerX = laneIsOnRight ? lb.min.x + wallT / 2 : lb.max.x - wallT / 2;
          const inner = new CANNON.Body({ mass: 0, material: laneMat });
          inner.addShape(new CANNON.Box(new CANNON.Vec3(wallT / 2, wallH / 2, lsz.z / 2)));
          inner.position.set(innerX, yRail, lcz);
          physWorld.addBody(inner);
        }

        drainZ = drainAtMaxZ
          ? fb.max.z + ballRadius * 4
          : fb.min.z - ballRadius * 4;
        drainMinY =
          (flipperRefBBox ? flipperRefBBox.min.y : fb.min.y) - Math.max(ballRadius * 8, 42);
        if (flipperRefBBox) {
          const cr = flipperRefBBox.getCenter(new THREE.Vector3());
          drainRefX = cr.x;
          drainRefZ = cr.z;
        } else {
          drainRefX = fc.x;
          drainRefZ = fc.z;
        }
        drainRefY = drainMinY;

        // Volume jouable : bbox GLB ; X/Z resserrés vers le centre (évite coins AABB hors du plateau visuel).
        // Y min = surface de roulement. Z étendu vers drain.
        {
          playfieldRoot.updateMatrixWorld(true);
          const pf    = new THREE.Box3().setFromObject(playfieldRoot);
          const pfXZ  = shrinkWorldAabbTowardCenter(pf, PLAYFIELD_VERTICAL ? 0.92 : 0.84);
          const padCab = ballKeepInsidePad(ballRadius);
          const cx = clampAxisWithPad(pfXZ.min.x, pfXZ.max.x, padCab);
          const cy = clampAxisWithPad(pf.min.y, pf.max.y, padCab);
          const minCenterYOnTable = rollSurfaceY + ballRadius * 0.98;
          const yMin = Math.max(cy.min, minCenterYOnTable);
          let zMin = pfXZ.min.z + padCab;
          let zMax = pfXZ.max.z - padCab;
          if (drainAtMaxZ) {
            zMax = Math.max(zMax, drainZ + ballRadius * 10);
          } else {
            zMin = Math.min(zMin, drainZ - ballRadius * 10);
          }
          if (zMin > zMax) {
            const mz = (pf.min.z + pf.max.z) / 2;
            zMin = zMax = mz;
          }
          let yMax = cy.max;
          if (yMin > yMax) {
            yMax = yMin + ballRadius * 0.02;
          }
          cabinetClampMin.set(cx.min, yMin, zMin);
          cabinetClampMax.set(cx.max, yMax, zMax);
          cabinetClampReady = true;
        }

        const SPAWN_DRAIN_GUARD = Math.max(ballRadius * 8, 36);
        // Boîte XYZ pinball : bornes cabinet ∩ bande Z « hors drain » ∩ plafonds jeu.
        {
          let zPlayMin = cabinetClampMin.z;
          let zPlayMax = cabinetClampMax.z;
          if (drainAtMaxZ) {
            zPlayMax = Math.min(zPlayMax, drainZ - SPAWN_DRAIN_GUARD);
          } else {
            zPlayMin = Math.max(zPlayMin, drainZ + SPAWN_DRAIN_GUARD);
          }
          if (zPlayMin > zPlayMax) {
            const mz = (cabinetClampMin.z + cabinetClampMax.z) / 2;
            zPlayMin = zPlayMax = mz;
          }
          pinBallMin.set(
            cabinetClampMin.x,
            cabinetClampMin.y,
            Math.max(cabinetClampMin.z, zPlayMin),
          );
          pinBallMax.set(
            cabinetClampMax.x,
            cabinetClampMax.y,
            Math.min(cabinetClampMax.z, zPlayMax),
          );
          if (pinBallMin.z > pinBallMax.z) {
            const mz = (cabinetClampMin.z + cabinetClampMax.z) / 2;
            pinBallMin.z = pinBallMax.z = mz;
          }
          pinBallMax.y = Math.min(pinBallMax.y, ballCeilingY - 8);
          if (PLAYFIELD_VERTICAL && ballCeilingZ < Infinity) {
            pinBallMax.z = Math.min(
              pinBallMax.z,
              ballCeilingZ - Math.max(ballRadius * 1.15, 9),
            );
          }
          if (pinBallMin.z > pinBallMax.z) {
            const mz = (pinBallMin.z + pinBallMax.z) / 2;
            pinBallMin.z = pinBallMax.z = mz;
          }
          if (pinBallMin.y > pinBallMax.y) {
            const my = tableYPhys + ballRadius * 1.02;
            pinBallMin.y = pinBallMax.y = my;
          }
          pinBallConstraintReady = true;

          if (launcherBBox) {
            const lb = launcherBBox as THREE.Box3;
            const lp = ballKeepInsidePad(ballRadius) * 0.82;
            pinBallMin.x = Math.min(pinBallMin.x, lb.min.x + lp * 0.45);
            pinBallMax.x = Math.max(pinBallMax.x, lb.max.x - lp * 0.45);
            pinBallMin.z = Math.min(pinBallMin.z, lb.min.z + lp * 0.45);
            pinBallMax.z = Math.max(pinBallMax.z, lb.max.z - lp * 0.45);
            pinBallMin.y = Math.min(pinBallMin.y, lb.min.y + ballRadius * 0.92);
          }

          const rmx = Math.max(ballRadius * 4.2, 34);
          const rmz = Math.max(ballRadius * 4.2, 34);
          const rmyLo = Math.max(ballRadius * 54, 260);
          const rmyHi = Math.max(ballRadius * 17, 135);
          recoveryClampMin.set(fb.min.x - rmx, fb.min.y - rmyLo, fb.min.z - rmz);
          recoveryClampMax.set(fb.max.x + rmx, fb.max.y + rmyHi, fb.max.z + rmz);
          recoveryReady = true;
        }

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
            const dx = other.position.x - bumperBody.position.x;
            const dy = other.position.y - bumperBody.position.y;
            const dz = other.position.z - bumperBody.position.z;
            const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (len > 0) {
              const forceMag = ballRadius * ARCADE_IMPULSE_REF * 0.28;
              other.applyImpulse(
                new CANNON.Vec3(
                  (dx / len) * forceMag,
                  (dy / len) * forceMag,
                  (dz / len) * forceMag,
                ),
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

        const makeFlipperBody = (bbox: THREE.Box3 | null): CANNON.Body | null => {
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

        leftFlipperBody  = makeFlipperBody(leftFlipperBBox);
        rightFlipperBody = makeFlipperBody(rightFlipperBBox);

        // ── Physique pinball : bille (CANNON.Body dans `physWorld` + mesh Three sous `scene`, monde = Cannon)
        console.info(`[Physics] ballRadius=${ballRadius.toFixed(4)}`);

        ballBody = buildPinballBallBody(physWorld!, ballMat, ballRadius);

        const ballVisual = buildPinballBallMesh(ballRadius);
        ballMesh           = ballVisual.mesh;
        ballStripeTexture  = ballVisual.stripeTexture;
        scene.add(ballMesh);

        {
          playfieldRoot.updateMatrixWorld(true);
          const pfFull = new THREE.Box3().setFromObject(playfieldRoot);
          const pfCore = shrinkWorldAabbTowardCenter(pfFull, 0.84);
          const onTable = pfCore.getCenter(new THREE.Vector3());
          spawnX = onTable.x;
          spawnZ = onTable.z;
          spawnY = rollSurfaceY + ballRadius;

          if (launcherBBox) {
            const lb = launcherBBox as THREE.Box3;
            const lsz = lb.getSize(new THREE.Vector3());
            const lcx = (lb.min.x + lb.max.x) * 0.5;
            const lcz = (lb.min.z + lb.max.z) * 0.5;
            const pad = ballRadius * 1.14;
            const axisX = lsz.x > lsz.z * 1.06;
            if (axisX) {
              spawnX = laneIsOnRight ? lb.max.x - pad : lb.min.x + pad;
              spawnZ = THREE.MathUtils.clamp(lcz, lb.min.z + pad, lb.max.z - pad);
            } else {
              spawnZ = drainAtMaxZ ? lb.max.z - pad : lb.min.z + pad;
              spawnX = THREE.MathUtils.clamp(lcx, lb.min.x + pad, lb.max.x - pad);
            }
            spawnY = Math.max(
              rollSurfaceY + ballRadius,
              lb.min.y + ballRadius * 1.08,
              lb.min.y + lsz.y * 0.07 + ballRadius * 1.02,
            );
          }
        }

        if (pinBallConstraintReady) {
          spawnX = THREE.MathUtils.clamp(spawnX, pinBallMin.x, pinBallMax.x);
          spawnY = THREE.MathUtils.clamp(spawnY, pinBallMin.y, pinBallMax.y);
          spawnZ = THREE.MathUtils.clamp(spawnZ, pinBallMin.z, pinBallMax.z);
        }

        if (!launcherBBox) {
          const onMesh = sampleBallCenterOnPlayfieldSurface(
            playfieldRoot,
            ballRadius,
            spawnX,
            spawnZ,
            PLAYFIELD_VERTICAL,
            raySkyY,
            rayFrontZ,
            rayAnchorY,
          );
          if (onMesh && pinBallConstraintReady) {
            spawnX = THREE.MathUtils.clamp(onMesh.x, pinBallMin.x, pinBallMax.x);
            spawnY = THREE.MathUtils.clamp(onMesh.y, pinBallMin.y, pinBallMax.y);
            spawnZ = THREE.MathUtils.clamp(onMesh.z, pinBallMin.z, pinBallMax.z);
          }
        }

        if (launcherBBox) {
          const lb  = launcherBBox as THREE.Box3;
          const lsz = lb.getSize(new THREE.Vector3());
          launchAxis = lsz.x > lsz.z * 1.06 ? 'x' : 'z';
        } else {
          launchAxis = 'z';
        }

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
          220 + 340 * laneNorm + tableSpan * 0.11,
          228,
          620,
        );
        launchSpeedBase = Math.min(launchSpeedBase * 1.14, launchSpeedBase + 135);
        console.info(
          `[Physics] spawn=(${spawnX.toFixed(1)},${spawnY.toFixed(1)},${spawnZ.toFixed(1)}) axis=${launchAxis} ` +
          `launchDist=${launchDist.toFixed(1)} laneNorm=${laneNorm.toFixed(2)} launchSpeedBase=${launchSpeedBase.toFixed(1)} ` +
          `g=(${gravityDirX.toFixed(2)},${gravityDirY.toFixed(2)},${gravityDirZ.toFixed(2)})*${PHYS_GRAVITY_MAG} ballR=${ballRadius.toFixed(2)}`,
        );

        {
          const aim = new THREE.Vector3(
            (pinBallMin.x + pinBallMax.x) * 0.5,
            (pinBallMin.y + pinBallMax.y) * 0.5,
            (pinBallMin.z + pinBallMax.z) * 0.5,
          );
          let dx = aim.x - spawnX;
          let dy = aim.y - spawnY;
          let dz = aim.z - spawnZ;
          let len = Math.hypot(dx, dy, dz);
          const minLen = Math.max(ballRadius * 0.45, 14);
          if (len < minLen) {
            if (PLAYFIELD_VERTICAL) {
              dx = -gravityDirX;
              dy = -gravityDirY;
              dz = -gravityDirZ;
              len = Math.hypot(dx, dy, dz);
            }
            if (!PLAYFIELD_VERTICAL || len < 1e-8) {
              dx = launchAxis === 'x' ? (laneIsOnRight ? -1 : 1) : 0;
              dy = 0;
              dz = launchAxis === 'z' ? (drainAtMaxZ ? -1 : 1) : 0;
              len = Math.hypot(dx, dy, dz);
            }
          }
          if (len < 1e-8) {
            launchDirX = 0;
            launchDirY = 0;
            launchDirZ = -1;
          } else {
            launchDirX = dx / len;
            launchDirY = dy / len;
            launchDirZ = dz / len;
          }
          if (PLAYFIELD_VERTICAL) {
            const upAlong = new THREE.Vector3(
              -gravityDirX,
              -gravityDirY,
              -gravityDirZ,
            );
            if (upAlong.lengthSq() > 1e-10) upAlong.normalize();
            const blended = new THREE.Vector3(launchDirX, launchDirY, launchDirZ).lerp(
              upAlong,
              0.82,
            );
            if (blended.lengthSq() > 1e-10) blended.normalize();
            launchDirX = blended.x;
            launchDirY = blended.y;
            launchDirZ = blended.z;
          }
          console.info(
            `[Physics] launchDir=(${launchDirX.toFixed(3)},${launchDirY.toFixed(3)},${launchDirZ.toFixed(3)})`,
          );
        }

        plungerRestX = spawnX;
        plungerRestY = spawnY;
        plungerRestZ = spawnZ;

        if (launcherBBox) {
          const lb = launcherBBox as THREE.Box3;
          const lsz = lb.getSize(new THREE.Vector3());
          const axisX = lsz.x > lsz.z * 1.06;
          const padL = ballRadius * 1.14;
          const lcx2 = (lb.min.x + lb.max.x) * 0.5;
          const lcz2 = (lb.min.z + lb.max.z) * 0.5;
          let exitX: number;
          let exitZ: number;
          if (axisX) {
            exitX = laneIsOnRight ? lb.min.x + padL * 0.42 : lb.max.x - padL * 0.42;
            exitZ = THREE.MathUtils.clamp(lcz2, lb.min.z + padL, lb.max.z - padL);
          } else {
            exitX = THREE.MathUtils.clamp(lcx2, lb.min.x + padL, lb.max.x - padL);
            exitZ = drainAtMaxZ ? lb.min.z + padL * 0.42 : lb.max.z - padL * 0.42;
          }
          let exitY =
            lb.min.y + lsz.y * Math.min(0.78, 0.55 + lsz.y / Math.max(fsz.y, 120) * 0.22);
          exitY = Math.min(exitY, lb.max.y - padL * 0.35);
          if (pinBallConstraintReady) {
            exitY = Math.min(exitY, pinBallMax.y - ballRadius * 0.95);
          }
          exitY = Math.max(exitY, spawnY + ballRadius * 1.8);
          const fx = exitX - spawnX;
          const fy = exitY - spawnY;
          const fz = exitZ - spawnZ;
          const fl = Math.hypot(fx, fy, fz);
          if (fl > 1e-6) {
            launchLaneFwdX = fx / fl;
            launchLaneFwdY = fy / fl;
            launchLaneFwdZ = fz / fl;
            pullDirX = -launchLaneFwdX;
            pullDirY = -launchLaneFwdY;
            pullDirZ = -launchLaneFwdZ;
          } else {
            if (axisX) {
              pullDirX = laneIsOnRight ? 1 : -1;
              pullDirZ = 0;
            } else {
              pullDirX = 0;
              pullDirZ = drainAtMaxZ ? 1 : -1;
            }
            pullDirY = 0;
            launchLaneFwdX = -pullDirX;
            launchLaneFwdY = PLAYFIELD_VERTICAL ? 0.55 : 0;
            launchLaneFwdZ = -pullDirZ;
            const rl = Math.hypot(launchLaneFwdX, launchLaneFwdY, launchLaneFwdZ);
            if (rl > 1e-8) {
              launchLaneFwdX /= rl;
              launchLaneFwdY /= rl;
              launchLaneFwdZ /= rl;
              pullDirX = -launchLaneFwdX;
              pullDirY = -launchLaneFwdY;
              pullDirZ = -launchLaneFwdZ;
            }
          }
        } else {
          const px = -launchDirX;
          const pz = -launchDirZ;
          const ph = Math.hypot(px, pz);
          if (ph > 1e-8) {
            pullDirX = px / ph;
            pullDirZ = pz / ph;
          } else {
            pullDirX = 0;
            pullDirZ = 1;
          }
          pullDirY = 0;
          launchLaneFwdX = -pullDirX;
          launchLaneFwdY = 0;
          launchLaneFwdZ = -pullDirZ;
        }

        maxPlungerPull = Math.min(
          launchDist * 0.52,
          Math.max(ballRadius * 18, 72),
        );

        if (initGen !== playfieldInitGenRef.current) return;

        physicsReady = true;
        mountEl.focus();
        resetBallAtPlungerRest();
        {
          const rodR = Math.max(ballRadius * 0.48, 5);
          const rodGeo = new THREE.CylinderGeometry(rodR, rodR * 0.9, 1, 10);
          const rodMat = new THREE.MeshBasicMaterial({
            color:      0x4a282e,
            toneMapped: false,
            depthTest:  true,
            depthWrite: true,
          });
          plungerRodMesh = new THREE.Mesh(rodGeo, rodMat);
          plungerRodMesh.name = 'plunger_rod';
          plungerRodMesh.frustumCulled = false;
          plungerRodMesh.renderOrder = 0;
          scene.add(plungerRodMesh);
        }
        updateGameState('idle');
        console.info(
          '[Playfield] ✔ Physique prête — plongeur à ressort : maintiens ESPACE (compression), relâche pour lancer.',
        );
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
        const charge01 =
          maxPlungerPull > 1e-9
            ? THREE.MathUtils.clamp(plungerCompression / maxPlungerPull, 0, 1)
            : 0;
        launchVelMag =
          (launchSpeedBase * plungerFactorFromCharge01(charge01) +
            PLUNGER_LAUNCH_VS_GAIN * Math.abs(plungerCompressionVel)) *
          PLUNGER_LAUNCH_MULTIPLIER;
        launchBallFromPlunger(charge01);
        plungerCompression = 0;
        plungerCompressionVel = 0;
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

    /** Intègre le ressort (masse-implicite) : suit une cible de compression qui monte tant qu’ESPACE est maintenu. */
    const integratePlungerSpring = (dt: number) => {
      if (!physicsReady || gameStateRef.current !== 'idle' || maxPlungerPull < 1e-9) return;
      let sTarget = 0;
      if (isChargingPlunger) {
        const ramp = Math.min(1, (performance.now() - chargeStartTime) / PLUNGER_CHARGE_MS);
        sTarget = maxPlungerPull * ramp;
      }
      const err = plungerCompression - sTarget;
      const accel = -PLUNGER_SPRING_K * err - PLUNGER_SPRING_C * plungerCompressionVel;
      plungerCompressionVel += accel * dt;
      plungerCompression += plungerCompressionVel * dt;
      if (plungerCompression < 0) {
        plungerCompression = 0;
        plungerCompressionVel *= -0.28;
      } else if (plungerCompression > maxPlungerPull) {
        plungerCompression = maxPlungerPull;
        plungerCompressionVel *= -0.28;
      }
    };

    /** Pose la bille sur le ressort (idle uniquement) — annule la gravité Cannon entre deux pas. */
    const applyIdleBallFromPlungerSpring = () => {
      if (!physicsReady || !ballBody || gameStateRef.current !== 'idle') return;
      forceBallKinematicAtRest();
      ballBody.position.set(
        plungerRestX + pullDirX * plungerCompression,
        plungerRestY + pullDirY * plungerCompression,
        plungerRestZ + pullDirZ * plungerCompression,
      );
      ballBody.velocity.set(0, 0, 0);
      ballBody.angularVelocity.set(0, 0, 0);
    };

    const updatePlungerRodVisual = () => {
      if (!plungerRodMesh || !physicsReady || gameStateRef.current !== 'idle') {
        if (plungerRodMesh) plungerRodMesh.visible = false;
        return;
      }
      const bx = plungerRestX + pullDirX * plungerCompression;
      const by = plungerRestY + pullDirY * plungerCompression;
      const bz = plungerRestZ + pullDirZ * plungerCompression;
      const backLen = Math.max(maxPlungerPull * 1.35 + ballRadius * 6, 56);
      const hx = plungerRestX - pullDirX * backLen;
      const hy = plungerRestY - pullDirY * backLen;
      const hz = plungerRestZ - pullDirZ * backLen;
      const ax = bx - hx;
      const ay = by - hy;
      const az = bz - hz;
      const len = Math.hypot(ax, ay, az);
      if (len < 1e-4) {
        plungerRodMesh.visible = false;
        return;
      }
      plungerRodMesh.visible = true;
      plungerRodMesh.scale.set(1, Math.max(len, ballRadius * 0.5), 1);
      plungerRodMesh.position.set((bx + hx) * 0.5, (by + hy) * 0.5, (bz + hz) * 0.5);
      const axis = new THREE.Vector3(ax, ay, az).divideScalar(len);
      plungerRodMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
    };

    // ── Boucle de rendu ───────────────────────────────────────────────────────
    let frameId: number;

    const animate = (time: number) => {
      frameId = requestAnimationFrame(animate);

      const dt = prevFrameTime > 0 ? Math.min((time - prevFrameTime) / 1000, 0.05) : 0.016;
      prevFrameTime = time;

      if (ballBody && gameStateRef.current === 'playing') {
        const v = ballBody.velocity;
        const p = ballBody.position;
        const padGuide = ballRadius * 3.25;
        const inLauncherTube =
          launcherXM0 < Infinity &&
          p.x >= launcherXM0 - padGuide &&
          p.x <= launcherXM1 + padGuide &&
          p.z >= launcherZM0 - padGuide &&
          p.z <= launcherZM1 + padGuide;
        const guideUntil = (
          ballBody as CANNON.Body & { _guideLaunchUntilMs?: number }
        )._guideLaunchUntilMs ?? 0;
        if (
          PLAYFIELD_VERTICAL &&
          inLauncherTube &&
          guideUntil > 0 &&
          performance.now() < guideUntil
        ) {
          const g = GUIDE_LAUNCH_SPEED;
          v.x = launchLaneFwdX * g;
          v.y = launchLaneFwdY * g;
          v.z = launchLaneFwdZ * g;
        }
        const sp = Math.hypot(v.x, v.y, v.z);
        const settle = (
          ballBody as CANNON.Body & { _launchSettle?: number }
        )._launchSettle ?? 0;
        let cap = PINBALL_MAX_SPEED * 1.06;
        if (PLAYFIELD_VERTICAL && settle > 0) {
          cap = Math.min(cap, PLUNGER_BURST_MAX_SPEED + 35);
        }
        if (sp > cap) {
          const s = cap / sp;
          v.x *= s;
          v.y *= s;
          v.z *= s;
        }
      }

      integratePlungerSpring(dt);
      applyIdleBallFromPlungerSpring();

      if (physWorld) physWorld.step(FIXED_STEP, dt, MAX_SUB);
      enforcePinballXYZConstraints(
        ballBody,
        pinBallConstraintReady,
        gameStateRef.current === 'playing',
        pinBallMin,
        pinBallMax,
        PLAYFIELD_VERTICAL,
      );
      clampBallInsideModelShell();
      recoverBallIfOutsideCabinet();

      applyIdleBallFromPlungerSpring();
      updatePlungerRodVisual();

      if (ballBody && gameStateRef.current === 'playing') {
        const bb = ballBody as CANNON.Body & { _launchSettle?: number };
        if ((bb._launchSettle ?? 0) > 0 && !PLAYFIELD_VERTICAL) {
          ballBody.velocity.y = 0;
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

      if (physicsReady && ballBody && ballMesh) {
        const playing = gameStateRef.current === 'playing';

        if (playing) {
          const { position: p, velocity: v } = ballBody;

          const padTube = ballRadius * 2.2;
          const inLauncherTube =
            launcherXM0 < Infinity &&
            p.x >= launcherXM0 - padTube &&
            p.x <= launcherXM1 + padTube &&
            p.z >= launcherZM0 - padTube &&
            p.z <= launcherZM1 + padTube;

          const spd = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
          const bbAny = ballBody as CANNON.Body & {
            _prevSpd?: number;
            _stuckFc?: number;
            _launchSettle?: number;
          };
          const prevSpd = bbAny._prevSpd ?? 0;
          bbAny._prevSpd = spd;
          const settlePre = bbAny._launchSettle ?? 0;
          if (settlePre > 0) bbAny._launchSettle = settlePre - 1;

          if (
            !inLauncherTube &&
            (bbAny._launchSettle ?? 0) <= 0 &&
            spd > prevSpd * 2.4 &&
            spd > 260 &&
            prevSpd > 2
          ) {
            const s = (prevSpd * 1.72) / spd;
            v.x *= s;
            v.y *= s;
            v.z *= s;
          }
          if (
            !inLauncherTube &&
            (bbAny._launchSettle ?? 0) <= 0 &&
            spd > PINBALL_MAX_SPEED * 0.92
          ) {
            const cap = PINBALL_MAX_SPEED * 0.92;
            const s = cap / spd;
            v.x *= s;
            v.y *= s;
            v.z *= s;
          }

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
          }

          if (
            PLAYFIELD_VERTICAL &&
            pinBallConstraintReady &&
            !inLauncherTube
          ) {
            const ySpan = pinBallMax.y - pinBallMin.y;
            if (ySpan > 8) {
              const yRel = (p.y - pinBallMin.y) / ySpan;
              if (yRel > 0.48 && spd < 210) {
                const ramp = Math.min(1, (yRel - 0.48) / 0.52) * (1 - spd / 230);
                const boost = 340 * dt * Math.max(0, ramp);
                v.x += gravityDirX * boost;
                v.y += gravityDirY * boost;
                v.z += gravityDirZ * boost;
                const xSpan = pinBallMax.x - pinBallMin.x;
                if (xSpan > 20) {
                  const xRel = (p.x - pinBallMin.x) / xSpan;
                  const cx = (pinBallMin.x + pinBallMax.x) * 0.5;
                  if (xRel < 0.14) v.x += (cx - p.x) * 28 * dt;
                  else if (xRel > 0.86) v.x += (cx - p.x) * 28 * dt;
                }
              }
            }
          }

          const inLauncher =
            laneMinX < Infinity &&
            p.x >= laneMinX - ballRadius * 2 &&
            p.x <= laneMaxX + ballRadius * 2;
          if (!hasLeftLauncher && !inLauncher) hasLeftLauncher = true;
          if (hasLeftLauncher && inLauncher && !inLauncherTube) {
            const reEnter = laneIsOnRight ? v.x > 5 : v.x < -5;
            if (reEnter) {
              const pushDir = laneIsOnRight ? -1 : 1;
              v.x += pushDir * 120 * dt;
            }
          }

          if (spd < 1.05) bbAny._stuckFc = (bbAny._stuckFc ?? 0) + 1;
          else bbAny._stuckFc = 0;
          if (
            !inLauncherTube &&
            (bbAny._stuckFc ?? 0) > 220 &&
            spd < 0.48
          ) {
            const j = 22;
            v.x += (Math.random() - 0.5) * j;
            v.z += (Math.random() - 0.5) * j;
            if (PLAYFIELD_VERTICAL) {
              v.y += (Math.random() - 0.5) * j * 0.65;
            } else {
              p.y = Math.max(p.y, tableYPhys + ballRadius * 1.01);
            }
            bbAny._stuckFc = 0;
          }

          const alongDrain =
            (p.x - drainRefX) * gravityDirX +
            (p.y - drainRefY) * gravityDirY +
            (p.z - drainRefZ) * gravityDirZ;
          const pastDrain = PLAYFIELD_VERTICAL
            ? alongDrain > Math.max(ballRadius * 14, 72)
            : (drainAtMaxZ ? p.z > drainZ : p.z < drainZ);
          const bbDrain = ballBody as CANNON.Body & { _noDrainUntilMs?: number };
          const graceDone =
            bbDrain._noDrainUntilMs === undefined ||
            performance.now() >= bbDrain._noDrainUntilMs;
          if (pastDrain && graceDone) handleDrain();
        }

        ballMesh.position.set(
          ballBody.position.x,
          ballBody.position.y,
          ballBody.position.z,
        );
        ballMesh.quaternion.set(
          ballBody.quaternion.x,
          ballBody.quaternion.y,
          ballBody.quaternion.z,
          ballBody.quaternion.w,
        );
        ballMesh.visible = playing || gameStateRef.current === 'idle';
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
      playfieldInitGenRef.current += 1;
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize',   handleResize);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup',   onKeyUp);
      if (mountEl.contains(renderer.domElement)) mountEl.removeChild(renderer.domElement);
      if (plungerRodMesh) {
        scene.remove(plungerRodMesh);
        plungerRodMesh.geometry.dispose();
        (plungerRodMesh.material as THREE.Material).dispose();
        plungerRodMesh = null;
      }
      if (ballMesh) {
        scene.remove(ballMesh);
        ballMesh.geometry.dispose();
        (ballMesh.material as THREE.Material).dispose();
      }
      ballStripeTexture?.dispose();
      ballStripeTexture = null;
      if (playfieldRoot) modelRoot.remove(playfieldRoot);
      disposableGeos.forEach((g) => g.dispose());
      disposableMats.forEach((m) => m.dispose());
      renderer.dispose();
    };
  }, []);

  // ── JSX ───────────────────────────────────────────────────────────────────
  const hintLine =
    gameState === 'idle'
      ? '▶  ESPACE — ressort : tirer puis relâcher pour lancer vers le plateau'
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
          <div>ESPACE — Tirer puis lâcher (plongeur)</div>
        </div>
      </header>

      {/* ── Overlay état (entre deux lancers) ───────────────────────────── */}
      {gameState === 'idle' && (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-4">
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
        aria-label="Terrain de flipper — Q/D ou les flèches pour les flippers ; ESPACE maintenir pour tirer le plongeur, relâcher pour lancer la bille"
      />
    </div>
  );
}
