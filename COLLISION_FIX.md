# Cahier des charges — Correction des collisions du flipper

## Contexte

Le jeu est un flipper 3D (Three.js + Rapier3D) avec un modèle GLB (`pinball-machine.glb`).
Les collisions sont configurées dans :
- `packages/app/src/components/pinball/PinballPlayfield.tsx` — setup physique principal
- `packages/game-engine/src/infrastructure/PlayfieldColliderBuilder.ts` — builder de colliders (legacy, peu utilisé)
- `packages/game-engine/src/domain/Ball.ts` — toutes les constantes (positions, tailles)

**Stack physique :** Rapier3D, timestep 1/120s, gravité (0, -9.81, 0), CCD activé sur la balle.

---

## Problèmes identifiés à corriger

### 1. Flippers — détection de contact irréelle

**Problème actuel :** La collision flipper n'utilise pas Rapier. C'est une zone de proximité hardcodée (Z entre 0.20 et 0.33, plages X fixes) avec un déclenchement sur front montant du swing. La balle est téléportée (velocity reset + impulse appliqué directement). Ça donne des comportements erratiques : la balle peut traverser le flipper, ou être propulsée dans de mauvaises directions.

**Objectif :**
- Utiliser les corps kinématiques Rapier (`leftFlipperBody` / `rightFlipperBody`) correctement.
- Le body physique du flipper doit suivre précisément la position ET la rotation du pivot visuel (`leftPivot` / `rightPivot`) à chaque frame — pas seulement la position (la rotation est déjà syncée visuellement mais pas transmise au body).
- Supprimer la logique de détection manuelle par zone (lignes ~1159–1194 dans `PinballPlayfield.tsx`).
- Laisser Rapier gérer l'impulsion naturellement via la restitution du collider flipper (augmenter à 0.85–1.0) et la vitesse angulaire du body kinématique.
- La syncFlipperBody doit transmettre la rotation du pivot, pas seulement la position du mesh.

**Fichiers :** `PinballPlayfield.tsx`, fonctions `syncFlipperBody` et la logique flipper dans `animate()`.

---

### 2. Slingshots — aucune force physique

**Problème actuel :** Les slingshots sont des sensors (`.setSensor(true)`). Ils détectent le contact mais n'appliquent aucune force. La balle les traverse sans rebond. Le commentaire dit "no impulse (causes teleportation)" mais c'est corrigeable.

**Objectif :**
- Retirer `.setSensor(true)` des slingshots.
- En conserver les `COLLISION_EVENTS` pour le score.
- Ajouter une restitution élevée (0.8 déjà dans `SLINGSHOT_RESTITUTION`) et friction 0.
- Sur événement de collision slingshot, appliquer une impulsion de répulsion dirigée (similaire à `applyEjectionForce` des bumpers) — vecteur normalisé depuis le centre du slingshot vers la balle, magnitude ~0.08–0.12.

**Fichiers :** `PinballPlayfield.tsx` sections "Slingshot sensors" et le handler de collision events.

---

### 3. Trimesh du sol — éléments exclus causent des trous

**Problème actuel :** La liste `SKIP` dans le setup Trimesh exclut `plastic`, `plastic_left`, `plastic_rocket`, `plastic_pop_bumper_zone` (les rails et guides courbes). Cela crée des zones sans surface sous la balle : elle peut tomber à travers le sol dans les zones de rails.

**Objectif :**
- Retirer `'plastic'`, `'plastic_left'`, `'plastic_rocket'` de la liste `SKIP` pour qu'ils contribuent au trimesh global.
- `'plastic_pop_bumper_zone'` peut rester exclus si la zone bumpers a des colliders dédiés.
- Vérifier en mode debug (touche H) que le sol est continu sous toutes les zones de jeu.

**Fichiers :** `PinballPlayfield.tsx`, variable `SKIP` dans l'init.

---

### 4. Bumpers — impulsion d'éjection trop faible

**Problème actuel :** `BUMPER_EJECT_IMPULSE = 0.06` est trop faible. La balle ralentit fortement autour des bumpers au lieu de rebondir vigoureusement.

**Objectif :**
- Augmenter `BUMPER_EJECT_IMPULSE` à `0.14` dans `Ball.ts`.
- Augmenter la restitution des bumpers de 0.3 à 0.6 dans `PinballPlayfield.tsx` (section "Bumpers : Cylinder").
- S'assurer que l'impulsion est bien calculée dans le plan XZ (ignorer Y) pour éviter de faire sauter la balle.

**Fichiers :** `packages/game-engine/src/domain/Ball.ts`, `PinballPlayfield.tsx`.

---

### 5. Limite de vitesse trop restrictive

**Problème actuel :** `MAX_SPEED = 4.0` m/s clamp la balle. Après un lancer flipper ou un bumper, la balle est artificiellement ralentie. Sur un vrai flipper la balle peut atteindre 6–8 m/s.

**Objectif :**
- Augmenter `MAX_SPEED` à `6.5` m/s.
- Conserver le clamp pour éviter les tunneling (CCD est activé donc on peut monter plus haut).

**Fichiers :** `PinballPlayfield.tsx`, constante `MAX_SPEED` dans `animate()`.

---

### 6. Séparateur de lane — position incorrecte

**Problème actuel :** Le séparateur de lane est calculé depuis `BALL_SPAWN_POSITION.x - BALL_RADIUS * 2` (~0.205), mais le mur correspondant dans le GLB est à X≈0.206. La balle peut glisser entre le séparateur physique et le modèle visuel.

**Objectif :**
- Fixer la position du séparateur à `laneSepX = 0.206` en dur (correspondant au bord gauche de la lane dans le GLB).
- Vérifier en debug que le wireframe du séparateur coïncide avec le mesh GLB `separator_left`.

**Fichiers :** `PinballPlayfield.tsx`, variable `laneSepX` dans la section Walls.

---

### 7. Drain — détection par position redondante et imprécise

**Problème actuel :** Le drain est détecté à la fois par un sensor Rapier (Z≈0.40) ET par une vérification de position manuelle (`bPos.z > DRAIN_Z && bPos.x < fieldBounds.laneSepX`). La vérification manuelle peut drainer la balle alors qu'elle est dans la lane de lancement (X > laneSepX devrait être exclu, mais ce n'est pas garanti).

**Objectif :**
- Supprimer la vérification de position manuelle du drain (lignes ~1307–1312 dans `animate()`).
- Agrandir le sensor drain pour couvrir toute la largeur du terrain (hx: 0.265) et le positionner à Z=0.415 (juste avant le mur du bas).
- S'assurer que le sensor drain exclut la zone lane (X > 0.206) en utilisant deux sensors côte à côte si nécessaire, ou en laissant le mur du bas gérer le rebond dans la lane.

**Fichiers :** `PinballPlayfield.tsx`, sections "Drain sensor" et vérification de position dans `animate()`.

---

## Ce qu'il NE faut PAS changer

- La structure ECS et les use-cases (`LaunchBall`, `BumperHit`, `DrainBall`).
- Le système d'animation de la lane de lancement (laneAnimSpeed) — il fonctionne bien.
- Les positions des bumpers dans `Ball.ts` — elles sont calibrées sur le GLB.
- Le mode debug (touche H) — garder les wireframes.
- Les valeurs de damping (`BALL_LINEAR_DAMPING = 0.02`) — correctes pour un flipper.

---

## Ordre de priorité

1. **Flippers** (le plus impactant sur le gameplay)
2. **Slingshots** (rebond manquant complètement)
3. **Trimesh trous** (balle qui tombe à travers)
4. **Bumpers impulse** (sensation de jeu)
5. **Drain** (nettoyage)
6. **Vitesse max + lane separator** (ajustements fins)

---

## Vérification

Après chaque fix, tester en mode debug (H) pour vérifier que :
- Les wireframes des colliders correspondent aux meshes visuels.
- La balle ne traverse aucune surface.
- Les flippers envoient la balle dans la direction attendue.
- Les slingshots repoussent la balle.
- Le drain ne se déclenche pas dans la lane de lancement.
