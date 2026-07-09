# Tests — les 4 fichiers (CollisionEventProcessor, CollisionHandler, BumperCollisionHandler, BumperHit)

> Fichier dédié uniquement au sujet des tests, séparé du reste de la prep. Ce sujet compte double pour toi :
> il tombe dans **Code Review** (compétence C3.3 — "Procéder aux corrections d'erreurs et optimisations",
> qui inclut "test et validation"), ET dans **Post-Mortem** (compétence C2.2 — "Stratégie de tests et
> validation : tests unitaires, intégration, E2E, manuels..."). Prépare-le une fois, sers-t'en pour les deux
> épreuves.

---

## 0. État des lieux réel — vérifié, pas supposé

Le projet utilise `bun:test` comme framework de test (pas Jest, pas Vitest) — confirmé en lisant les
fichiers de test existants ailleurs dans `game-engine/` (`BossFightManager.test.ts`,
`SnapBallToSurface.test.ts`), qui commencent tous par `import { test, expect } from 'bun:test';`. Le script
`bun test` est déclaré dans `packages/game-engine/package.json`.

**Aucun des 4 fichiers de ta review n'a de fichier `.test.ts` aujourd'hui.** Je l'ai vérifié en listant le
contenu du dossier `infrastructure/` et `use-cases/` : il y a des tests pour `BossFightManager`,
`BossTargetSensor`, `FlipperSplitter`, `MeshRoleResolver`, `PhysicsWorld`, `PlayfieldCameraDirector`, et
`SnapBallToSurface` — mais rien pour `CollisionEventProcessor`, `CollisionHandler`,
`BumperCollisionHandler`, ni `BumperHit`.

Je n'ai pas pu exécuter réellement `bun run test` dans mon environnement (bun n'est pas installé dans mon
sandbox) — lance `bun run test` toi-même dans le repo avant l'oral pour confirmer que le reste de la suite
passe bien, et pouvoir le dire avec certitude si on te le demande.

---

## 1. Tableau récapitulatif

| Fichier | Testé aujourd'hui ? | Testable ? | Difficulté | Type de test approprié |
|---|---|---|---|---|
| `CollisionHandler.ts` | N/A (interface) | N/A | — | Aucun test direct — on teste ses implémentations |
| `BumperHit.ts` | Non | Oui, facilement | Facile | Unitaire, isolé, zéro dépendance lourde |
| `BumperCollisionHandler.ts` | Non | Oui | Moyenne (fixture verbeuse) | Unitaire, avec un fixture `MapLayout` minimal |
| `CollisionEventProcessor.ts` | Non | Difficile en l'état | Difficile | Intégration (vrai monde Rapier) ou refacto pour rendre unitaire |

---

## 2. `CollisionHandler.ts` — comment on teste une interface

On ne teste jamais une interface directement : elle ne contient aucun code exécutable, donc rien à
exécuter, rien à observer. Ce qu'on teste, ce sont ses IMPLÉMENTATIONS concrètes (les 9 classes, dont
`BumperCollisionHandler`). Un piège classique si le jury demande "comment tu testes `CollisionHandler.ts`"
: ne dis pas "je ne le teste pas" tout court — dis que le contrat lui-même est vérifié PAR LE COMPILATEUR
TypeScript (si une classe `implements CollisionHandler` sans fournir `canHandle` et `handle`, ça ne
compile pas), et que le comportement réel est testé au niveau de chaque implémentation.

---

## 3. `BumperHit.ts` — le cas d'école, à connaître par cœur

Zéro dépendance à Rapier, Three.js ou React. Deux dépendances injectées, toutes les deux faciles à
remplacer par des fausses versions (mocks) :

```ts
import { test, expect } from 'bun:test';
import { BumperHit } from './BumperHit';
import type { GameEvent } from '../domain/GameEvents';

test('applies ejection force and emits +1000 points', () => {
  const calls: Array<{ x: number; z: number }> = [];
  const fakeEject = { applyEjectionForce: (pos: { x: number; z: number }) => calls.push(pos) };
  const events: GameEvent[] = [];

  const uc = new BumperHit(fakeEject, (e) => events.push(e));
  uc.execute(2, { x: 0.1, z: -0.2 });

  expect(calls).toEqual([{ x: 0.1, z: -0.2 }]);
  expect(events).toEqual([{ type: 'BUMPER_HIT', bumperIndex: 2, scoreIncrement: 1000 }]);
});
```

**Type de test** : unitaire, pur, isolé — exactement le style déjà utilisé dans `BossFightManager.test.ts`
du projet (`const events: GameEvent[] = []; ... (e) => events.push(e)`), donc cohérent avec la convention
existante, pas une invention de ma part.

**Deuxième test utile à avoir en tête** (montre que tu penses aux cas limites, pas juste au cas nominal) :
vérifier que `bumperIndex` est bien transmis tel quel dans l'event, même avec un index à `0` (piège
classique : `0` peut être confondu avec "falsy"/absent dans du code mal écrit ailleurs, mais ici il est
juste transmis, pas testé pour vérité).

---

## 4. `BumperCollisionHandler.ts` — testable, avec un fixture à assumer

Il faut une fausse `BumperHit` (juste un objet avec `execute`) et un `layout: MapLayout`. Le point de
friction réel : `MapLayout` a beaucoup de champs obligatoires (`dropTargets`, `sensors`, `spawns`,
`shooterLane`, `flipperPivots`, `bosses`, `geometry`, `atmosphere`...) — bien plus que ce dont ce fichier a
besoin (il ne lit que `layout.bumpers`). Solution pragmatique et honnête à assumer à l'oral :

```ts
import { test, expect } from 'bun:test';
import { BumperCollisionHandler } from './BumperCollisionHandler';
import type { MapLayout } from '../domain/MapLayout';
import type { BumperHit } from '../use-cases/BumperHit';

function makeLayout(bumpers: Array<{ x: number; y: number; z: number }>): MapLayout {
  return { bumpers } as unknown as MapLayout; // fixture minimale — seul `bumpers` est lu par ce fichier
}

test('canHandle only matches bumper_ roles', () => {
  const handler = new BumperCollisionHandler([], {} as BumperHit, makeLayout([]));
  expect(handler.canHandle('bumper_0')).toBe(true);
  expect(handler.canHandle('drain')).toBe(false);
});

test('pushes a pending action when the bumper position exists', () => {
  const pending: Array<() => void> = [];
  const calls: number[] = [];
  const fakeUC = { execute: (idx: number) => calls.push(idx) } as unknown as BumperHit;
  const layout = makeLayout([{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 1 }]);

  const handler = new BumperCollisionHandler(pending, fakeUC, layout);
  handler.handle('bumper_1', 'playing', true);

  expect(pending).toHaveLength(1);
  pending[0](); // simule flushPendingPhysics()
  expect(calls).toEqual([1]);
});

test('does nothing when gameState is not playing', () => {
  const pending: Array<() => void> = [];
  const handler = new BumperCollisionHandler(pending, {} as BumperHit, makeLayout([{ x: 0, y: 0, z: 0 }]));
  handler.handle('bumper_0', 'game_over', true);
  expect(pending).toHaveLength(0);
});

test('does nothing when the bumper index has no matching position', () => {
  const pending: Array<() => void> = [];
  const handler = new BumperCollisionHandler(pending, {} as BumperHit, makeLayout([])); // aucun bumper défini
  handler.handle('bumper_5', 'playing', true);
  expect(pending).toHaveLength(0); // le `if (pos)` protège bien ici
});
```

**Le troisième test est le plus important à mentionner à l'oral** : c'est exactement celui qui aurait
attrapé le bug `gameState` qu'on a corrigé — si tu l'avais eu AVANT, il aurait échoué et t'aurait montré le
problème sans avoir à comparer les 9 fichiers à la main. Bon argument pour "pourquoi les tests auraient
aidé ici".

---

## 5. `CollisionEventProcessor.ts` — le cas honnête et difficile

C'est le seul des 4 où je ne te donne pas un test unitaire tout prêt, et c'est volontaire — te le proposer
comme "facile" serait mentir. La raison précise : `process()` prend en paramètre un
`eventQueue: RAPIER.EventQueue`, un vrai objet WASM. Sa méthode `drainCollisionEvents(callback)` n'est pas
une simple fonction qu'on peut remplacer par un mock — c'est un objet Rapier réel, avec un état interne
géré côté WebAssembly.

Deux vraies options, à connaître pour l'oral :

**Option A — test d'intégration avec un vrai (mini) monde Rapier.** On initialise un vrai
`RAPIER.World`, on crée deux colliders qui se recouvrent, on appelle `world.step(eventQueue)` une fois pour
générer un vrai événement de collision, puis on vérifie que `CollisionEventProcessor.process()` réagit
correctement. C'est faisable (le projet le fait déjà indirectement dans `PhysicsWorld.ts` au démarrage),
mais plus lourd à écrire et plus lent à exécuter qu'un test unitaire — d'où le nom "intégration" et pas
"unitaire".

**Option B — refactoriser pour rendre le fichier unitairement testable.** Remplacer le paramètre typé
`RAPIER.EventQueue` par une interface plus abstraite, par exemple `CollisionEventSource` avec juste une
méthode `drainCollisionEvents(cb)`, que Rapier implémenterait "naturellement" (structural typing
TypeScript) mais qu'un faux objet de test pourrait aussi implémenter facilement. C'est le genre
d'amélioration à proposer spontanément si le jury demande "comment rendrais-tu ce fichier plus testable" —
ça montre que tu sais relier testabilité et conception (DIP appliqué au test, pas juste à la prod).

**Ce qui reste testable indirectement dans ce fichier sans toucher à Rapier** : la logique pure qui
n'implique pas `eventQueue` — par exemple `gateContext()`, ou le calcul du cooldown anti-spam
`BOSS_LOCKED_HIT` (`now - (this.lockedHitLastMs[boss.id] ?? 0) >= 2000`) pourraient être extraits en
fonctions pures et testés isolément, même si le fichier entier ne l'est pas facilement aujourd'hui.

---

## 6. Les types de tests à savoir distinguer (question C2.2 quasi garantie au Post-Mortem)

| Type | C'est quoi | Exemple concret sur tes 4 fichiers |
|---|---|---|
| **Unitaire** | Teste une seule unité de code (une fonction/classe), isolée avec des mocks | Le test de `BumperHit.execute()` en §3 |
| **Intégration** | Teste plusieurs composants réels ensemble, sans tout mocker | Un vrai `RAPIER.World` + `CollisionEventProcessor.process()` (§5, option A) |
| **E2E (bout en bout)** | Teste le parcours complet utilisateur, à travers toute l'appli | Lancer une vraie partie sur `apps/playfield`, taper un bumper physiquement/en simulation, vérifier que le score s'affiche sur `apps/dmd` |
| **Manuel** | Vérification humaine, sans script automatisé | Ouvrir le jeu, taper un bumper à la souris/clavier, regarder si le score monte de 1000 |

Sur ces 4 fichiers précisément : aujourd'hui, la seule "stratégie de test" réellement en place, c'est le
test manuel (jouer et regarder). C'est une réponse honnête à donner si le jury pousse — ne dis pas "on a une
stratégie de tests complète", dis plutôt ce que tu proposes en §7.

---

## 7. Plan d'action si t'as le temps avant l'oral (priorisé)

1. **`BumperHit.test.ts`** (§3) — le plus rentable : rapide à écrire, zéro dépendance, démontre à 100% que
   tu sais faire du test unitaire propre.
2. **`BumperCollisionHandler.test.ts`** (§4), au moins le test `gameState` — celui qui aurait attrapé ton
   bug. Bonne histoire à raconter : "voici le test qui aurait évité le bug que j'ai trouvé et corrigé
   manuellement."
3. Ne te lance PAS dans un test d'intégration Rapier pour `CollisionEventProcessor.ts` juste avant
   l'oral — c'est le plus long à mettre en place et le moins rentable en temps limité. Mieux vaut savoir
   EXPLIQUER pourquoi c'est dur (§5) que de bâcler un test fragile.

Si tu veux, dis-le-moi et je peux créer les vrais fichiers `.test.ts` dans ton repo (pas juste les extraits
dans ce document) — pour l'instant je ne l'ai pas fait pour rester sur la préparation documentaire que tu
as demandée.
