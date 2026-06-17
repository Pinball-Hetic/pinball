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
// BALL_SPAWN_POSITION déplacé en littéral dans le layout de la map
// (layout.spawns.ball). Le moteur lit le spawn via le layout injecté ;
// bottomOutLaneSepX(spawnX) paramètre la zone bottom-out (PlayfieldGeometry).

// Plunger — impulsion = masse * Δv. À pleine charge : 0.26/0.08 = 3.25 m/s
// (plunge full réaliste, sous le clamp BALL_MAX_SPEED).
export const PLUNGER_IMPULSE_Z = -0.26;

// Couloir plongeur (shooter lane) + guide : géométrie déplacée en littéraux
// dans le layout de la map (layout.shooterLane). Le moteur lit la config
// injectée (ShooterLaneGate, computeSurfaceSnap, PlayfieldColliderFactory).

// Playfield — GLB: center=[0,1.0171,-0.0671] size=[0.53,0.1019,0.9697]
// Surface is already tilted in GLB geometry → gravity stays straight down
export const PLAYFIELD_TILT_DEG  = 6.5;
export const PLAYFIELD_SURFACE_Y = 1.0681; // top of playfield mesh = 1.0171 + 0.1019/2

// BUMPER_POSITIONS déplacé en littéral dans le layout de la map (collider
// tuné, centre Box3 mesh non fiable). Plus de constante ici.
// Positions des cibles boss : fournies par les définitions de boss de la map
// (layout.bosses) — plus de re-export spécifique à une map ici.

// Le portail (position) déplacé en littéral dans le layout de la map
// (layout.sensors.portal). Les rayons/scores portail restent génériques ici.
export const PORTAL_HOLE_RADIUS = 0.02;
export const PORTAL_COVER_RADIUS = 0.021;
export const PORTAL_SENSOR_RADIUS = 0.017;
export const PORTAL_MAGNET_RADIUS = 0.058;
export const PORTAL_MAGNET_STRENGTH = 0.0055;
export const PORTAL_ENTER_SCORE = 500;
export const RETURN_PORTAL_ENTER_SCORE = 500;

// Spawns de monde alternatif : déplacés en littéraux dans le layout de la map
// — plus de constante spécifique à une map ici.

export const ASSIST_SCORE = 100;
export const ASSIST_INTERVAL = 3.2;

// Bump-right / Bump-left (mèches). La direction de poussée est fixe (côté), pas
// dépendante de la position de contact → pas besoin des coords ici.
export const BUMP_EJECT_SCALE     = 0.45;  // 45 % de la force d'un pop bumper
// Anti rebond multiple : un même mèche ne re-déclenche pas avant ce délai
// (la balle collée/qui vibre ne farme pas score + impulsion).
export const BUMP_HIT_COOLDOWN_MS      = 60;
export const SLINGSHOT_HIT_COOLDOWN_MS = 80;

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

// Drop targets : définitions (id/side) + positions déplacées dans le layout de
// la map ; positions dérivées du GLB au runtime (LayoutResolver). Plus de
// constante ici.
