# Préparation Code Review — CollisionEventProcessor / CollisionHandler / BumperCollisionHandler / BumperHit

> Document de préparation à l'oral technique individuel (épreuve Code Review, Bloc 3).
> Basé sur le code réel du repo (`packages/game-engine/src/`), sur ton Guide de Lecture et tes Questions
> d'entraînement déjà préparés, et sur la Fiche Focus HETIC (attentes officielles).
> Mise à jour : le 3e fichier initialement prévu (`DropTargetCollisionHandler.ts`) a été remplacé par le
> duo `BumperCollisionHandler.ts` (infrastructure) + `BumperHit.ts` (use-case), pour montrer le circuit
> complet Adapter → Use Case et coller à la fiche "Clean Architecture — PRIORITÉ ABSOLUE".
> Partie 1/N — d'autres fichiers viendront s'ajouter à cette fiche.

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
  │  possède un registre ordonné :
  ▼
handlers: CollisionHandler[]     (interface — le contrat Strategy)
  │
  ├─ BumperCollisionHandler      ← fichier présenté, dispatch + plomberie physique
  ├─ BumpCollisionHandler
  ├─ DrainCollisionHandler
  ├─ BottomOutCollisionHandler
  ├─ SlingshotCollisionHandler
  ├─ PopZoneCollisionHandler
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

Ton Guide de Lecture couvre déjà ça en détail (imports → propriétés → constructeur → process() → API
publique → flushPendingPhysics). Les 5 mécanismes les plus susceptibles d'être questionnés :

**1. `import type` vs import normal**
`import type` = contrat TypeScript pur, disparaît à la compilation, jamais instanciable (`BumperHit`,
`CollisionHandler`, `MapLayout`...). Import normal = classe/fonction réelle instanciable avec `new`
(`BossFightManager`, les 9 handlers concrets). Test rapide à l'oral : si tu ne peux pas répondre "est-ce que
je pourrais faire `new` avec ce truc ?", c'est que tu ne maîtrises pas encore la distinction.

**2. `bossByRole: Map<string, BossDefinition>`**
Construite une fois dans le constructeur (boucle `for...of`, coût O(n) une seule fois), puis lue en O(1) à
chaque frame via `.get(role)`. Si on demande "pourquoi pas juste `layout.bosses.find(...)`" → performance :
`Array.find()` est O(n) et se répéterait à 60fps, `Map.get()` est O(1).

**3. `pendingPhysics: Array<() => void>`**
Le mécanisme le plus technique du fichier, et probablement le plus questionné. Rapier3D interdit de modifier
son monde physique **depuis l'intérieur** de `drainCollisionEvents()` (ça crash — voir git history du
projet, commit `7aa45f8 "defer collision physics to avoid rapier aliasing crash"`, un vrai bug corrigé sur
ce projet). Les handlers qui doivent agir sur la physique (Bumper, Bump, Drain, BottomOut) ne l'exécutent
pas tout de suite : ils empilent une lambda dans `pendingPhysics`. `flushPendingPhysics()` est appelée
juste après `process()`, une fois que Rapier autorise à nouveau les mutations, et vide le tableau.

Point subtil à savoir expliquer : dans `flushPendingPhysics()`, `this.pendingPhysics = []` est réassigné
**avant** la boucle d'exécution, pas après :
```ts
const pending = this.pendingPhysics;
this.pendingPhysics = [];        // reset AVANT d'exécuter
for (const run of pending) run();
```
Si une action exécutée dans `run()` pousse elle-même une nouvelle action dans `pendingPhysics`, elle
écrit dans le tableau neuf (donc traitée au *prochain* flush) — sans ce reset préalable, une action
récursive pourrait boucler indéfiniment dans la même frame.

**4. Les lambdas passées au constructeur (`() => this.alternateWorldActive`, `() =>
this.dropTargetHandler.resetDropTargets()`)**
Une valeur primitive (`boolean`) est **copiée** en JS/TS, pas référencée. Si on passait
`this.alternateWorldActive` directement à `PortalCollisionHandler`, il recevrait `false` figé pour
toujours. La lambda capture `this` et relit la propriété à chaque appel — elle voit toujours la valeur
courante. C'est une closure au sens strict du terme (Jour 1 POO, notion de couplage/composition).

**5. L'ordre du tableau `handlers` compte**
`Array.find()` s'arrête au premier `canHandle()` vrai. Les handlers physiques (Bumper/Bump/Drain/BottomOut)
sont en tête car ce sont les collisions les plus fréquentes/critiques ; `dropTargetHandler` et
`portalHandler` ferment la liste car leurs `canHandle()` sont plus spécifiques (préfixes distinctifs).

**Bonus — le bloc "boss verrouillé" dans `process()`, souvent mal compris**
```ts
const boss = this.bossByRole.get(role);
if (boss && boss.reveal.requiresAlternateWorld === this.alternateWorldActive
    && started && gameState === 'playing' && !this.bossFights.isTriggered(boss.id)) {
  const ctx = this.gateContext();
  if (!bossThresholdMet(boss, ctx)) {
    const now = performance.now();
    if (now - (this.lockedHitLastMs[boss.id] ?? 0) >= 2000) {
      this.lockedHitLastMs[boss.id] = now;
      this.emit({ type: 'BOSS_LOCKED_HIT', bossId: boss.id, remaining: bossPointsRemaining(boss, ctx) });
    }
  }
}
```
Ce bloc ne gère ni dégâts ni déclenchement de combat — il sert uniquement à prévenir le joueur, avec un
cooldown de 2 secondes, qu'il lui manque des points pour débloquer un boss encore verrouillé. Sans ce
cooldown, le message serait renvoyé jusqu'à 60 fois/seconde tant que la bille reste en contact. La vraie
mécanique de combat (une fois le boss débloqué) vit ailleurs, dans `BossFightManager.handleTargetCollision`
+ `BossTargetSensor`, pas dans ce bloc.

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

> **Corrigé le jour de cette review** : ce fichier ne vérifiait pas `gameState` à l'origine (voir §6 et §8
> pour l'historique de la découverte). C'est maintenant aligné sur les 8 autres handlers du dossier.
> Vérifié après coup avec `eslint` et `tsc --noEmit` sur tout `game-engine` → 0 erreur. Encore
> **non commité** au moment de la rédaction — pense à faire le commit avant l'oral (`git status` le montre
> comme fichier modifié).

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

**Ce fichier ne vérifiait pas `gameState` — pourquoi, et qu'est-ce que t'as fait ?**
C'était un écart réel par rapport aux 8 autres handlers du dossier, trouvé en préparant cette review (voir
audit §8). Plutôt que de le laisser comme "point à surveiller", il a été corrigé : `if (!started) return;`
est devenu `if (!started || gameState !== 'playing') return;`, exactement la même garde que partout
ailleurs. Vérifié avec ESLint et `tsc --noEmit` après coup, 0 erreur. C'est la meilleure réponse possible à
la question "as-tu déjà trouvé et corrigé un bug" — concrète, datée, vérifiable en direct sur le fichier.

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
Un mock de `IBumperEject` (un simple objet `{ applyEjectionForce: jest.fn() }` ou équivalent) et un mock de
`emit` (une fonction qui pousse dans un tableau). On appelle `execute(2, {x:1,z:2})` et on vérifie que les
deux mocks ont bien été appelés avec les bons arguments — zéro dépendance lourde. (Point de vigilance :
aucun test n'existe aujourd'hui pour ce fichier, voir audit §8.)

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

Mais avec le nouveau choix de fichiers, tu as maintenant une réponse bien plus forte : **tu as trouvé un
vrai bug ET tu l'as corrigé.** `BumperCollisionHandler.handle()` ne vérifiait jamais `gameState`,
contrairement à absolument tous les autres handlers du dossier (voir le détail complet en §8) — c'est
maintenant réglé, une seule ligne modifiée, vérifiée avec ESLint et `tsc`. Si le jury demande "un bug
connu", tu n'as même plus besoin d'assumer une faiblesse non résolue : tu racontes le cycle complet
détection → diagnostic → correction → validation, exactement ce que couvre la compétence C3.3.

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

**Scénario B — le check `gameState` manquant dans `BumperCollisionHandler`** : celui-là, tu l'as déjà fait
avant l'oral (voir §4 et §6) — une seule ligne modifiée, aucun autre fichier touché. Sache le refaire de
mémoire si le jury te demande de l'annuler puis de le remettre en direct, et sache expliquer pourquoi ce
correctif est sûr : il ne change que la condition d'entrée, ne touche à aucune autre logique, et les tests
ESLint/`tsc` restent au vert après coup.

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

### La découverte la plus solide, et maintenant corrigée : `BumperCollisionHandler` et `gameState`

```ts
// BumperCollisionHandler.ts — AVANT (trouvé pendant cette review)
handle(role: string, gameState: string, started: boolean): void {
  if (!started) return;                                   // ← s'arrêtait ici, gameState ignoré

// BumperCollisionHandler.ts — APRÈS (corrigé)
handle(role: string, gameState: string, started: boolean): void {
  if (!started || gameState !== 'playing') return;         // ← aligné sur les 8 autres handlers
```
`BumperCollisionHandler` était le seul des 9 handlers à ne pas filtrer sur `gameState !== 'playing'`.
Concrètement, avant correctif : un bumper continuait d'appliquer une force ET d'ajouter 1000 points même
hors partie en cours (écran de game over, par exemple), tant qu'un contact `started` arrivait. Corrigé en
une ligne, revérifié avec ESLint (0 erreur) et `tsc --noEmit` sur tout `game-engine` (0 erreur). Reste à
faire avant l'oral : committer ce changement (`git status` le montre encore comme modifié non commité).
Réponse à donner si le jury demande : *"je l'ai trouvé en comparant les 9 handlers entre eux pendant ma
préparation, et je l'ai corrigé — probablement un oubli lors du refacto OCP qui a créé ce fichier."*

### Deux incohérences déjà connues sur `CollisionEventProcessor.ts`

**1. Aucun JSDoc de classe** — alors que les 9 handlers (dont `BumperCollisionHandler`) en ont tous un.
C'est le seul fichier du dossier `infrastructure/` dans ce cas, alors que c'est le plus complexe des
quatre.

**2. L'ordre des méthodes déroge à la convention du dossier** — 15 méthodes (`gateContext`, les getters,
les délégations boss/monde alternatif...) sont déclarées **avant** le constructeur, qui n'arrive qu'à la
ligne 128. Tous les handlers suivent l'ordre `champs → constructor → méthodes`. Ton propre Guide de Lecture
confirme indirectement le problème : il précise explicitement qu'il a dû **réordonner** le fichier
(Imports → Propriétés → Constructeur → process() → Méthodes publiques) parce que ce n'est *"pas l'ordre du
fichier source"*.

### Une observation plus profonde sur le SRP

`BossFightManager` a été extrait pour sortir toute la logique boss de `CollisionEventProcessor` — bon
réflexe SRP. Mais la logique du **monde alternatif** (le flag `alternateWorldActive`, les baselines de
score, 7 méthodes de gestion) reste directement dans `CollisionEventProcessor`, sans équivalent extrait
(pas de `WorldCycleManager`). Incohérence dans l'application de ton propre principe de délégation — bon
angle si le jury challenge ton SRP, réponse honnête à préparer plutôt qu'à nier.

### Un angle mort : zéro test sur les 4 fichiers

Ni `CollisionEventProcessor.ts`, ni `CollisionHandler.ts`, ni `BumperCollisionHandler.ts`, ni `BumperHit.ts`
n'ont de fichier de test. Le dossier `infrastructure/` a pourtant des tests pour `BossFightManager`,
`BossTargetSensor`, `FlipperSplitter`, `MeshRoleResolver`, `PhysicsWorld`, `PlayfieldCameraDirector` — et
le dossier `use-cases/` a un test pour `SnapBallToSurface` mais aucun autre use-case, dont `BumperHit`.
Si le jury pose la question stratégie de tests (C3.3 / C2.2 post-mortem), propose ce que tu testerais en
premier : `BumperHit.execute()` avec un mock `IBumperEject` (vérifier que la force ET le score sont bien
déclenchés), et le comportement de `BumperCollisionHandler` quand `layout.bumpers[idx]` est `undefined`
(vérifier qu'il ne plante pas et ne pousse rien).

### Verdict global

Code propre au sens outillé (0 erreur lint, 0 erreur de type, nommage cohérent). Le point le plus solide à
retenir avant l'oral : le check `gameState` manquant dans `BumperCollisionHandler`, trouvé ET corrigé
pendant cette préparation — c'est concret, vérifiable en 10 secondes en comparant deux fichiers (ou en
montrant le `git diff`), et ça démontre le cycle complet detection → correction → validation attendu en
C3.3. Pense juste à committer avant l'oral.

---

## 9. Check-list avant l'épreuve (spécifique à ces 4 fichiers)

- Je sais dessiner le schéma d'articulation des 4 fichiers (§1) sans notes, y compris le passage de couche
  Adapter (`BumperCollisionHandler`) → Use Case (`BumperHit`).
- Je sais expliquer `pendingPhysics` et pourquoi le reset se fait avant la boucle, pas après.
- Je sais expliquer une lambda capturée dans le constructeur sans confondre avec une valeur copiée.
- Je sais expliquer pourquoi `IBumperEject` est défini dans le use-case et pas ailleurs (DIP + ISP).
- Je sais dérouler l'exercice d'ajout d'un handler (§7, scénario A) en direct sur le vrai fichier.
- Je ne bloque pas sur la question du bug connu (§6) — j'ai la réponse `gameState` (trouvé ET corrigé) prête.
- J'ai commité le correctif `gameState` dans `BumperCollisionHandler.ts` avant l'oral (`git status` doit
  être propre sur ce fichier).
- Je peux citer le commit `2530b7b` (refacto OCP) si on me demande un exemple de refactoring que j'ai fait.
