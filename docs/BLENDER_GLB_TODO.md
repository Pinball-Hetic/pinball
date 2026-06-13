# TODO Blender — meshes à ajouter / corriger dans le GLB

Document pour l'équipe **modélisation Blender** (pas de code à toucher). Il
liste ce qu'il manque dans `newStrangerthings.glb` pour que le jeu **dérive
les positions du GLB** au lieu de les maintenir à la main.

## Pourquoi

Aujourd'hui certaines positions (sensors, bumpers) sont écrites **en dur**
dans le code (`layout.ts`). À chaque retouche de la table en Blender, il faut
re-saisir des coordonnées à la main → source d'erreurs et de désynchro.

Si le GLB contient les bons meshes **bien placés**, le code lit directement
leur position (centre de la boîte englobante / *bounding box*). Plus aucune
constante à maintenir. Deux chantiers :

1. **Ajouter les meshes `sensor_*` manquants** (4 zones aujourd'hui en dur).
2. **Corriger les origines des bumpers** (leur centre de boîte ne tombe pas
   sur le point de collision → dérivation abandonnée, à réactiver).

Validation finale (les deux chantiers) : voir [checklist](#checklist-de-validation-post-réexport).

---

## 1. Meshes `sensor_*` manquants

Ce sont des **marqueurs invisibles** : ils n'apparaissent pas en jeu. **Seule
leur POSITION compte** — le code lit le centre de leur boîte englobante. Un
petit plan ou cube fin (~2 × 2 cm) suffit ; inutile de modéliser quoi que ce
soit de visible. Placer chaque marqueur **pile au centre de la zone** indiquée.

> Convention de nommage : `sensor_<id>` (préfixe `sensor_` obligatoire pour que
> le moteur le reconnaisse).

### Zones de pop bumpers (haut du plateau) — 3 marqueurs

| Nom du mesh | Position monde (x, y, z) en mètres | Rôle |
|---|---|---|
| `sensor_pop_1` | (−0.0225, 1.057, −0.448) | Zone de pop centrale (haut plateau) |
| `sensor_pop_2` | (−0.087, 1.056, −0.438) | Zone de pop gauche |
| `sensor_pop_3` | (0.042, 1.056, −0.438) | Zone de pop droite |

### Autres marqueurs — 1 chacun

| Nom du mesh | Position monde (x, y, z) en mètres | Forme / taille | Rôle |
|---|---|---|---|
| `sensor_rocket` | (0.193, 1.021, −0.13) | plan/box fin ~2×2 cm | Déclencheur de la rampe (rocket), côté droit |
| `sensor_demogorgon` | (−0.0195, 1.0575, −0.269) | plan/box fin ~2×2 cm | Déclencheur de réveil du nid Demogorgon |
| `sensor_portal` | (−0.000751, 1.015191, −0.064818) | disque/box Ø ~1.7 cm | Entrée du portail (monde alternatif) |

> Astuce Blender : poser un Empty au repère, puis y aligner un petit plan
> nommé `sensor_<id>`. C'est le centre de la boîte du **mesh** (pas l'Empty)
> que le code lit — exporter un vrai mesh, pas seulement l'Empty.

---

## 2. Origines des bumpers à corriger

Les 3 bumpers existent déjà dans le GLB (`bumper_1/2/3`) et leur géométrie est
correcte. **Problème** : le centre de leur boîte englobante ne tombe **pas** au
point de collision (le corps cylindrique où la bille rebondit). On a donc
abandonné la dérivation et figé des valeurs à la main — à réactiver une fois
les origines corrigées.

### Diagnostic (mesuré sur le GLB actuel)

`position attendue` = point de collision (valeur en dur, calée à la main pour
le gameplay). `centre boîte actuel` = ce que le code lit aujourd'hui.

| Bumper | Position attendue (x, y, z) | Centre boîte actuel | Écart (mm) | Écart total |
|---|---|---|---|---|
| `bumper_1` | (−0.0206, 1.0482, −0.1967) | (−0.0226, 1.0590, −0.2067) | (−2, **+11**, −10) | **15 mm** |
| `bumper_2` | (−0.0974, 1.0621, −0.3051) | (−0.1067, 1.0686, −0.3120) | (**−9**, +6, −7) | **13 mm** |
| `bumper_3` | (0.0595, 1.0621, −0.3051) | (0.0629, 1.0698, −0.3121) | (+3, +8, −7) | **11 mm** |

### Ce que ça veut dire (langage Blender)

- **Décalage vertical systématique (+6 à +11 mm en Y, tous les bumpers).** La
  boîte englobante inclut le **chapeau champignon** (la coiffe haute du
  bumper). Du coup le milieu de la boîte est **tiré vers le haut**, au-dessus
  du corps où la bille tape réellement. La géométrie est **asymétrique en
  hauteur** (chapeau plus haut que la base).
- **Décalage en profondeur (−7 à −10 mm en Z).** Même cause : la jupe / le
  chapeau débordent vers l'arrière (−Z), ce qui recule le milieu de la boîte.
- **`bumper_2` : gros décalage latéral en plus (−9 mm en X).** Sa géométrie
  penche d'un côté, ou le groupe `bumper_2` embarque un élément décentré
  (vis, décor) qui gonfle la boîte vers la gauche.

### Action Blender — par bumper

L'objectif : que le **milieu de la boîte englobante du mesh `bumper_<n>`**
tombe sur le **point de collision** (centre du corps cylindrique, à la hauteur
où la bille frappe). Deux façons, au choix de l'équipe :

- **Option A (recommandée) — isoler le corps de collision.** Garder sur le
  mesh nommé `bumper_<n>` **uniquement** le corps cylindrique (le disque/cylindre
  où la bille rebondit) et déplacer le **chapeau + décor** dans un enfant
  nommé `vis_<...>` (rôle « visuel », ignoré par la physique). La boîte du
  `bumper_<n>` se réduit alors au corps → son centre tombe au bon endroit.
- **Option B — recentrer.** Recentrer/symétriser le mesh `bumper_<n>` autour
  du point de collision pour que la boîte englobante soit centrée dessus
  (origine → centre géométrique du corps, et retirer du groupe tout élément
  décentré).

| Bumper | À corriger en priorité | Action concrète |
|---|---|---|
| `bumper_1` | Hauteur (+11 mm) + profondeur (−10 mm) | Sortir le chapeau dans `vis_`, ou recentrer verticalement sur le corps |
| `bumper_2` | **Latéral (−9 mm)** + hauteur/profondeur | Vérifier l'élément décentré en X (le sortir du groupe), puis recentrer comme les autres |
| `bumper_3` | Hauteur (+8 mm) + profondeur (−7 mm) | Sortir le chapeau dans `vis_`, ou recentrer verticalement sur le corps |

> Cible : après correction, le centre de boîte de chaque `bumper_<n>` doit
> coller à la « position attendue » du tableau ci-dessus, à **≤ 5 mm** près
> (tolérance de dérivation côté code).

---

## 3. Orientation du nid Demogorgon (`vis_demogorgon_portal_rig`)

Le « nid » qui couvre le trou du Demogorgon avant son apparition est un mesh
**décoratif** du GLB (`vis_demogorgon_portal_rig`, rôle `vis_` → aucune
physique). Il est rendu **tel quel**, le code n'y touche jamais (pas de
rotation appliquée).

**Cause réelle** : c'est un mesh **skinné** (squelette `..._skeleton` + 8 joints
`joint_Portal_Rim_*` posés en cercle, plusieurs avec de grosses rotations Y) et
le GLB embarque **5 animations** (`Open`, `Close`, `OpenIdle`, `CloseIdle`,
`Exit`). En Blender, la pose de repos s'affiche correctement. **En jeu**, le
moteur rend le mesh skinné **sans lecteur d'animation** (le code ne joue aucun
de ces clips → pose de *bind*), ce qui le déforme/oriente de travers. Le rig
n'est piloté par aucun code (ni avant ni après le refacto).

**Action Blender (recommandée) — dé-rigger** : comme le jeu n'anime pas ce
portail, le sortir de l'état skinné garantit un rendu identique au viewport.

| Étape | Action Blender |
|---|---|
| 1 | Mettre le rig dans la pose voulue (ex. frame de `CloseIdle` — portail fermé qui couvre le trou) |
| 2 | Appliquer le modificateur Armature sur le mesh (`Ctrl+A` pose → Apply / Visual Geometry to Mesh), supprimer l'armature |
| 3 | Garder le nom de rôle `vis_demogorgon_portal_rig` (mesh statique, plus de squelette ni d'animations dans l'export) |
| 4 | Vérifier le centrage : nid en (0.002, 1.017, **−0.064**) ; cible Demogorgon en (0, 1.012, **−0.02**) → recentrer sur z ≈ −0.02 si le nid ne couvre pas pile le trou |

> ⚠️ **Piège export** (déjà arrivé) : exporter **toute la scène**, pas l'objet
> sélectionné. Décocher *"Selected Objects"* dans le dialog glTF, sinon l'export
> ne contient qu'un nœud (ex. 384 octets = juste le portail) et écrase la map
> complète (37 Mo). Toujours re-valider après export : `task maps:sync-assets --
> strangerthings && task maps:validate -- strangerthings`.
>
> Alternative (si on veut garder l'anim Open/Close à terme) : le jeu devrait
> piloter le rig (lecteur d'animation sur `vis_demogorgon_portal_rig`,
> Open au reveal / CloseIdle sinon). C'est du dev gameplay, hors du périmètre
> actuel — tant que ce n'est pas câblé, un mesh statique est la bonne option.

## Checklist de validation post-réexport

Après ré-export du GLB (sensors ajoutés et/ou origines bumpers corrigées) :

1. Remplacer `packages/maps/strangerthings/assets/playfield/newStrangerthings.glb`.
2. `task maps:sync-assets -- strangerthings` (copie vers le `public/` du jeu).
3. `task maps:validate -- strangerthings` → **viser zéro warning**
   (aujourd'hui : warning « layout.sensors en littéral (4) »).
4. Prévenir l'équipe code : la bascule **littéraux → dérivation GLB** se fait
   côté code (chercher `TODO(blender)` dans `layout.ts` pour la liste des
   positions à rebrancher sur la dérivation une fois les meshes en place).

Tant que les meshes n'existent pas, les positions en dur restent valides et le
jeu fonctionne — c'est uniquement de la dette de maintenance, pas un bug.
