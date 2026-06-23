# Refactor #2 — `PlayfieldCameraFit` : respect du principe Open/Closed

> Fiche de présentation orale. Fichier concerné :
> `packages/game-engine/src/infrastructure/PlayfieldCameraFit.ts`.

---

## 1. Rappel du principe : Open/Closed (le « O » de SOLID)

> Une entité doit être **ouverte à l'extension** mais **fermée à la modification**.

Traduction concrète : *je dois pouvoir **ajouter** un comportement (ici : un nouveau mode de caméra) **sans modifier** le code existant.*

---

## 2. Le problème trouvé

Le fichier gère **2 modes de caméra** : `legacy` (caméra inclinée classique) et `portrait-fill` (vue verticale qui remplit l'écran de borne). Le **mode** (`viewMode`) était dispatché à **5 endroits différents** :

| Endroit | Forme |
|---|---|
| `playfieldViewDirForMode` | `switch (viewMode)` |
| `playfieldCameraUpForMode` | `switch (viewMode)` |
| `playfieldCameraTargetForMode` | `if (viewMode !== 'portrait-fill')` |
| `refitPlayfieldCamera` | **3×** `if (viewMode === 'portrait-fill')` |
| `fitPlayfieldCameraForMode` | `switch (viewMode)` |

**Conséquence** : pour ajouter un 3ᵉ mode (ex. une vue « cinématique »), il fallait retrouver et **modifier ces 5 endroits**. C'est le *code smell* appelé **« shotgun surgery »** (chirurgie au fusil à pompe : une seule évolution éclate en plein de petites modifs dispersées). → **violation d'Open/Closed.**

---

## 3. La solution : une table de stratégies (Strategy pattern)

On décrit **chaque mode par un objet** qui implémente la **même interface**. Le code générique ne connaît plus aucun nom de mode : il **lit la table**.

### L'interface (le contrat commun à tous les modes)

```ts
interface PlayfieldViewModeStrategy {
  viewDir(debugTuning?): THREE.Vector3;        // direction œil→cible
  cameraUp(): THREE.Vector3;                    // vecteur "haut" de la caméra
  frameBox(playfieldRoot): THREE.Box3;          // boîte de cadrage
  computeTarget(frameBox, out, debugTuning?): THREE.Vector3; // point visé
  fillCorners(frameBox, corners): void;         // coins pour le calcul de distance
  fit(camera, fit, target, aspect, debugTuning?): number;    // place la caméra
}
```

### La table (la SEULE connaissance « par mode »)

```ts
const PLAYFIELD_VIEW_MODE_STRATEGIES: Record<PlayfieldViewMode, PlayfieldViewModeStrategy> = {
  'portrait-fill': { viewDir: …, cameraUp: …, frameBox: …, computeTarget: …, fillCorners: …, fit: … },
  legacy:          { viewDir: …, cameraUp: …, frameBox: …, computeTarget: …, fillCorners: …, fit: … },
};
```

### Le code générique devient « bête » (il ne fait que lire la table)

```ts
// AVANT : 3 if dispersés sur le mode
const frameBox = viewMode === 'portrait-fill' ? boundingBoxPortraitFrame(root) : boundingBoxPlayableArea(root);
…

// APRÈS : aucune connaissance du mode
const strategy = PLAYFIELD_VIEW_MODE_STRATEGIES[viewMode];
const frameBox = strategy.frameBox(root);
strategy.computeTarget(frameBox, target, debugTuning);
strategy.fillCorners(frameBox, corners);
```

---

## 4. Pourquoi c'est maintenant Open/Closed

> **Ajouter un mode = ajouter UNE entrée dans la table. Zéro fonction existante modifiée.**

| | Avant | Après |
|---|---|---|
| Ajouter un mode | éditer **5 endroits** (2 switch + 3 if) | ajouter **1 entrée** dans la table |
| Risque d'oublier un endroit | élevé | nul |
| Code générique (fit/refit) | connaît les noms de modes | n'en connaît **aucun** |

**Bonus offert par TypeScript** : la table est typée `Record<PlayfieldViewMode, …>`. Si quelqu'un ajoute un mode au type `PlayfieldViewMode` **sans** l'ajouter à la table, **le code ne compile pas**. L'oubli devient impossible.

---

## 5. Garantie : aucun changement de comportement

C'est un **refactor pur** (on réorganise, on ne change pas ce que fait le code). Pour chaque mode, la nouvelle table appelle **exactement les mêmes fonctions de calcul** qu'avant (`boundingBoxPortraitFrame`, `fitPlayfieldCameraLegacy`, etc.). Les signatures publiques utilisées ailleurs (`playfieldCameraUpForMode`, `refitPlayfieldCamera` dans `PinballPlayfield.tsx`) sont **inchangées** — elles délèguent simplement à la table.

### Comment vérifier

```bash
docker compose -f docker-compose.dev.yml restart playfield
```
La caméra doit cadrer le plateau **exactement comme avant** (mode `portrait-fill` par défaut).

---

## 6. Distinction à retenir pour l'oral

- **DRY** (refactor #1, socket) répond à : « est-ce que je me répète ? »
- **Open/Closed** (refactor #2, ici) répond à : « puis-je **étendre** sans **modifier** ? »

Le passage **`switch`/`if` éparpillés → table de stratégies** est *la* technique classique pour transformer un dispatch fermé en structure ouverte à l'extension.
