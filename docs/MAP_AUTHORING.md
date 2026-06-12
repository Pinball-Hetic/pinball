# Authoring d'une map

Une map est un package `packages/maps/<id>/` (`@pinball/map-<id>`) résolu par
le registry `@pinball/maps` (`getMapPackage(id)`). Le moteur (`game-engine`)
est générique : il reçoit les données de la map par injection (`MapManifest`,
`MapLayout`) et ne connaît aucun nom de map.

## Conventions de nommage des meshes GLB

Le rôle physique d'un mesh est déduit de son **préfixe** par
`MeshRoleResolver`. Le GLB doit donc être exporté avec des noms conventionnés
(ou fournir un `meshAliases` dans le manifest pour traduire des noms legacy).

| Préfixe        | Rôle        | Physique appliquée |
|----------------|-------------|--------------------|
| `vis_`         | décor       | aucune (visuel pur) |
| `floor_`       | surface     | trimesh + dérivation de pente (`surfaceYAtZ`) |
| `wall_`        | mur         | trimesh solide |
| `flipper_left` / `flipper_right` | flipper | corps cinématique + hull |
| `bumper_<n>`   | pop bumper  | collider analytique cylindrique + visuel |
| `slingshot_left` / `slingshot_right` | slingshot | sensor analytique |
| `target_<id>`  | drop target | sensor + machine à états |
| `sensor_<id>`  | zone trigger| sensor (pas de solide) |
| `lane_<id>`    | couloir plongeur | mur/guide analytique |

Règles :
- **Underscores**, pas d'espaces ni de points (`bumper_1`, pas `Bumper 1`).
- Le matching est insensible à la casse et aux séparateurs
  (`Floor.Main` → `floor_main`).
- Tout mesh sans préfixe reconnu **ni** `vis_` est ignoré côté physique et
  signalé une fois (`MeshRoleResolver.warnUnresolvedOnce`). Mettre `vis_`
  devant tout décor pour faire taire l'avertissement.

### Préfixer le groupe parent (recommandé)

On nomme l'**objet Blender** (le nœud parent), pas chaque primitive. À
l'export glTF, un objet multi-matériaux est splitté en primitives nommées
automatiquement (`Circle.018` → `Mesh_8/9/10`) : ces enfants n'ont pas à être
renommés, ils **héritent** du rôle du parent.

`MeshRoleResolver.resolveFromAncestry([mesh, parent, …, racine])` remonte la
hiérarchie : le préfixe le plus **spécifique** gagne. Donc :
- préfixer le groupe → tous ses enfants prennent le rôle ;
- un enfant nommé explicitement **surcharge** le rôle de son groupe.

Exemple : objet `wall_rail_left` contenant `Mesh_8/9/10` → les 3 primitives
sont des murs. Pas besoin de toucher aux `Mesh_N`.

**Exclure un détail dans un groupe physique** : à l'inverse, pour rendre un
sous-objet **non-physique** alors que son groupe est physique, nommer ce
sous-objet `vis_…`. Comme le plus spécifique gagne, il surcharge le rôle du
groupe. Exemple : groupe `bumper_1` contenant une vis décorative `vis_screw`
→ la vis est ignorée côté physique, le reste du groupe reste bumper. (Le
sous-objet doit être un **objet Blender distinct** pour porter son propre
nom ; une simple primitive issue d'un split par matériau ne peut pas être
renommée séparément.)

### Tuning par élément (`manifest.elements`)

Certains rôles ont des variantes physiques. Les exprimer dans
`manifest.elements[<id>]` plutôt que par des heuristiques codées :

```ts
elements: {
  wall_main:  { singleSided: 1 },          // normales vers l'intérieur (anti faces fantômes)
  floor_main: { physics: 'analytic' },     // cuboïde lisse au lieu du trimesh (anti ghost-collision)
  rail_left:  { restitution: 0.35, friction: 0.12 },
}
```

## Checklist export Blender

- Axes : Y up, -Z forward (réglages glTF par défaut).
- Échelle : 1 unité = 1 m (la table fait ~0.53 × 0.97 m).
- Origine du mesh playfield à l'origine du monde.
- **Inclinaison bakée dans la géométrie** (pas de transform de nœud) — la
  gravité reste verticale côté moteur.
- Noms en underscores selon les conventions ci-dessus.
- Trianguler les surfaces de collision (`floor_`, `wall_`).

## Cycle de création

1. Créer `packages/maps/<id>/` (`package.json`, `tsconfig.json`,
   `manifest.ts`, `layout.ts`, `index.ts`) — copier `strangerthings`.
2. Déposer le GLB + textures dans `assets/`.
3. Renseigner `manifest` (scoring, rules, glb, meshAliases, clips,
   forbiddenInCore) et `layout` (positions sans mesh : spawns, couloir).
4. Enregistrer la map dans `packages/maps/index.ts` (registry).
5. `task maps:sync` → copie les assets vers `apps/playfield/public/maps/<id>/`.
6. `task maps:validate -- <id>` (phase 7) → vérifie manifest + GLB.
7. `NEXT_PUBLIC_MAP_ID=<id>` → tester en jeu.

Contenus `module/` (comportement playfield), `dmd/`, `backglass/` sont
optionnels : absents → fallback **NO SIGNAL** (phase 5).

---

## Guide de ré-export Stranger Things

Le GLB actuel (`Strangerthings.glb`) est un import Sketchfab/Blender aux noms
non conventionnés (hiérarchie `Pinballmap` → `Mesh_0…Mesh_58`, groupes
`Circle.xxx`/`Cylinder.008`/`Plane.008`, classés par **heuristiques de taille**
dans `PlayfieldTrimeshBuilder`). Pour activer le pipeline role-driven, le GLB
doit être ré-exporté avec les noms ci-dessous.

### Renommages directs (sans ambiguïté)

| Nœud actuel | Nom conventionné | Note |
|-------------|------------------|------|
| `Bumper-1/2/3` | `bumper_1/2/3` | colliders analytiques (positions dans `layout.bumpers`) |
| `flipper-left` / `flipper-right` | `flipper_left` / `flipper_right` | inchangé sémantiquement |
| `drop_target_left_1/2` | `target_left_1/2` | |
| `drop_target_right_1/2/3` | `target_right_1/2/3` | |
| `guirlande-1…10` | `vis_guirlande_1…10` | décor (les lumières sont pilotées à part) |
| `cassette-1/2` | `vis_cassette_1/2` | décor |
| `demogorgon_portal_rig (1)` + enfants | `vis_demogorgon_portal` | modèle visuel (reveal géré par le module) |
| `Fix-Start` | `lane_fixstart` | guide de lissage du couloir au lancement |
| `Mesh1.0` | `wall_guide_topleft` | plaque-guide de lissage paroi haute-gauche |

### Décisions de modélisation requises (à trancher dans Blender)

Ces meshes sont aujourd'hui classés par **taille/position**, pas par nom — il
faut leur attribuer un rôle explicite au ré-export :

- **`Mesh_0`** (surface de jeu) : actuellement **visible sans collision**, la
  physique passe par un cuboïde analytique lisse (le trimesh GLB causait des
  ghost-collisions qui freinaient la bille). Deux choix :
  - `floor_main` + `manifest.elements.floor_main.physics: 'analytic'` →
    garder le comportement actuel (recommandé, sûr).
  - `floor_main` en trimesh → seulement si le ré-export produit une surface
    parfaitement plane (sinon retour des ghost-collisions).
- **`Mesh_1`** (murs moulés plein plateau) : `wall_main` +
  `manifest.elements.wall_main.singleSided: 1` (normales vers l'intérieur).
- **Groupes `Circle.xxx` / `Cylinder.008` / `Plane.008` / `Cube.xxx` /
  `Sphere.001`** (rails, guides, plastiques) : ce sont les **objets parents**
  ; renommer l'objet, pas les `Mesh_N` enfants (primitives héritées).
  Aujourd'hui filtrés par taille (`RAIL_SUBMESH_MIN_PHYS_DIM` = 25 mm ; les
  sous-meshes dont les 2 plus petites dimensions < 25 mm sont décoratifs). Au
  ré-export, donner le préfixe au groupe :
  - rails/guides structurels (≥ 25 mm) → `wall_<id>`
  - détails fins (vis, clips, anneaux) → `vis_<id>`

### Table dérivée du GLB (script de dump)

`python3 scripts/dump-glb-meshes.py` dumpe taille/centre monde de chaque mesh
+ rôle par seuil 25 mm. Le **seuil seul** ne distingue pas décor et structure
(une guirlande est grosse mais décorative) → croiser avec la sémantique. Noms
recommandés **par groupe parent** (les `Mesh_N` enfants héritent) :

| Groupe (nœud parent) | Nom recommandé | elements / note |
|----------------------|----------------|-----------------|
| `Pinballmap/Mesh_0` (530×102×970) | `floor_main` | `physics: 'analytic'` (sol lisse, anti ghost-collision) |
| `Pinballmap/Mesh_1` (530×109×710) | `wall_main` | `singleSided: 1` (murs moulés) |
| `Circle.001` (Mesh_2/3/4) | `wall_perimeter_top` | rail haut du périmètre |
| `Circle.011` (Mesh_5/6/7) | `wall_rail_left` | |
| `Circle.018` (Mesh_8/9/10) | `wall_rail_right` | Mesh_11/12/13 (<25mm) → `vis_` |
| `Circle.034` (Mesh_43/44/45) | `wall_rail_mid` | Mesh_46/47/48 (<25mm) → `vis_` |
| `Cylinder.008` (Mesh_28-35) | `wall_lower` | zone slingshot/flippers (vérifier en jeu) |
| `Plane.008` (Mesh_49/50/51) | `wall_lower_plane` | no-bounce historique (`restitution: 0`) |
| `Sphere.001` (Mesh_14/15/16) | `lane_shooter` | côté plongeur (X≈+0.24) — vérifier |
| `Cube.002/Mesh_17` | `wall_bottom` | bord bas |
| `Mesh_52/53/54` (Strangerthings) | `wall_outlane_l/r` / `wall_drain` | coins bas |
| `Circle.015/022/032` (petits) | `vis_decor_top` | détails fins (majorité <25mm) |
| `Bumper-1/2/3` | `bumper_1/2/3` | colliders analytiques (`layout.bumpers`) |
| `drop_target_left_1/2`, `right_1/2/3` | `target_left_1/2`, `target_right_1/2/3` | |
| `flipper-left/right` | `flipper_left/right` | |
| `guirlande-1…10` | `vis_guirlande_1…10` | décor (lumières pilotées à part) |
| `cassette-1/2` (Mesh_55-58) | `vis_cassette_1/2` | décor |
| `demogorgon_portal_rig` + enfants | `vis_demogorgon_portal` | modèle visuel (reveal = module) |
| `Fix-Start` | `lane_fixstart` | guide lissage couloir |
| `Mesh1.0` | `wall_guide_topleft` | plaque-guide |

Les lignes "vérifier en jeu" (`Cylinder.008`, `Plane.008`, `Sphere.001`)
demandent un coup d'œil sur le modèle : leur fonction se déduit mal de la
seule bounding box. `task` : lancer le script, recouper visuellement, figer
les noms, ré-exporter.

### Après le ré-export

1. `meshAliases` reste **vide** (le GLB est déjà conventionné) ou ne traduit
   que les exceptions.
2. Je réécris `PlayfieldTrimeshBuilder` en role-driven (`MeshRoleResolver`),
   en remplaçant les listes `COLLISION_SOLIDS`/`TRIMESH_*`/`EXCLUDED_NODES`.
3. Validation **obligatoire en jeu** : comparer le COUNT de colliders créés
   avant/après + `BallDiagnostics` (trajectoires, `wallCrossCount` à 0,
   aucun reset anormal). Écart de comportement = bug du refacto.
