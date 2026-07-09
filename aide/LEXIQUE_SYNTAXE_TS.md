# Lexique syntaxe TypeScript — les 4 fichiers

> Objectif : plus jamais bloqué sur "c'est quoi ce symbole". Chaque entrée cite la ligne EXACTE d'un de tes
> 4 fichiers où le symbole apparaît — pas un exemple générique. Lis chaque entrée à voix haute, ferme le
> document, réexplique-la avec tes mots.

---

## `private readonly` dans un constructeur

```ts
constructor(
  private readonly pendingPhysics: Array<() => void>,
  private readonly bumperHitUC: BumperHit,
  private readonly layout: MapLayout,
) {}
```
*(`BumperCollisionHandler.ts`)*

C'est un raccourci TypeScript qui fait deux choses en une seule ligne : il déclare le paramètre du
constructeur ET il crée automatiquement une propriété sur la classe avec la même valeur. Sans ce raccourci,
il faudrait écrire :
```ts
private readonly pendingPhysics: Array<() => void>;
constructor(pendingPhysics: Array<() => void>) {
  this.pendingPhysics = pendingPhysics;
}
```
`private` = accessible seulement depuis l'intérieur de la classe. `readonly` = assignable une seule fois
(ici, au moment de la construction), plus jamais modifiable ensuite.

**Si le jury demande** : *"Pourquoi ne pas juste écrire `pendingPhysics: Array<() => void>` sans
`private readonly` ?"* → Parce que sans ce mot-clé, c'est un simple paramètre local à la fonction
constructeur — il disparaît une fois le constructeur terminé. Avec `private readonly`, il devient une
propriété de l'objet, accessible depuis toutes les autres méthodes de la classe via `this.pendingPhysics`.

---

## `implements`

```ts
export class BumperCollisionHandler implements CollisionHandler {
```
*(`BumperCollisionHandler.ts`)*

Ça déclare que cette classe s'engage à fournir toutes les méthodes définies dans l'interface
`CollisionHandler` (`canHandle` et `handle`). Si une des deux manque, ou si sa signature ne correspond pas
exactement, TypeScript refuse de compiler. C'est le compilateur qui vérifie le contrat pour toi.

---

## `import type` vs `import`

```ts
import type { CollisionHandler } from './CollisionHandler';   // contrat pur, disparaît à la compilation
import { SCORE_BUMPER } from '../domain/ScoringConstants';    // valeur réelle, existe à l'exécution
```
Détail complet déjà couvert dans le document principal (`PREPA_CODE_REVIEW_CollisionHandlers.md`, §3) — à
retenir en une phrase : `import type` = uniquement pour typer, `import` normal = pour utiliser une vraie
valeur/classe/fonction au runtime.

---

## `?.` — optional chaining

```ts
handler?.handle(role, gameState, started);
```
*(`CollisionEventProcessor.ts`, dans `process()`)*

Si `handler` vaut `undefined` (aucun handler trouvé pour ce rôle), toute la ligne s'arrête là et retourne
`undefined`, sans planter. Sans le `?.`, ce serait `handler.handle(...)`, qui lèverait une erreur
`TypeError: Cannot read properties of undefined` si `handler` est `undefined`.

**Test mental** : `?.` = "si ce qui précède existe, continue ; sinon, arrête-toi proprement ici."

---

## `??` — nullish coalescing

```ts
const role = this.colliderMap.get(h1) ?? this.colliderMap.get(h2);
```
*(`CollisionEventProcessor.ts`, dans `process()`)*
```ts
if (now - (this.lockedHitLastMs[boss.id] ?? 0) >= 2000) {
```
*(`BossCollisionHandler.ts` — ce bloc a été déplacé hors de `CollisionEventProcessor.ts`, voir
`PREPA_CODE_REVIEW_CollisionHandlers.md` §3, mais le mécanisme `??` reste le même exemple à citer)*

`a ?? b` veut dire "utilise `a`, sauf s'il vaut `null` ou `undefined` — dans ce cas, utilise `b`". Dans le
premier exemple : si `colliderMap.get(h1)` ne trouve rien (`undefined`), on essaie `h2` à la place. Dans le
deuxième : si `lockedHitLastMs[boss.id]` n'existe pas encore (jamais touché), on traite ça comme `0`.

**Piège classique à connaître** : `??` n'est PAS pareil que `||`. `0 || 5` vaut `5` (parce que `0` est
"falsy" en JS), mais `0 ?? 5` vaut `0` (parce que `0` n'est ni `null` ni `undefined`). C'est exactement
pour ça qu'on utilise `??` et pas `||` sur `lockedHitLastMs[boss.id] ?? 0` — un timestamp à `0` doit rester
`0`, pas être remplacé.

---

## Les lambdas / arrow functions

```ts
() => this.worldState.isActive()
() => this.bumperHitUC.execute(idx, pos)
() => this.dropTargetHandler.resetDropTargets()
```

Une fonction anonyme, sans nom, écrite avec `() => ...`. Ici elle sert à **différer** une action (l'exécuter
plus tard) ou à créer un **getter** (relire une valeur à chaque appel plutôt que la figer). Détail complet
déjà couvert dans le document principal §3, point 4 — à savoir resortir : *"une valeur primitive est copiée,
une lambda capture `this` et relit la propriété à chaque appel."*

---

## Les génériques (`<...>`)

```ts
Array<() => void>              // un tableau dont chaque élément est une fonction sans argument qui ne retourne rien
Map<string, BossDefinition>    // une Map dont les clés sont des string, les valeurs des BossDefinition
Map<number, string>            // colliderMap : clé = numéro de collider, valeur = nom du rôle
Partial<Record<BossId, number>> // voir juste en-dessous
```

Les chevrons `<...>` paramètrent un type générique — ils précisent CE QUE contient la structure. `Array<X>`
= tableau de `X`. `Map<K, V>` = dictionnaire clé de type `K`, valeur de type `V`.

**`Partial<Record<BossId, number>>`**, en détail (`CollisionEventProcessor.ts`, propriété `lockedHitLastMs`) :
- `Record<BossId, number>` = un objet dont TOUTES les clés possibles de `BossId` doivent être présentes,
  chacune associée à un `number`.
- `Partial<...>` = rend toutes ces clés optionnelles. Sans `Partial`, TypeScript exigerait qu'on renseigne
  une valeur pour CHAQUE boss dès la création de l'objet — avec `Partial`, on peut commencer avec `{}` et
  ajouter les entrées au fur et à mesure que chaque boss est touché pour la première fois.

---

## Type inline pour un objet

```ts
applyEjectionForce(bumperPosition: { x: number; z: number }): void;
```
*(`BumperHit.ts`, interface `IBumperEject`)*

Au lieu de définir un type nommé à part (`type Position = { x: number; z: number }`), on écrit directement
la forme attendue entre accolades, là où elle est utilisée. Utile quand ce type n'est utilisé qu'à cet
endroit précis et ne mérite pas d'être nommé séparément.

---

## `Array.find()` avec une fonction fléchée

```ts
const handler = this.handlers.find(h => h.canHandle(role));
```
*(`CollisionEventProcessor.ts`)*

`find()` parcourt le tableau dans l'ordre et retourne le PREMIER élément pour lequel la fonction passée en
argument retourne `true`. Ici, pour chaque handler `h` du tableau, on teste `h.canHandle(role)` ; dès que
ça répond `true`, `find()` s'arrête et retourne ce handler. Si aucun ne matche, `find()` retourne
`undefined` — d'où le `?.` juste après dans `handler?.handle(...)`.

---

## Méthodes sur les chaînes de caractères

```ts
role.startsWith('bumper_')          // teste si la chaîne commence par ce préfixe → booléen
role.split('_')[1]                  // découpe la chaîne sur '_', prend le 2e morceau
parseInt(role.split('_')[1], 10)    // convertit ce morceau texte en nombre entier, en base 10
```
*(`BumperCollisionHandler.ts`)*

Sur `'bumper_2'` : `split('_')` donne `['bumper', '2']`, `[1]` prend `'2'` (encore du texte), `parseInt(...,
10)` le convertit en nombre `2`. Le `10` explicite qu'on veut une conversion en base décimale (base 10) —
sans lui, `parseInt` peut deviner une autre base dans certains cas anciens (ex. préfixe `0x` → hexadécimal),
donc c'est une bonne pratique de toujours le préciser.

---

## Annotations de type sur une méthode

```ts
handle(role: string, gameState: string, started: boolean): void {
```

Après chaque paramètre, `: type` précise ce qu'il doit être (`role` doit être une chaîne, `started` un
booléen). Après la parenthèse fermante, `: void` précise ce que la méthode RETOURNE — ici, rien du tout
(elle produit un effet de bord, comme empiler dans un tableau, mais ne renvoie pas de valeur exploitable).

---

## `export interface` vs `export class`

```ts
export interface CollisionHandler { ... }   // un contrat, zéro code exécutable, disparaît à la compilation
export class BumperCollisionHandler { ... } // du vrai code, instanciable avec `new`, existe à l'exécution
```

Une interface décrit une FORME (quelles méthodes, quels types), une classe fournit une IMPLÉMENTATION
réelle de cette forme. `export` rend l'élément importable depuis un autre fichier.

---

## `import * as X` — import en namespace

```ts
import * as RAPIER from '@dimforge/rapier3d-compat';
```
*(`CollisionEventProcessor.ts`, tout en haut)*

Différent d'un `import { X }` (import nommé) ou d'un `import X` (import par défaut) : `import * as RAPIER`
regroupe TOUT ce que le module exporte sous un seul objet, ici nommé `RAPIER`. On accède ensuite à chaque
élément avec `RAPIER.EventQueue`, `RAPIER.World`, etc. Utile quand un module exporte beaucoup de choses (types
+ classes + fonctions) et qu'on préfère les référencer sous un préfixe commun plutôt que les importer un par
un. Dans ce fichier précis, `RAPIER` n'est utilisé QUE comme espace de noms de type
(`RAPIER.EventQueue` dans la signature de `process()`) — aucune instanciation `new RAPIER.X()` n'a lieu ici.

---

## `.splice(0)` — vider un tableau en place

```ts
const pending = this.pendingPhysics.splice(0);
```
*(`CollisionEventProcessor.ts`, `flushPendingPhysics()`)*

`splice(start)` retire et retourne tous les éléments du tableau à partir de l'index `start`, EN MODIFIANT le
tableau original. `splice(0)` retire donc tout, et retourne tout — le tableau original (`this.pendingPhysics`)
se retrouve vide, mais reste le MÊME objet en mémoire (même référence). C'est la différence essentielle avec
`this.pendingPhysics = []`, qui crée un tableau tout neuf et fait pointer `this.pendingPhysics` dessus, en
abandonnant l'ancien. Un code qui détient une référence vers l'ancien tableau (comme les handlers construits
avec `new BumperCollisionHandler(this.pendingPhysics, ...)`) ne voit JAMAIS cette réassignation — il continue
de pointer vers l'ancien tableau. `.splice(0)`, lui, modifie le contenu du tableau que tout le monde regarde
déjà, donc tout le monde voit le changement. Détail complet et implication du bug :
`PREPA_CODE_REVIEW_CollisionHandlers.md` §3, point 3.

---

## Valeur par défaut d'un paramètre de constructeur

```ts
private readonly now: () => number = () => performance.now(),
```
*(`CollisionEventProcessor.ts`, dernier paramètre du constructeur)*

`= () => performance.now()` après le type est une valeur PAR DÉFAUT : si l'appelant ne fournit pas ce
paramètre au moment de faire `new CollisionEventProcessor(...)`, TypeScript utilise automatiquement cette
valeur. Ici la valeur par défaut est elle-même une fonction (`() => performance.now()`), cohérent avec le
type attendu (`() => number`). En prod, personne ne passe ce dernier argument → le vrai chronomètre du
navigateur est utilisé. En test, on peut passer une fonction différente (`() => 1000`) pour contrôler le
temps de façon déterministe — c'est le mécanisme qui rend `BossFightManager`/`BossCollisionHandler`
testables sans dépendre du temps réel qui s'écoule pendant le test.
