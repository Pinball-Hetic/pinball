# Tests — les 4 fichiers (CollisionEventProcessor, CollisionHandler, BumperCollisionHandler, BumperHit)

> Fichier dédié uniquement au sujet des tests, séparé du reste de la prep. Ce sujet compte double pour toi :
> il tombe dans **Code Review** (compétence C3.3 — "Procéder aux corrections d'erreurs et optimisations",
> qui inclut "test et validation"), ET dans **Post-Mortem** (compétence C2.2 — "Stratégie de tests et
> validation : tests unitaires, intégration, E2E, manuels..."). Prépare-le une fois, sers-t'en pour les deux
> épreuves.
>
> **Mise à jour du 09/07 : cette version remplace entièrement la précédente.** La 1ère version de ce
> document affirmait "aucun des 4 fichiers n'a de test aujourd'hui" — c'était vrai au moment où elle a été
> écrite, ça ne l'est plus. Un coéquipier (Hugo) a ajouté une suite de tests complète sur `game-engine`
> (commit `a1e5ce8`, "Test/coverage pyramid", + un fix `40233dc` d'Anthony), déplacée depuis vers un dossier
> `test/` miroir (`d5abe66`). Ce document décrit maintenant les VRAIS tests existants, lus directement dans
> le repo — plus des exemples fictifs. Sois transparent si le jury demande "as-tu écrit ces tests" : la
> réponse honnête est non, mais tu peux les lire, les expliquer ligne à ligne, et dire précisément ce qu'ils
> couvrent et pourquoi.

---

## 0. État des lieux réel — vérifié dans le repo

Framework : `bun:test` (pas Jest, pas Vitest) — confirmé, tous les fichiers de test commencent par
`import { test, expect, mock } from 'bun:test';`. Les tests vivent maintenant dans
`packages/game-engine/test/`, en miroir de `src/` (`test/infrastructure/`, `test/use-cases/`), et non plus
co-localisés à côté du code source.

Sur les 4 fichiers précis de cette review :

| Fichier | Fichier de test | Nombre de tests | Auteur |
|---|---|---|---|
| `CollisionHandler.ts` | — (aucun, normal) | 0 | — |
| `BumperHit.ts` | `test/use-cases/BumperHit.test.ts` | 5 | Hugo (a1e5ce8) |
| `BumperCollisionHandler.ts` | `test/infrastructure/BumperCollisionHandler.test.ts` | 5 | Hugo (a1e5ce8) + fix Anthony (40233dc) |
| `CollisionEventProcessor.ts` | `test/infrastructure/CollisionEventProcessor.test.ts` | 3 | Hugo (a1e5ce8), niveau intégration légère |

Lance `bun test` toi-même dans `packages/game-engine/` avant l'oral pour confirmer que tout passe, et pouvoir
le dire avec certitude si on te le demande — c'est une question probable ("est-ce que la suite de tests
passe aujourd'hui ?").

---

## 1. Tableau récapitulatif

| Fichier | Testé aujourd'hui ? | Type de test | Ce que ça couvre |
|---|---|---|---|
| `CollisionHandler.ts` | N/A (interface) | — | Contrat vérifié par le compilateur, pas par un test |
| `BumperHit.ts` | Oui, 5 tests | Unitaire, isolé | Force appliquée, event émis, ordre d'appel, valeurs non clampées |
| `BumperCollisionHandler.ts` | Oui, 5 tests | Unitaire, isolé | `canHandle`, parsing d'index, garde `started`, garde position, garde `gameState` (régression) |
| `CollisionEventProcessor.ts` | Oui, 3 tests | Intégration légère (Rapier mocké) | Régression `splice`/flush, régression `gameState`, drain après un cycle de flush |

---

## 2. `CollisionHandler.ts` — pourquoi zéro test, et ce n'est pas un trou

On ne teste jamais une interface directement : elle ne contient aucun code exécutable. Ce qu'on teste, ce
sont ses implémentations concrètes (les 10 classes, dont `BumperCollisionHandler` et
`BossCollisionHandler`). Si le jury demande "comment tu testes `CollisionHandler.ts`" : le contrat est
vérifié PAR LE COMPILATEUR TypeScript (une classe `implements CollisionHandler` sans fournir `canHandle` et
`handle` ne compile pas), et le comportement réel est testé au niveau de chaque implémentation — ce qui est
exactement ce que fait la suite de tests actuelle.

---

## 3. `BumperHit.ts` — le use-case, 5 tests réels

Contenu exact de `test/use-cases/BumperHit.test.ts` :

```ts
import { test, expect, mock } from 'bun:test';
import { BumperHit, type IBumperEject } from '../../src/use-cases/BumperHit';
import { SCORE_BUMPER } from '../../src/domain/ScoringConstants';
import type { GameEvent } from '../../src/domain/GameEvents';

function setup() {
  const ejectCalls: { x: number; z: number }[] = [];
  const eject: IBumperEject = { applyEjectionForce: (pos) => ejectCalls.push(pos) };
  const events: GameEvent[] = [];
  const emit = mock((e: GameEvent) => events.push(e));
  return { ejectCalls, eject, events, emit, hit: new BumperHit(eject, emit) };
}

test('applique la force d ejection à la position du bumper', () => { /* ... */ });
test('émet BUMPER_HIT avec index et score', () => { /* ... */ });
test('ejection appelée avant emit', () => { /* ... */ });
test('propage la position négative telle quelle (pas de clamp)', () => { /* ... */ });
test('chaque execute déclenche un nouvel évènement', () => { /* ... */ });
```

Les 5 tests, dans l'ordre :
1. La force d'éjection est bien appliquée à la position transmise.
2. L'event `BUMPER_HIT` contient bien l'index et `SCORE_BUMPER` (1000).
3. **Ordre d'appel garanti** : `eject` avant `emit` — un test dédié qui pousse dans un tableau `order` pour
   vérifier la séquence, pas juste que les deux ont été appelés.
4. Une position négative (`{x: -999, z: 999}`) est propagée telle quelle — pas de clamp caché.
5. Deux appels à `execute()` produisent bien deux events distincts, avec les bons index.

**Point à savoir dire à l'oral** : ces tests utilisent des fakes écrits à la main (un objet littéral qui
pousse dans un tableau), pas des mocks génériques type `jest.fn()`, sauf pour `emit` qui utilise `mock()` de
`bun:test`. C'est cohérent avec le style déjà utilisé ailleurs dans `game-engine` (`BossFightManager.test.ts`).
Zéro dépendance à Rapier, Three.js ou React dans ce fichier de test — exactement ce qu'on attend d'un test
de Use Case pur.

---

## 4. `BumperCollisionHandler.ts` — 5 tests réels, dont la régression `gameState`

Contenu exact de `test/infrastructure/BumperCollisionHandler.test.ts` (fixture `MapLayout` en cast partiel,
comme anticipé dans la version précédente de ce document) :

```ts
function makeLayout(bumpers: Array<{ x: number; z: number }>): MapLayout {
  return { bumpers } as unknown as MapLayout;   // seul `bumpers` est lu par ce fichier
}

test('canHandle matche les rôles préfixés bumper_', () => { /* ... */ });
test('exécute le use-case avec idx parsé + position du layout', () => { /* ... */ });
test('no-op si started=false', () => { /* ... */ });
test('no-op si aucune position de bumper pour cet index', () => { /* ... */ });
test('no-op si gameState != playing (régression : garde game_over/idle)', () => { /* ... */ });
```

Le 5e test est **le plus important à connaître par cœur** — c'est un test de non-régression écrit
précisément pour le bug identifié dans cette prep (§4/§6/§8 de `PREPA_CODE_REVIEW_CollisionHandlers.md`) :

```ts
test('no-op si gameState != playing (régression : garde game_over/idle)', () => {
  const { uc, calls } = makeBumperHitUC();
  const pending: Array<() => void> = [];
  const h = new BumperCollisionHandler(pending, uc as never, makeLayout([{ x: 0, z: 0 }]));

  h.handle('bumper_0', 'game_over', true);
  h.handle('bumper_0', 'idle', true);
  expect(pending.length).toBe(0);

  // Sanity: in 'playing' the use-case is scheduled.
  h.handle('bumper_0', 'playing', true);
  drain(pending);
  expect(calls).toEqual([{ idx: 0, pos: { x: 0, z: 0 } }]);
});
```

Ce test vérifie explicitement les DEUX états hors partie (`game_over` ET `idle`), pas juste un seul, puis
confirme en positif que `'playing'` fonctionne bien — un bon exemple de test qui couvre le cas négatif ET le
cas nominal dans le même bloc, pour prouver que la garde ne casse rien d'autre.

**Ce que ça démontre à l'oral** : le bug `gameState` n'est plus juste "trouvé et corrigé", il est
maintenant **surveillé structurellement** — s'il revient un jour (regression accidentelle), la suite de
tests échoue immédiatement, avant même d'arriver en revue de code.

---

## 5. `CollisionEventProcessor.ts` — 3 tests d'intégration légère, sans vrai Rapier

Contenu exact de `test/infrastructure/CollisionEventProcessor.test.ts`. Le point clé : ces tests ne créent
PAS de vrai `RAPIER.World` — ils fabriquent un faux `EventQueue` minimal :

```ts
function queueFor(roleHandle: number) {
  return {
    drainCollisionEvents: (cb: (h1: number, h2: number, started: boolean) => void) => {
      cb(0, roleHandle, true);
    },
  } as never;
}
```

C'est exactement l'**Option B** envisagée dans la version précédente de ce document ("interface abstraite
que Rapier implémente naturellement, qu'un faux objet peut aussi implémenter") — sauf qu'ici, pas besoin de
créer une vraie interface dédiée : le *structural typing* de TypeScript suffit, parce que
`drainCollisionEvents(cb)` est la seule méthode réellement utilisée par `process()`. Bon exemple concret à
citer si le jury demande "comment as-tu rendu ce fichier testable sans Rapier".

Les 3 tests, chacun documentant explicitement le bug qu'il garde en régression :

1. **`deferred physics still runs on the 2nd flush cycle (bumper)`** — le test du bug `splice` vs
   réassignation (§3 de `PREPA_CODE_REVIEW_CollisionHandlers.md`). Il fait DEUX cycles complets
   process→flush et vérifie que le use-case bumper est appelé 2 fois, pas seulement 1. Avec l'ancien bug de
   réassignation, ce test aurait échoué au 2e cycle.
2. **`bumper collision during game_over does not run the use-case (régression)`** — la même régression
   `gameState` que le test unitaire de `BumperCollisionHandler`, mais vérifiée cette fois au niveau du
   processor complet (bout en bout : `process()` → dispatch → handler → garde).
3. **`bottom_out still drains on a later flush cycle (game-over path)`** — vérifie que le drain (bille
   perdue, `bottom_out`) fonctionne toujours après un premier cycle de flush déjà consommé — encore une
   variante du bug `splice`, sur un chemin différent (bottom_out plutôt que bumper).

**Nuance à assumer à l'oral** : ce ne sont pas des tests unitaires purs au sens strict (ils passent par
`process()` + `flushPendingPhysics()` ensemble, avec un vrai `CollisionEventProcessor`, une vraie
`Map<number,string>`, et des use-cases mockés) — plus proches de l'intégration légère. C'est un compromis
pragmatique : tester le vrai comportement du fichier sans dépendre de Rapier/WASM, au prix de ne pas isoler
totalement chaque méthode. Bonne réponse si le jury demande "pourquoi pas des tests 100% unitaires ici" :
`process()` n'a de sens qu'en interaction avec le dispatch + les handlers + le flush — les isoler séparément
testerait moins fidèlement le vrai risque (l'intégration entre ces pièces, précisément où vivaient les deux
bugs ci-dessus).

---

## 6. Les types de tests à savoir distinguer (question C2.2 quasi garantie au Post-Mortem)

| Type | C'est quoi | Exemple concret sur tes 4 fichiers |
|---|---|---|
| **Unitaire** | Teste une seule unité de code, isolée avec des fakes/mocks | `BumperHit.test.ts` (§3), `BumperCollisionHandler.test.ts` (§4) |
| **Intégration** | Teste plusieurs composants réels ensemble, sans tout mocker | `CollisionEventProcessor.test.ts` (§5) — processor réel + handlers réels, seul Rapier est remplacé |
| **E2E (bout en bout)** | Teste le parcours complet utilisateur, à travers toute l'appli | Lancer une vraie partie sur `apps/playfield`, taper un bumper, vérifier que le score s'affiche sur `apps/dmd` — n'existe pas aujourd'hui sur ce circuit |
| **Manuel** | Vérification humaine, sans script automatisé | Ouvrir le jeu, taper un bumper à la souris/clavier, regarder si le score monte de 1000 |

Sur ces 4 fichiers précisément, la stratégie de test réelle en place aujourd'hui : unitaire sur les 2 fichiers
qui le permettent facilement, intégration légère sur l'orchestrateur, rien en E2E automatisé, et le test
manuel reste la seule vérification de bout en bout. Réponse honnête à donner si le jury pousse sur "stratégie
de tests complète" : la pyramide de tests est amorcée (bonne base unitaire + intégration), mais rien
n'automatise encore le chemin complet clavier/ESP32 → score affiché.

---

## 7. Ce qui reste un vrai trou, si le jury creuse

- **`CollisionHandler.ts`** n'a pas de test de "contrat" générique qui vérifierait que tous les handlers du
  tableau respectent une invariant commune (ex. `canHandle` ne doit jamais lever d'exception). Mineur, mais
  un point à mentionner spontanément si demandé "que testerais-tu en plus".
- **`BossCollisionHandler.ts`** a son propre fichier de test (`test/infrastructure/BossCollisionHandler.test.ts`,
  hors périmètre des 4 fichiers présentés) — bon à savoir qu'il existe si le jury explore au-delà des 4
  fichiers annoncés.
- **Aucun test E2E automatisé** sur le circuit complet bumper → score. Seul un test manuel couvre ce chemin
  aujourd'hui.
- **Le test d'intégration `CollisionEventProcessor.test.ts` ne teste jamais un vrai `RAPIER.EventQueue`** —
  un vrai bug d'API Rapier (ex. un changement de signature dans une future version de la lib) ne serait pas
  détecté par cette suite, seulement par un test avec un vrai monde physique ou en usage réel.
