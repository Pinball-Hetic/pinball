# Préparation Code Review — CollisionEventProcessor / CollisionHandler / BumperCollisionHandler / BumperHit

> Document de préparation à l'oral technique individuel (épreuve Code Review, Bloc 3).
> Basé sur le code réel du repo (`packages/game-engine/src/`), sur ton Guide de Lecture et tes Questions
> d'entraînement déjà préparés, et sur la Fiche Focus HETIC (attentes officielles).
> Mise à jour : le 3e fichier initialement prévu (`DropTargetCollisionHandler.ts`) a été remplacé par le
> duo `BumperCollisionHandler.ts` (infrastructure) + `BumperHit.ts` (use-case), pour montrer le circuit
> complet Adapter → Use Case et coller à la fiche "Clean Architecture — PRIORITÉ ABSOLUE".
> Partie 1/N — d'autres fichiers viendront s'ajouter à cette fiche.
>
> **Mise à jour du 09/07** : le repo `dev` a évolué depuis la première version de cette fiche (merge de
> `#118` chore comments, `#112` tests, `#119` déplacement des tests, et un fix `40233dc` d'Anthony). Cette
> fiche a été resynchronisée sur le code **actuel**. Les 4 fichiers présentés restent les mêmes ;
> `CollisionEventProcessor.ts` a en revanche été retravaillé par l'équipe (boss logic → `BossCollisionHandler`,
> monde alternatif → `AlternateWorldState`, horloge injectée, `flushPendingPhysics` corrigé). Transparence :
> une partie de ce qui suit décrit du code écrit ou modifié par des coéquipiers (Hugo, Anthony) — voir la
> note d'authorship à la fin de chaque section concernée. Défendre CE code n'exige pas d'en être l'unique
> auteur : il faut savoir l'expliquer et justifier les choix, ce que cette fiche prépare.

---

## 0. Rappel : ce que le jury regarde (Fiche Focus HETIC)

L'épreuve Code Review est **déterminante** (elle valide le Bloc 3). Oral technique **individuel**, ton code
sous les yeux de l'évaluateur, ~20-30 min, **il peut te demander une modification en direct**.

Ce qu'il vérifie concrètement, et où le retrouver dans ces 4 fichiers :

| Ce qu'il vérifie | Compétence | Où ça se voit dans ces 4 fichiers |
|---|---|---|
| Lisibilité, nommage, conventions | C3.1 | JSDoc sur `CollisionHandler`/`BumperCollisionHandler`, nommage explicite (`canHandle`, `handle`, `applyEjectionForce`) |
| Respect des spécifications | C3.1 | Le dispatch fait exactement ce qui est attendu : un rôle de collider → un seul handler responsable |
| Maîtrise du langage/framework | C3.2 | TypeScript (`import type`, interfaces), Rapier3D (`EventQueue`, contrainte anti-mutation), interface `IBumperEject` définie côté use-case (DIP + ISP) |
| Capacité à expliquer tes choix | C3.1/C3.2 | Pourquoi Strategy ? Pourquoi `pendingPhysics` ? Pourquoi l'interface `IBumperEject` est dans le use-case et pas ailleurs ? |
| Debugging | C3.3 | Le crash Rapier si on mute la physique dans le callback — tu dois savoir l'expliquer et le reproduire |
| Correction & validation | C3.3 | Comment tu testerais `BumperHit` isolément (mock `IBumperEject` + mock `emit`) |
| Vocabulaire technique | C3.1 | Strategy pattern, OCP, DIP, ISP, polymorphisme, encapsulation, Use Case |
| Attitude face à la critique | — | Si l'évaluateur pointe une faiblesse (voir §6 "bug connu" et §8 audit), l'assumer plutôt que se justifier |

Pièges à éviter (rappel direct de la fiche) : ne pas savoir expliquer une ligne précise, vocabulaire flou
("le truc qui fait..."), se braquer si on te challenge, ne pas savoir refaire une modif simple en direct.

---

## 1. Vue d'ensemble — comment les 4 fichiers s'articulent

```
CollisionEventProcessor          (Adapter — orchestrateur)
  │
  │  possède un registre ordonné (priorité : boss d'abord, cf §3) :
  ▼
handlers: CollisionHandler[]     (interface — le contrat Strategy)
  │
  ├─ BossCollisionHandler        ← consomme tout rôle de boss en 1er, jamais de fallthrough
  ├─ BumperCollisionHandler      ← fichier présenté, dispatch + plomberie physique
  ├─ BumpCollisionHandler
  ├─ BottomOutCollisionHandler   ← gère aussi le drain (plus de DrainCollisionHandler séparé)
  ├─ SlingshotCollisionHandler
  ├─ PopZoneCollisionHandler
  ├─ ScoopCollisionHandler
  ├─ RocketRampCollisionHandler
  ├─ DropTargetCollisionHandler
  └─ PortalCollisionHandler
       │
       │  BumperCollisionHandler.handle() empile une action dans pendingPhysics
       ▼
BumperHit                        (Use Case — la vraie règle métier, autre couche)
  │
  ├─ applyEjectionForce(pos)     → délégué à IBumperEject, implémenté par BallPhysics (infra)
  └─ emit(BUMPER_HIT, +1000 pts) → SCORE_BUMPER (domain/ScoringConstants.ts)
```

`CollisionEventProcessor` délègue aussi deux blocs d'état à des classes dédiées, instanciées dans son
constructeur : `BossFightManager` (logique de combat de boss) et `AlternateWorldState` (flag monde
alternatif + baselines de score — extrait depuis la 1ère version de cette fiche, voir §3 et §8).

Phrase à avoir prête à l'oral : *"CollisionEventProcessor est un Adapter au sens Clean Architecture — il
traduit les events physiques bruts de Rapier en appels de Use Cases. Il ne contient aucune règle métier
lui-même : il délègue à des handlers qui implémentent tous la même interface CollisionHandler (pattern
Strategy, OCP). BumperCollisionHandler est l'un de ces handlers — lui non plus ne décide rien, il traduit
juste 'quel bumper, à quelle position' et transmet au Use Case BumperHit, qui est la seule classe qui
connaît la vraie règle du jeu (+1000 points, force d'éjection)."*

Ça relie directement le Jour 7 (Clean Architecture — priorité absolue pour cette épreuve) et le Jour 5
(Design Patterns) de tes fiches : Adapter + Strategy + OCP + DIP, quatre concepts qui s'expriment ensemble
sur ce seul circuit.

---

## 2. `CollisionHandler.ts` — le contrat

### À quoi ça sert

Une interface TypeScript de 2 méthodes : `canHandle(role)` et `handle(role, gameState, started)`. Zéro
code exécutable — un contrat pur. Chaque type de collision (bumper, drain, drop target...) a sa propre
classe qui l'implémente.

```ts
export interface CollisionHandler {
  canHandle(role: string): boolean;
  handle(role: string, gameState: string, started: boolean): void;
}
```

C'est la mise en pratique directe de ta Fiche #3 (Jour 2) : *"Interface = contrat sans code. implements =
je promets de respecter le contrat."* Et de ta Fiche #4 : *"typer sur l'interface, jamais sur la classe
concrète"* — `CollisionEventProcessor` type son registre `handlers: CollisionHandler[]`, jamais
`BumperCollisionHandler[]`.

### Questions probables + éléments de réponse

**Pourquoi une interface plutôt qu'une classe abstraite ?**
Aucun code partagé entre les handlers à factoriser — juste un contrat de comportement. Une interface
suffit et reste plus légère (pas de contrainte d'héritage simple comme avec une classe abstraite).

**En quoi ça illustre l'OCP ?**
Pour ajouter un nouveau type de collision (ex. un `FlipperCollisionHandler`), je crée une classe qui
implémente `CollisionHandler`, je l'instancie et je l'ajoute au tableau `handlers` dans le constructeur de
`CollisionEventProcessor`. Aucune ligne existante n'est modifiée — le fichier est "fermé à la modification,
ouvert à l'extension".

**Pourquoi `canHandle()` est séparée de `handle()` plutôt qu'un seul `handle()` qui retournerait
`false` s'il ne gère pas ?**
Séparation claire des responsabilités : `canHandle` répond à "est-ce que ce rôle me concerne ?" (une
question), `handle` répond à "que dois-je faire ?" (une action). Ça permet aussi à
`CollisionEventProcessor` d'utiliser `Array.find()` proprement, sans avoir à interpréter une valeur de
retour ambiguë de `handle()`.

**Est-ce que c'est vraiment le pattern Strategy et pas autre chose (ex. Chain of Responsibility) ?**
C'est Strategy dans l'esprit (une famille d'algorithmes interchangeables derrière une interface commune),
avec une nuance : le "choix" de la stratégie active se fait par `canHandle()` plutôt que d'être injecté à
l'avance. On pourrait aussi le décrire comme un registre polymorphique / dispatch table. Le point important
à l'oral : ne pas se braquer sur le nom exact du pattern, mais savoir expliquer le mécanisme (interface
commune + tableau ordonné + `find()`).

---

## 3. `CollisionEventProcessor.ts` — l'orchestrateur

### À quoi ça sert

C'est le point d'entrée unique appelé à chaque frame (`process()`, ~60x/seconde) pour traiter toutes les
collisions détectées par Rapier3D. Il fait quatre choses, et seulement ça :

1. Résoudre le **rôle** du collider touché (via `colliderMap`)
2. Gérer la **priorité des boss fights** (court-circuite tout le reste s'ils consomment l'event)
3. **Dispatcher** vers le bon `CollisionHandler` (polymorphisme)
4. Exposer une **API publique restreinte** pour piloter l'état du jeu depuis l'extérieur (monde alternatif,
   portail, drop targets, boss) sans exposer les handlers internes

Il ne fait **jamais** de physique lui-même — c'est délégué aux use-cases injectés (`BumperHit`, `BumpHit`,
`DrainBall`, `BottomOutBall`) et aux handlers.

### Les points que tu dois pouvoir expliquer ligne à ligne

Version actuelle du fichier (202 lignes) — les 5 mécanismes les plus susceptibles d'être questionnés :

**1. `import type` vs import normal**
`import type` = contrat TypeScript pur, disparaît à la compilation, jamais instanciable (`BumperHit`,
`CollisionHandler`, `MapLayout`, `BossId`...). Import normal = classe/fonction réelle instanciable avec
`new` (`BossFightManager`, `AlternateWorldState`, les 10 handlers concrets). Un détail à noter : Rapier est
importé en `import * as RAPIER from '@dimforge/rapier3d-compat'` (namespace, pas default) — utile seulement
comme espace de noms de types (`RAPIER.EventQueue` dans la signature de `process()`), jamais instancié ici.
Test rapide à l'oral : si tu ne peux pas répondre "est-ce que je pourrais faire `new` avec ce truc ?", c'est
que tu ne maîtrises pas encore la distinction.

**2. Deux classes d'état déléguées, instanciées dans le constructeur : `worldState` et `bossFights`**
```ts
private readonly worldState = new AlternateWorldState();
private readonly bossFights: BossFightManager;   // assignée dans le constructeur (a besoin de `now`)
```
Ce ne sont **pas** des handlers (elles n'implémentent pas `CollisionHandler`), ce sont des porteurs d'état
purs, dans le même style que `BallDiagnostics` : `AlternateWorldState` porte le flag `active` + les
baselines de score (4 champs, ~10 méthodes) ; `BossFightManager` porte la logique de combat (déjà extraite
avant cette mise à jour). `CollisionEventProcessor` ne fait qu'exposer des méthodes publiques fines qui
délèguent à l'une ou l'autre (`isAlternateWorldActive()` → `worldState.isActive()`, etc.) — c'est de la
**Facade** légère par-dessus deux state holders, pas de la logique métier propre.

**3. `pendingPhysics: Array<() => void>` — et pourquoi `splice(0)`, pas une réassignation**
Le mécanisme le plus technique du fichier, et probablement le plus questionné. Rapier3D interdit de modifier
son monde physique **depuis l'intérieur** de `drainCollisionEvents()` (ça crash). Les handlers qui doivent
agir sur la physique (Bumper, Bump, BottomOut) ne l'exécutent pas tout de suite : ils empilent une lambda
dans `pendingPhysics`. `flushPendingPhysics()` est appelée juste après `process()`, une fois que Rapier
autorise à nouveau les mutations, et vide le tableau :
```ts
flushPendingPhysics(): void {
  if (this.pendingPhysics.length === 0) return;
  const pending = this.pendingPhysics.splice(0);   // vide EN PLACE, garde la même référence
  for (const run of pending) run();
}
```
Point important, et une correction honnête à faire à l'oral si le sujet vient : une version antérieure de ce
fichier faisait `this.pendingPhysics = []` (réassignation) au lieu de `.splice(0)`. Ça a l'air équivalent
mais ne l'est pas : `BumperCollisionHandler`, `BumpCollisionHandler` et `BottomOutCollisionHandler`
reçoivent `pendingPhysics` **par référence** dans leur constructeur (`this.pendingPhysics =
new BumperCollisionHandler(this.pendingPhysics, ...)`). Réassigner `this.pendingPhysics = []` change à quoi
pointe le champ de `CollisionEventProcessor`, mais les handlers, eux, gardent leur propre référence vers
l'ANCIEN tableau — donc après le tout premier flush, tous les handlers poussent dans un tableau que plus
personne ne lit : plus aucun bumper, plus aucun drain ne se déclenche, silencieusement. `.splice(0)` vide le
tableau existant sans en créer un nouveau : la référence que tiennent les handlers reste valide pour
toujours. C'est un bug d'aliasing de référence classique, corrigé dans le repo — bon exemple concret si le
jury demande "un bug subtil que tu as compris en profondeur", même si ce n'est pas toi qui l'as corrigé
(sois honnête là-dessus si on te le demande directement — voir note d'authorship en fin de §3).

**4. Les lambdas passées aux constructeurs (`() => this.worldState.isActive()`, `() =>
this.dropTargetHandler.resetDropTargets()`, `() => this.gateContext()`)**
Une valeur primitive (`boolean`, `number`) est **copiée** en JS/TS, pas référencée. Si on passait
`this.worldState.isActive()` (le résultat, un booléen figé) directement à `PortalCollisionHandler` ou à
`BossCollisionHandler`, ils recevraient `false` figé pour toujours. La lambda capture `this` et relit
l'état à chaque appel — elle voit toujours la valeur courante. C'est une closure au sens strict du terme.

**5. L'horloge injectée : `now: () => number = () => performance.now()`**
Dernier paramètre du constructeur, avec une valeur par défaut. En prod, personne ne le passe → le défaut
`performance.now()` s'applique. En test, on injecte une fonction qui retourne une valeur contrôlée
(`() => 1000`, puis `() => 3500`, etc.) pour simuler l'écoulement du temps sans `setTimeout` ni horloge
réelle. Propagée à `BossFightManager` et `BossCollisionHandler` — c'est de la DIP appliquée au temps
lui-même : ces classes ne dépendent jamais de `performance.now` en dur, elles reçoivent une abstraction
`() => number`.

**6. L'ordre du tableau `handlers` compte, et `BossCollisionHandler` est délibérément en tête**
```ts
this.handlers = [
  this.bossHandler,                    // 1er : un rôle de boss est TOUJOURS consommé ici
  new BumperCollisionHandler(...),
  new BumpCollisionHandler(...),
  new BottomOutCollisionHandler(...),
  ...
];
```
`Array.find()` s'arrête au premier `canHandle()` vrai. Le commentaire du code est explicite sur le pourquoi :
un rôle de boss ne doit jamais tomber dans un handler générique par erreur. C'est la même logique qu'avant
(le bloc boss était traité en priorité, en dur, dans `process()`) mais maintenant exprimée par la position
dans le tableau plutôt que par un `if` séparé — c'est un gain d'OCP : ajouter un nouveau handler prioritaire
ne demande plus de toucher `process()`, juste sa position dans le tableau.

**Bonus — où est passé le bloc "boss verrouillé" ?**
Dans une version antérieure de ce fichier, `process()` contenait un bloc dédié (Map `bossByRole` +
`lockedHitLastMs` + un `if` à 5 conditions) qui émettait `BOSS_LOCKED_HIT` avec un cooldown de 2s. Ce bloc a
été extrait tel quel dans un nouveau fichier, `BossCollisionHandler.ts` (voir encart plus bas) — c'est
exactement le genre d'extraction SRP dont cette fiche recommandait la nécessité dans sa première version. Le
mécanisme (cooldown 2s pour éviter de spammer le joueur à 60 evt/s) reste identique, juste dans un fichier
dédié qui implémente `CollisionHandler` comme les autres.

> **Encart — `BossCollisionHandler.ts` (nouveau fichier, hors périmètre des 4 présentés)** : implémente
> `CollisionHandler`, `canHandle(role)` = `this.bossByRole.has(role)`, `handle()` reproduit le bloc
> boss-verrouillé ci-dessus puis appelle toujours `bossFights.handleTargetCollision(...)`. Expose
> `resetThrottle(id?)` (appelée par `CollisionEventProcessor.resetLockedHitThrottle()`). Reçoit la même
> horloge injectée que `CollisionEventProcessor`. Tu n'as pas à le présenter en détail (il n'est pas dans
> tes 4 fichiers), mais sache dire une phrase dessus si le jury le voit dans le tableau `handlers` et
> demande "c'est quoi ce fichier-là ?" — c'est un bon signe que tu comprends l'architecture au-delà du
> strict minimum demandé.

### Ta banque de questions (Questions_CollisionEventProcessor.pdf) — pistes de réponse condensées

Ton fichier de 30 questions est volontairement sans réponses pour que tu t'entraînes à voix haute. Voici des
pistes courtes pour les catégories les plus "pièges" à ne pas laisser sans réponse :

- *Différence import/BumperHit en `import type` alors que c'est une vraie classe* → `CollisionEventProcessor`
  ne fait jamais `new BumperHit()`, il la reçoit déjà instanciée (injection de dépendance, DIP). Il ne
  l'utilise que comme **type** de paramètre, jamais comme valeur — d'où `import type` légitime même pour
  une classe concrète.
- *Que se passe-t-il si on appelle `bumperHitUC.execute()` directement dans `process()` ?* → Crash Rapier
  (exception "cannot mutate world during event drain"), d'où `pendingPhysics`.
- *Pourquoi `portalHandler`/`dropTargetHandler` sont en propriétés nommées EN PLUS d'être dans `handlers`* →
  Parce que `CollisionEventProcessor` expose des méthodes publiques (`setPortalOpen`, `resetDropTargets`)
  qui doivent les appeler directement ; le tableau `handlers` est typé `CollisionHandler[]`, il ne donne pas
  accès aux méthodes spécifiques (`setPortalOpen` n'existe pas sur l'interface générique).
- *Violations SOLID d'avant refacto* → regarde le commit `2530b7b refacto(game-engine): CollisionEventProcessor
  OCP - handler registry pattern` dans l'historique git — avant, c'était probablement un `switch`/`if-else`
  géant sur le rôle, qui violait OCP (ajouter un type = modifier la fonction) et peut-être SRP (toute la
  logique de chaque type de collision dans une seule fonction). Vérifie le diff toi-même avant l'oral pour
  pouvoir citer des détails précis — c'est un excellent exemple concret à donner si on te demande "as-tu
  déjà refactorisé du code, pourquoi ?".

---

## 4. `BumperCollisionHandler.ts` — l'adaptateur physique

### À quoi ça sert

Implémente `CollisionHandler` pour les rôles `bumper_<index>`. C'est un fichier volontairement mince : il
ne fait AUCUNE règle métier, juste de la plomberie entre "un rôle de collider" et "un appel au use-case
avec les bonnes coordonnées".

```ts
export class BumperCollisionHandler implements CollisionHandler {
  constructor(
    private readonly pendingPhysics: Array<() => void>,
    private readonly bumperHitUC: BumperHit,
    private readonly layout: MapLayout,
  ) {}

  canHandle(role: string): boolean {
    return role.startsWith('bumper_');
  }

  handle(role: string, gameState: string, started: boolean): void {
    if (!started || gameState !== 'playing') return;
    const idx = parseInt(role.split('_')[1], 10);
    const pos = this.layout.bumpers[idx];
    if (pos) {
      this.pendingPhysics.push(() => this.bumperHitUC.execute(idx, pos));
    }
  }
}
```

> **Sur le check `gameState` — sois précis si le jury creuse** : ce fichier ne vérifiait pas `gameState` à
> l'origine (voir §6 et §8). Corrigé pendant cette préparation, en local — mais la vérification `git blame`
> a montré qu'Anthony avait corrigé exactement le même oubli sur `dev`, un peu avant (commit `40233dc`,
> "fix(game-engine): collision-handler state bugs"), dans le cadre d'un audit plus large après l'ajout des
> tests. Les deux corrections sont identiques ligne pour ligne. Ce n'est donc pas une découverte exclusive :
> c'est une coïncidence de retrouver le même bug en comparant les 9 (10) handlers entre eux. Le fichier
> présenté aujourd'hui est déjà committé sur `dev` avec ce correctif. La bonne réponse à l'oral n'est pas
> "j'ai corrigé ce bug" mais "j'ai identifié ce bug par la même méthode (comparer les handlers), et je sais
> l'expliquer et le justifier" — ce qui reste une compétence C3.3 valable, en restant honnête sur qui a
> committé quoi.

### Points clés à expliquer

**Trois dépendances injectées dans le constructeur** : `pendingPhysics` (la même référence de tableau
partagée avec `CollisionEventProcessor` — pas une copie, un pointeur vers le même tableau), `bumperHitUC`
(le use-case, déjà instancié ailleurs), `layout` (pour connaître la position réelle de chaque bumper sur le
plateau). Rien n'est créé ici avec `new` — tout est reçu de l'extérieur (DIP).

**`canHandle` par préfixe** : `role.startsWith('bumper_')` — un simple test de chaîne, cohérent avec la
convention documentée dans CLAUDE.md (préfixes de mesh GLB : `bumper_`, `wall_`, `flipper_`...).

**Extraction de l'index depuis le texte** : `parseInt(role.split('_')[1], 10)` — le rôle `'bumper_2'` est
juste une chaîne de caractères ; on la découpe sur `_` pour récupérer `'2'`, qu'on convertit en nombre.
C'est la seule info d'identité que Rapier/le GLB transmettent — il n'y a pas de "vrai" objet Bumper avec un
ID typé, juste une convention de nommage.

**Le `if (pos)` avant de pousser dans `pendingPhysics`** : garde défensive. Si `layout.bumpers[idx]` est
`undefined` (map mal configurée, index qui ne correspond à aucun bumper déclaré), on ne pousse rien plutôt
que de planter plus tard avec une position `undefined`. Ça protège, mais silencieusement — pas de log, pas
de warning (point à noter, voir audit §8).

**Toujours le pattern `pendingPhysics`** : comme les autres handlers physiques, il ne touche jamais Rapier
directement — il empile une lambda `() => this.bumperHitUC.execute(idx, pos)`, exécutée plus tard par
`flushPendingPhysics()` dans `CollisionEventProcessor`.

### Questions probables + éléments de réponse

**Ce fichier ne vérifiait pas `gameState` — pourquoi, et qu'est-ce qui a été fait ?**
C'était un écart réel par rapport aux autres handlers du dossier : `if (!started) return;` est devenu
`if (!started || gameState !== 'playing') return;`, exactement la même garde que partout ailleurs. Trouvé
en comparant les handlers entre eux ; corrigé sur `dev` (commit `40233dc`, Anthony — voir l'encart plus haut
pour la nuance d'authorship). Bonne réponse honnête si demandé : "j'ai repéré cet écart avec la même méthode
de comparaison systématique des handlers, et je peux expliquer précisément pourquoi c'est nécessaire (sans
la garde, un bumper reste actif après game over)."

**Pourquoi le use-case n'est pas appelé directement, pourquoi passer par `pendingPhysics` ?**
Même raison que partout ailleurs : `handle()` est appelé depuis l'intérieur de `drainCollisionEvents()`,
où Rapier interdit toute mutation de son monde physique. `bumperHitUC.execute()` finit par appliquer une
vraie force sur la bille — donc interdit à cet instant précis.

**Que se passe-t-il si deux bumpers différents sont touchés dans la même frame ?**
Chaque collision est traitée séquentiellement, chacune pousse sa propre lambda dans `pendingPhysics` (le
tableau accumule), et `flushPendingPhysics()` les exécute toutes, dans l'ordre, une fois le drain terminé.

**Pourquoi cette classe ne sait rien du score ni de la force d'éjection ?**
SRP + séparation de couche : ce fichier est un Adapter, pas un Use Case. La règle "combien de points, quelle
force" est dans `BumperHit.ts` (§5) — ce fichier-ci ne fait que router l'information (quel bumper, où).

---

## 5. `BumperHit.ts` — la règle métier (Use Case)

### À quoi ça sert

C'est ici, et seulement ici, que la vraie règle du jeu "toucher un bumper" est écrite. Couche Use Case au
sens Clean Architecture (Jour 7 — priorité absolue pour cette épreuve) : zéro dépendance à Rapier, Three.js
ou React.

```ts
export interface IBumperEject {
  applyEjectionForce(bumperPosition: { x: number; z: number }): void;
}

export class BumperHit {
  constructor(
    private readonly bumperEject: IBumperEject,
    private readonly emit: GameEventListener,
  ) {}

  execute(bumperIndex: number, bumperPosition: { x: number; z: number }): void {
    this.bumperEject.applyEjectionForce(bumperPosition);
    this.emit({ type: 'BUMPER_HIT', bumperIndex, scoreIncrement: SCORE_BUMPER });
  }
}
```

Deux actions, dans cet ordre : appliquer une vraie force d'éjection physique, puis annoncer l'événement
avec le score à ajouter. `SCORE_BUMPER = 1000` (défini dans `domain/ScoringConstants.ts`) — la règle est
volontairement uniforme : n'importe quel bumper rapporte pareil, l'identité (`bumperIndex`) n'est là que
pour l'information transmise à l'event (utile côté DMD/UI pour savoir *lequel* a été touché).

### Le point le plus fort à défendre : `IBumperEject`

Cette interface est définie **dans le use-case lui-même**, pas dans `domain/` ni dans `infrastructure/`.
C'est le consommateur (`BumperHit`) qui décide du contrat minimal dont il a besoin — une seule méthode,
`applyEjectionForce`. C'est `BallPhysics.ts` (en `infrastructure/`) qui vient ensuite s'y conformer en
l'implémentant, aux côtés d'une interface plus large (`IBallPhysics`, définie côté `domain/`, qui contient
bien plus de méthodes : spawn, sync mesh, etc.).

Deux principes SOLID en même temps ici :
- **DIP** (Dependency Inversion) : `BumperHit` dépend d'une abstraction (`IBumperEject`), jamais de la
  classe concrète `BallPhysics`.
- **ISP** (Interface Segregation) : plutôt que de dépendre de la grosse interface `IBallPhysics` (qui
  contient plein de méthodes dont `BumperHit` n'a rien à faire), il définit et ne dépend que du strict
  minimum dont il a besoin. C'est le genre de nuance qui fait très bonne impression à l'oral si tu la
  sors spontanément.

### Questions probables + éléments de réponse

**Pourquoi cette classe ne connaît ni Rapier ni Three.js ?**
Parce que c'est un Use Case pur — testable seul, sans démarrer de moteur physique ni de rendu 3D. C'est
exactement la définition de ta fiche Jour 7 : *"un scénario = un Use Case, testable seul, sans serveur ni
BD"* (ici, sans Rapier).

**Comment tu testerais ce fichier ?**
Exactement ce que fait le vrai test aujourd'hui (`test/use-cases/BumperHit.test.ts`, 5 tests, `bun:test`) :
un objet `IBumperEject` fake qui pousse dans un tableau (`applyEjectionForce: (pos) => calls.push(pos)`) et
un `emit` mocké (`mock((e) => events.push(e))`). `execute(2, {x,z})` puis assertions sur les deux tableaux —
zéro dépendance lourde, zéro Rapier. Un des 5 tests vérifie même l'ordre d'appel (`eject` avant `emit`), ce
qui prouve le contrat "physique d'abord, event ensuite" décrit plus haut. Voir §8 et le fichier dédié
`TESTS_4_FICHIERS.md` pour le détail complet.

**Pourquoi `applyEjectionForce` prend juste `{x, z}` et pas un objet Vector3 complet ?**
Sur ce plateau, la hauteur `y` est dérivée de la formule de surface (`surfaceYAtZ()`), pas stockée
librement — donc seuls `x` et `z` sont pertinents pour positionner une force sur le plan de jeu.

**Quelle différence entre `BumperHit` et `BumpHit` (le use-case pour les bumps latéraux) ?**
Même structure exacte (interface dédiée + classe avec `execute()`), bonne preuve que la convention
"use-case = interface minimale + une méthode execute" est appliquée de façon cohérente dans tout le
dossier `use-cases/`, pas juste sur ce fichier isolé.

---

## 6. La question qui fait mal : "un bug connu aujourd'hui ?"

C'est la dernière question de ta banque (`Questions_CollisionEventProcessor.pdf`, §6.4), et c'est
exactement le genre de question "attitude face à la critique" que la Fiche Focus mentionne. Sur
`CollisionEventProcessor.ts` lui-même, je n'ai pas trouvé de bug confirmé ni de TODO/FIXME — deux pistes
honnêtes restent possibles (`lastTotalScore` qui peut légèrement retarder si `tryAllBossReveals()` n'est
pas appelée à chaque changement de score, et la convention `drop_target*` vs `drop_*` qui repose
uniquement sur un nommage GLB sans garde-fou).

Réponse honnête à donner aujourd'hui : `BumperCollisionHandler.handle()` ne vérifiait pas `gameState` à
l'origine, contrairement aux autres handlers du dossier (voir §8) — repéré en comparant les 10 handlers
entre eux, corrigé sur `dev` (commit `40233dc`, Anthony, avant même la fin de cette préparation). Le
raconter à l'oral montre la même compétence C3.3 (détection → diagnostic → validation), sans revendiquer un
commit qui n'est pas le tien. Deuxième bug, plus subtil, à connaître si le jury va plus loin :
`flushPendingPhysics()` a été corrigé d'une réassignation (`this.pendingPhysics = []`) vers un `.splice(0)`
en place — un bug d'aliasing de référence qui aurait cassé tous les flush après le premier (voir §3, point
3). Deux vrais bugs identifiés et corrigés dans ce circuit, dont un que tu peux expliquer en profondeur
techniquement même sans en être l'auteur du commit.

---

## 7. Exercice de modification en direct — à t'entraîner avant l'oral

L'évaluateur peut demander une modification en direct. Deux scénarios plausibles sur ces fichiers :

**Scénario A — ajouter un nouveau type de collision** (ex. un kickback) :
1. Créer `KickbackCollisionHandler.ts` dans `packages/game-engine/src/infrastructure/`, qui `implements
   CollisionHandler`.
2. Définir la convention de rôle (ex. `kickback_<id>`) dans `canHandle()`.
3. Importer la classe dans `CollisionEventProcessor.ts` et l'ajouter dans `this.handlers`.
4. Si ça modifie la physique, passer par `pendingPhysics` comme les autres.
5. Ajouter le type d'event correspondant dans `GameEvents.ts` si besoin.

Précédent réel dans ce repo à citer si le jury demande un exemple concret : l'extraction de
`BossCollisionHandler.ts` a suivi exactement ces étapes — un bloc auparavant en dur dans `process()` est
devenu un handler du tableau, sans modifier la logique elle-même.

**Scénario B — le check `gameState` manquant dans `BumperCollisionHandler`** : sache refaire cette
modification de mémoire si le jury demande de l'annuler puis de la remettre en direct (une seule ligne,
`if (!started) return;` → `if (!started || gameState !== 'playing') return;`), et sache expliquer pourquoi
ce correctif est sûr : il ne change que la condition d'entrée, ne touche à aucune autre logique. Le fichier
est déjà committé sur `dev` avec ce correctif (voir §4 pour la nuance d'authorship).

**Scénario C — un autre correctif simple à savoir dérouler si le jury en demande un nouveau en direct** :
ajouter un `console.warn` (ou équivalent) dans le `if (pos)` de `BumperCollisionHandler` pour logger
quand `layout.bumpers[idx]` est `undefined`, plutôt que d'échouer silencieusement (point relevé en §4).
Bon exercice pour montrer que tu sais identifier un autre point faible et le corriger sans notes.

Savoir dire à voix haute : *"Je ne touche à aucune ligne existante de CollisionEventProcessor sauf l'ajout
d'un import et d'une ligne dans le tableau — c'est la démonstration concrète de l'OCP."*

---

## 8. Audit qualité de code — vérifié avec les vrais outils du projet

Plutôt que de "juger à l'œil", j'ai fait tourner les outils réellement configurés dans ton repo
(`packages/config/.eslintrc.json`, `tsconfig.json`, `.prettierrc`) sur les 4 fichiers, et comparé leur
structure à celle des autres fichiers des dossiers `infrastructure/` et `use-cases/`.

### Ce qui est vérifié et propre

- **ESLint** sur les 4 fichiers → **0 erreur, 0 warning**.
- **TypeScript** (`tsc --noEmit` sur tout `game-engine`) → **0 erreur de type**.
- **Nommage** : cohérent — fichiers en PascalCase = nom de la classe, méthodes en camelCase (`canHandle`,
  `handle`, `applyEjectionForce`), constantes en SCREAMING_SNAKE_CASE (`SCORE_BUMPER`), rôles de collider
  en snake_case (`bumper_<index>`) — conforme à la convention CLAUDE.md (préfixes de mesh GLB).
- **`CollisionHandler.ts`** et **`BumperCollisionHandler.ts`** suivent le même moule que les 8 autres
  handlers du dossier `infrastructure/` : JSDoc de classe, puis `constructor` → `canHandle` → `handle`.
- **`BumperHit.ts`** n'a pas de JSDoc de classe — mais ce n'est **pas** une incohérence : j'ai vérifié son
  voisin `BumpHit.ts`, structure identique, également sans JSDoc. Les fichiers `use-cases/` suivent tous
  cette convention plus sobre (contrairement aux fichiers `infrastructure/`) — normal, pas à corriger.

### Le check `gameState` manquant dans `BumperCollisionHandler` — trouvé, et déjà corrigé sur `dev`

```ts
// BumperCollisionHandler.ts — AVANT
handle(role: string, gameState: string, started: boolean): void {
  if (!started) return;                                   // ← s'arrêtait ici, gameState ignoré

// BumperCollisionHandler.ts — MAINTENANT (dev, commit 40233dc, Anthony)
handle(role: string, gameState: string, started: boolean): void {
  if (!started || gameState !== 'playing') return;         // ← aligné sur les autres handlers
```
`BumperCollisionHandler` était le seul handler à ne pas filtrer sur `gameState !== 'playing'`. Concrètement,
avant correctif : un bumper continuait d'appliquer une force ET d'ajouter 1000 points même hors partie en
cours (écran de game over), tant qu'un contact `started` arrivait. Le fichier actuel sur `dev` a déjà ce
correctif, committé par Anthony ; ta préparation a identifié le même écart indépendamment, en comparant les
handlers entre eux. Une régression dédiée existe maintenant dans
`test/infrastructure/BumperCollisionHandler.test.ts` (voir §8 tests, et le fichier `TESTS_4_FICHIERS.md`).
Réponse honnête à donner si le jury demande "as-tu trouvé ce bug ?" : *"je l'ai repéré en comparant les
handlers, un coéquipier l'avait déjà corrigé sur dev avant que je finisse ma préparation — je peux quand
même l'expliquer et le justifier en détail."*

### Deux incohérences déjà connues sur `CollisionEventProcessor.ts` — toujours valables

**1. Aucun JSDoc de classe** — alors que les handlers (dont `BumperCollisionHandler`) en ont un
(one-liner, depuis le passage `#118` de réduction des commentaires). C'est toujours le seul fichier du
dossier `infrastructure/` sans description de classe, alors que c'est le plus complexe.

**2. L'ordre des méthodes déroge à la convention du dossier** — une vingtaine de méthodes (délégations
boss/monde alternatif, getters) sont déclarées **avant** le constructeur, qui n'arrive qu'à la ligne 120.
Les handlers suivent l'ordre `champs → constructor → méthodes`. Toujours vrai dans la version actuelle.

### L'observation SRP de la 1ère version de cette fiche — maintenant résolue, bon exemple à raconter

La 1ère version de cette préparation notait : *"`BossFightManager` a été extrait, mais la logique du monde
alternatif reste directement dans `CollisionEventProcessor`, sans équivalent extrait — incohérence dans
l'application du SRP."* Ce diagnostic était juste, et il a depuis été **résolu par l'équipe** :
`AlternateWorldState.ts` a été créé (58 lignes, state holder pur : `active`, les deux baselines de score,
`lastTotalScore`, méthodes `isActive/enter/resetSession/completeCycle/gateContext`), exactement la
extraction qui manquait. C'est un excellent exemple à donner si le jury demande "comment évalues-tu la
qualité SRP d'un fichier" : tu peux montrer que tu sais *diagnostiquer* une violation de SRP avant même
qu'elle soit corrigée, avec le vocabulaire exact (state holder, délégation), et confirmer après coup que le
diagnostic était fondé en comparant à l'extraction réelle qui a suivi.

### Les tests — plus un angle mort, un point fort à connaître précisément

Contrairement à ce qu'indiquait la 1ère version de cette fiche ("zéro test sur les 4 fichiers"), des tests
existent maintenant pour 3 des 4 fichiers (ajoutés par Hugo, commit `a1e5ce8` "Test/coverage pyramid" + fix
`40233dc` d'Anthony), déplacés en `test/` mirror par `d5abe66`. Détail complet dans `TESTS_4_FICHIERS.md`,
résumé ici :
- `test/use-cases/BumperHit.test.ts` — 5 tests : force appliquée à la bonne position, event `BUMPER_HIT`
  avec le bon score, **ordre d'appel eject → emit**, position négative propagée sans clamp, un event par
  `execute()`.
- `test/infrastructure/BumperCollisionHandler.test.ts` — 5 tests : `canHandle` sur préfixe `bumper_`,
  parsing d'index + position du layout, no-op si `started=false`, no-op si position introuvable, et une
  **régression explicite** sur le garde `gameState` (le bug de §4/§6 — testé pour ne jamais régresser).
- `test/infrastructure/CollisionEventProcessor.test.ts` — 3 tests d'intégration légère (processor réel,
  Rapier mocké via un faux `EventQueue`) : régression sur le bug `splice`/réassignation (2 cycles de flush
  doivent tous les deux déclencher le use-case), régression `gameState` au niveau processor, et le drain
  qui fonctionne toujours après un premier cycle de flush.
- `CollisionHandler.ts` reste sans test — normal, c'est une interface, zéro comportement à tester.

Les noms des tests eux-mêmes citent explicitement les deux bugs de cette fiche ("régression : garde
game_over/idle", "regression guard for the pendingPhysics ref-detachment bug") — preuve que ces bugs sont
documentés et surveillés, pas juste corrigés une fois.

### Verdict global

Code propre au sens outillé (0 erreur lint, 0 erreur de type, nommage cohérent). Deux points forts à
retenir avant l'oral : (1) le diagnostic SRP sur le monde alternatif, posé avant la correction et confirmé
juste après par l'extraction réelle de `AlternateWorldState` ; (2) la compréhension fine du bug
`pendingPhysics` (réassignation vs `splice`), que les tests actuels couvrent nommément. Sur le check
`gameState`, reste honnête : identifié indépendamment, mais corrigé sur `dev` par un coéquipier avant la fin
de la préparation.

---

## 9. Check-list avant l'épreuve (spécifique à ces 4 fichiers)

- Je sais dessiner le schéma d'articulation des 4 fichiers (§1) sans notes, y compris le passage de couche
  Adapter (`BumperCollisionHandler`) → Use Case (`BumperHit`), et situer `BossCollisionHandler`/
  `AlternateWorldState` dans le schéma sans les présenter en détail.
- Je sais expliquer `pendingPhysics` et pourquoi `flushPendingPhysics` fait `.splice(0)` et pas
  `this.pendingPhysics = []` (bug d'aliasing de référence, §3 point 3).
- Je sais expliquer une lambda capturée dans le constructeur sans confondre avec une valeur copiée.
- Je sais expliquer pourquoi `IBumperEject` est défini dans le use-case et pas ailleurs (DIP + ISP).
- Je sais expliquer l'horloge injectée (`now: () => number = () => performance.now()`) et pourquoi c'est
  utile pour les tests.
- Je sais dérouler l'exercice d'ajout d'un handler (§7, scénario A) en direct sur le vrai fichier, en citant
  `BossCollisionHandler` comme précédent réel.
- Je ne bloque pas sur la question du bug connu (§6) — j'ai la réponse `gameState` + `splice` prête, avec la
  nuance honnête sur qui a committé quoi.
- Je sais résumer en une phrase ce que couvrent les tests réels des 3 fichiers testables (§8), sans les
  avoir écrits moi-même si ce n'est pas le cas.
- Si le jury demande "as-tu écrit ce fichier ?" sur `CollisionEventProcessor.ts` ou `BumperHit.ts`, je
  réponds avec les vrais chiffres d'authorship plutôt que d'éluder (voir `AUDIT_ANCIEN_VS_NOUVEAU_CODE.md`).
