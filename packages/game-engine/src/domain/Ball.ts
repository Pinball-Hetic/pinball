// Bille — GLB ball size=[0.0269] → radius 0.01345. Réduite à 0.010 (~20 mm Ø).
export const BALL_RADIUS          = 0.01374;
export const BALL_MASS            = 0.08;   // 80 g — standard officiel
export const BALL_RESTITUTION     = 0.4;    // acier sur bois verni : rebond faible
export const BALL_FRICTION        = 0.05;   // acier poli, très glissant
// Résistance au roulement : décélération ≈ damping × v. 0.04 × 2 m/s ≈
// 0.08 m/s², cohérent avec une bille acier sur bois ciré.
export const BALL_LINEAR_DAMPING  = 0.04;
export const BALL_ANGULAR_DAMPING = 0.05;

// Plafond de vitesse balle (m/s). Le sim est ~1:1 réel (masse 80g, Ø27mm, g,
// tilt 6.5°) → ces valeurs sont en m/s réels. Pinball réel : roulis 0.5–1.5,
// lancement 2.5–4.5, jeu actif 4–8, pics ~10. 7 = jeu vivant sans tunneling
// (CCD on + murs shooter lane 0.02 d'épaisseur).
export const BALL_MAX_SPEED = 7.0;

// Spawn — centre géométrique du couloir : (X_MIN 0.206 + X_MAX 0.265) / 2 =
// 0.2355. La balle est tenue sur cette ligne par le verrou latéral (charge +
// montée), donc parfaitement centrée entre les deux murs du couloir.
export const BALL_SPAWN_POSITION = { x: 0.2355, y: 1.010, z: 0.1610 } as const;

// Plunger — impulsion = masse * Δv. À pleine charge : 0.26/0.08 = 3.25 m/s
// (plunge full réaliste, sous le clamp BALL_MAX_SPEED).
export const PLUNGER_IMPULSE_Z = -0.26;

// ── Couloir plongeur (shooter lane) — vrai lancement physique ────────────────
// X min = 0.206 : mur gauche analytique HORS du chemin de la balle (canal large
// pour que la balle, diamètre ~0.0295, ne soit jamais coincée). La balle est
// maintenue à droite par le spawn ; les arcs GLB bordent le côté gauche.
export const SHOOTER_LANE_X_MIN = 0.206;
export const SHOOTER_LANE_X_MAX = 0.265;
// Z : bas = côté joueur, haut = début de la courbe de sortie (Z négatif).
export const SHOOTER_LANE_BOTTOM_Z = 0.42;
export const SHOOTER_LANE_TOP_Z = -0.49;
export const SHOOTER_LANE_WALL_HEIGHT = 0.05;
// Épais pour empêcher le tunneling de la balle rapide (clamp BALL_MAX_SPEED, 7 m/s) au lancement.
export const SHOOTER_LANE_WALL_THICKNESS = 0.02;
export const SHOOTER_LANE_RESTITUTION = 0.2;
export const SHOOTER_LANE_FRICTION = 0.08;
// Le mur gauche (séparateur) s'arrête ici : ouverture en haut-gauche par
// laquelle la balle déviée sort dans le terrain.
export const SHOOTER_LANE_LEFT_WALL_TOP_Z = -0.28;

// Verrou latéral : tant que la balle monte la partie droite du couloir
// (X au-dessus de ce seuil), on la fige sur la ligne de spawn → lancement droit.
export const SHOOTER_LANE_LOCK_X = 0.19;
// Diagnostic LaneFlight : la balle est considérée sortie dans le terrain sous ce X.
export const SHOOTER_LANE_EXIT_X = 0.18;
// Diagnostic LaneFlight : retombée en bas du couloir (échec de lancement) au-delà de ce Z.
export const SHOOTER_LANE_FAIL_Z = 0.30;

// Guide courbe de sortie = mur EXTÉRIEUR (droite + haut) qui s'incurve.
// Centre au coin haut-gauche du couloir : la balle montante (-Z) longe la face
// concave et est renvoyée vers la gauche (-X) en redescendant (+Z) → arc
// classique de flipper. Quart de cercle balayé de 270° (haut-gauche) à 360°
// (sommet du mur droit).
export const SHOOTER_GUIDE_CENTER = { x: SHOOTER_LANE_X_MIN, z: -0.40 } as const;
export const SHOOTER_GUIDE_RADIUS = SHOOTER_LANE_X_MAX - SHOOTER_LANE_X_MIN;
export const SHOOTER_GUIDE_SEGMENTS = 10;
export const SHOOTER_GUIDE_ANGLE_START = Math.PI * 1.5;
export const SHOOTER_GUIDE_ANGLE_END = Math.PI * 2;

// Playfield — GLB: center=[0,1.0171,-0.0671] size=[0.53,0.1019,0.9697]
// Surface is already tilted in GLB geometry → gravity stays straight down
export const PLAYFIELD_TILT_DEG  = 6.5;
export const PLAYFIELD_SURFACE_Y = 1.0681; // top of playfield mesh = 1.0171 + 0.1019/2

export const BUMPER_POSITIONS = [
  { x: -0.020586, y: 1.0482, z: -0.1967 },
  { x: -0.097406, y: 1.0621, z: -0.30509 },
  { x:  0.059483, y: 1.0621, z: -0.30509 },
] as const;
export {
  DEMOGORGON_TARGET,
  DEMOGORGON_TARGET_HITS,
  VECNA_TARGET,
  VECNA_TARGET_HITS,
} from './BossRegistry';

export const PORTAL_UPSIDE_DOWN = {
  x: -0.000751,
  y: 1.015191,
  z: -0.064818,
} as const;

export const PORTAL_HOLE_RADIUS = 0.02;
export const PORTAL_COVER_RADIUS = 0.021;
export const PORTAL_SENSOR_RADIUS = 0.017;
export const PORTAL_MAGNET_RADIUS = 0.058;
export const PORTAL_MAGNET_STRENGTH = 0.0055;
export const PORTAL_ENTER_SCORE = 500;
export const RETURN_PORTAL_ENTER_SCORE = 500;

// Spawns upside-down / retour : déplacés en littéraux dans le layout de la map
// (packages/maps/strangerthings/layout.ts) — plus de constante ST ici.

export const ELEVEN_ASSIST_SCORE = 100;
export const ELEVEN_ASSIST_INTERVAL = 3.2;

// Bump-right / Bump-left (mèches). La direction de poussée est fixe (côté), pas
// dépendante de la position de contact → pas besoin des coords ici.
export const BUMP_EJECT_SCALE     = 0.45;  // 45 % de la force d'un pop bumper
// Anti rebond multiple : un même mèche ne re-déclenche pas avant ce délai
// (la balle collée/qui vibre ne farme pas score + impulsion).
export const BUMP_HIT_COOLDOWN_MS = 60;

export const BUMPER_RADIUS       = 0.038;
export const BUMPER_RESTITUTION  = 0.20;  // réduit de 0.30 (−33%) — rebond collider moins violent
// Kick pop bumper : Δv = impulse/masse = 0.11/0.08 = 1.38 m/s (−35% vs 2.25 m/s original).
export const BUMPER_EJECT_IMPULSE = 0.11;

/** Au-dessus de ce décollage (m) au-dessus du tapis, la balle est recollée à la
 *  surface inclinée (absorbe le jitter physique normal, ~6 mm). */
export const SURFACE_SNAP_THRESHOLD = 0.006;

// Walls — from GLB playfield mesh extents
export const WALL_LEFT_X    = -0.265;
export const WALL_RIGHT_X   =  0.265;
export const WALL_TOP_Z     = -0.552;
export const WALL_BOTTOM_Z  =  0.418;
export const WALL_HEIGHT    =  0.06;
export const WALL_THICKNESS =  0.006;

// Drain — seuil analytique (DRAIN_Z_THRESHOLD dans PlayfieldGeometry, dérivé de
// la géométrie). DRAIN_SWITCH_CENTER supprimé (mort, zéro consommateur).

// Slingshots — from GLB slingshot center=[−0.0225,1.032,0.1162] size=[0.2881,_,0.1132]
// Y lowered to surface level so ball doesn't land on top
export const SLINGSHOT_LEFT_CENTER  = { x: -0.166, y: 1.005, z: 0.116 } as const;
export const SLINGSHOT_RIGHT_CENTER = { x:  0.121, y: 1.005, z: 0.116 } as const;
export const SLINGSHOT_RESTITUTION  = 0.8;

// Pop-zone + rocket sensors : déplacés en littéraux dans le layout de la map
// (pas de mesh sensor_ dans le GLB → TODO blender). Plus de constante ici.

// Drop targets — from GLB
export const DROP_TARGETS = [
  { id: 'drop_left_1',  x: -0.209, y: 1.022, z: -0.019, side: 'left' as const },
  { id: 'drop_left_2',  x: -0.205, y: 1.026, z: -0.049, side: 'left' as const },
  { id: 'drop_right_1', x:  0.157, y: 1.024, z: -0.041, side: 'right' as const },
  { id: 'drop_right_2', x:  0.148, y: 1.028, z: -0.077, side: 'right' as const },
  { id: 'drop_right_3', x:  0.137, y: 1.032, z: -0.114, side: 'right' as const },
] as const;
