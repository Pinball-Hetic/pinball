# Audit décision — ancienne branche (toi) vs code actuel (dev)

> Comparaison entre ton dernier commit sur ces fichiers (`12fe581`, "comment english") et l'état actuel de
> `dev` (`6d3e2f1`). Diffs réels tirés de `git diff`, pas de reconstruction approximative. Objectif : t'aider
> à décider quoi présenter, en connaissance de cause.

---

## Recommandation courte

Présente le code actuel de `dev`, pas ton ancienne branche. Il est objectivement meilleur (un vrai bug
corrigé, une meilleure application du SRP, des tests qui existent maintenant) et c'est de toute façon la
version que l'évaluateur verra s'il ouvre le repo. Par contre, sois **transparent sur qui a écrit quoi** —
c'est gérable, voir §4, et c'est même un point fort si tu le présentes bien plutôt que de le cacher.

Nuance par fichier : `CollisionHandler.ts` et `BumperCollisionHandler.ts` restent très majoritairement
les tiens (100% et 92% des lignes). `CollisionEventProcessor.ts` (21% toi) et `BumperHit.ts` (0% toi) sont
devenus des fichiers largement écrits par l'équipe depuis ton refacto — présentables, mais à cadrer
honnêtement (§4 et §6).

---

## 1. Ce qui a changé, fichier par fichier

### `CollisionHandler.ts` — changement cosmétique uniquement

Seule différence : le JSDoc de l'interface a été supprimé (commit `5c04fd4 "chore: prune code comments to
the strict minimum across the app"`, Anthony, une décision d'équipe appliquée à TOUT le projet, pas
spécifique à ce fichier). Le contrat lui-même (`canHandle`, `handle`) est identique à ce que tu avais écrit.

```diff
-/**
- * Strategy pattern contract for collision handling (OCP).
- * ...
- */
 export interface CollisionHandler {
-  /** Returns true if this handler is responsible for the given collider role. */
   canHandle(role: string): boolean;
-  /** ... */
   handle(role: string, gameState: string, started: boolean): void;
 }
```

**Verdict** : présente-le sans hésiter, c'est ton fichier, la seule différence est une suppression de
commentaires décidée au niveau du projet entier.

### `BumperCollisionHandler.ts` — un fix d'une ligne + suppression de commentaires

Deux changements : le JSDoc réduit à un commentaire d'une ligne (même décision d'équipe que ci-dessus), et
`if (!started) return;` devenu `if (!started || gameState !== 'playing') return;` — **exactement le bug
qu'on a "trouvé" ensemble**, mais en réalité déjà corrigé par Anthony le 1er juillet (commit `40233dc "fix
bumper gate"`), avant qu'on en parle. Coïncidence de trouver le même bug, pas une découverte exclusive.

```diff
   handle(role: string, gameState: string, started: boolean): void {
-    if (!started) return;
-    // The bumper index is encoded in the GLB role (e.g. 'bumper_2' → idx 2).
+    if (!started || gameState !== 'playing') return;
     const idx = parseInt(role.split('_')[1], 10);
```

**Verdict** : présente-le tel quel, c'est très majoritairement le tien (92% des lignes actuelles). Sur le
fix `gameState`, sois honnête si on te pousse (§4) — ne prétends pas l'avoir trouvé en exclusivité si on
vérifie l'historique.

### `CollisionEventProcessor.ts` — refactoring en profondeur, plusieurs auteurs

C'est là que ça change vraiment. Ton fichier faisait 217 lignes avec toute la logique boss et monde
alternatif écrite inline. La version actuelle fait 202 lignes, réorganisées :

**Extraction 1 — la logique boss sort entièrement du fichier.** Tout le bloc que je t'ai expliqué en détail
(`bossByRole`, `lockedHitLastMs`, les 5 conditions, l'anti-spam `BOSS_LOCKED_HIT`) a disparu de `process()`
et vit maintenant dans un nouveau fichier, `BossCollisionHandler.ts`, qui `implements CollisionHandler` et
rejoint le tableau `handlers` comme n'importe quel autre handler (en première position — il est toujours
prioritaire).

**Extraction 2 — la logique du monde alternatif sort aussi.** `alternateWorldActive`,
`normalWorldScoreBaseline`, `alternateWorldScoreBaseline`, `lastTotalScore` — les 4 champs qu'on avait
identifiés comme "pas extraits, contrairement aux boss" (notre observation SRP dans
`PREPA_CODE_REVIEW_CollisionHandlers.md` §8) — sont maintenant dans une classe dédiée,
`AlternateWorldState`. **C'est exactement l'amélioration qu'on avait identifiée comme manquante.**
Quelqu'un de l'équipe l'a faite entre-temps.

**Horloge injectée pour la testabilité.** Nouveau paramètre `now: () => number = () => performance.now()`
dans le constructeur, transmis à `BossFightManager` et `BossCollisionHandler`. Ça permet de contrôler le
temps dans les tests (au lieu de dépendre de la vraie horloge système) — exactement le genre
d'amélioration DIP-pour-la-testabilité que je t'avais présentée comme hypothétique dans
`ARGUMENTAIRE_SOLID_CLEAN_ARCHITECTURE.md`. Elle est réelle maintenant.

**Le vrai bug corrigé — le plus intéressant à raconter.** L'ancien `flushPendingPhysics()` :
```ts
const pending = this.pendingPhysics;
this.pendingPhysics = [];   // réassignation
for (const run of pending) run();
```
Le nouveau :
```ts
// Drain IN PLACE (splice) — do NOT reassign: the collision handlers
// capture this same array reference at construction. A
// `this.pendingPhysics = []` would detach it → after the 1st flush the
// handlers would push into the old array and nothing would run anymore
// (silent bumpers, drain/game-over never fired).
const pending = this.pendingPhysics.splice(0);
for (const run of pending) run();
```
Je t'avais expliqué la réassignation comme "protection contre la récursion infinie dans le même flush" —
vrai, mais incomplet. Le vrai problème, plus grave : les handlers (`BumperCollisionHandler` etc.) reçoivent
`this.pendingPhysics` **par référence** dans leur constructeur. Réassigner `this.pendingPhysics = []` change
ce que le PROCESSEUR pointe, mais ne change PAS la référence que les handlers gardent déjà. Résultat : après
le tout premier flush, les handlers continueraient à écrire dans l'ancien tableau, que le processeur ne
regarde plus jamais — plus aucun bumper, plus aucun drain, silencieusement, à partir de la deuxième
collision de toute la partie. `splice(0)` vide le tableau EN PLACE, sans changer la référence — tout le
monde continue à pointer vers le même objet.

**Nouveau handler ajouté.** `ScoopCollisionHandler` — un type de collision qui n'existait pas dans ta
version, ajouté par l'équipe depuis. Pas dans le scope de ta présentation, mais bon à savoir si le jury
demande "c'est quoi tous les handlers du tableau".

**`DrainCollisionHandler` supprimé, `DrainBall` gardé en paramètre fantôme.** Le rôle `'drain'` n'est plus
utilisé — le drain réel passe désormais par `BottomOutCollisionHandler` (rôle `'bottom_out'`). Le paramètre
`drainBallUC` reste dans la signature du constructeur, renommé `_drainBallUC` (le `_` signale en convention
TypeScript "paramètre volontairement inutilisé"), pour ne pas casser tous les appels existants qui
construisent `new CollisionEventProcessor(...)` avec 7 arguments dans cet ordre précis.

**Gros commentaire sur le contrat `emit`.** Le constructeur documente maintenant explicitement l'ordre de
fan-out attendu par la fonction `emit` (pré-décrément de vie, scoring, puis effets visuels/monde). C'est
une documentation de contrat implicite très pro — bon exemple à montrer si le jury demande "comment vous
documentez les invariants qui ne sont pas visibles dans le type système".

**Verdict** : présentable, c'est du très bon code, mais assume clairement que la version actuelle est le
fruit d'un travail d'équipe construit sur ta fondation (le refacto OCP, commit `2530b7b`), pas ton travail
solo. Voir §4 pour la formulation exacte.

### `BumperHit.ts` — inchangé depuis notre dernière lecture, mais toujours pas ton fichier

Aucun changement depuis mon dernier passage — toujours écrit à 100% par Anthony (créé le 14 mai, retouché
le 9 juin). Rien de neuf ici, juste un rappel : ce fichier n'a jamais été dans ton historique de commits.

---

## 2. Avantages concrets à présenter le code actuel plutôt que ton ancienne branche

**C'est la vérité du terrain.** Si l'évaluateur ouvre le repo pendant l'oral (il le peut — "l'évaluateur
navigue dans le code"), il verra la version `dev`, pas ta branche perso. Présenter une version différente
de ce qui est réellement dans le projet serait un vrai risque — décalage entre ce que tu montres et ce que
le jury peut vérifier lui-même.

**Le bug `pendingPhysics` est un exemple en or pour C3.3 et pour le Post-Mortem (C2.2).** Tu peux le
raconter comme un vrai cas de debugging : symptôme (les bumpers arrêtent de scorer après un moment),
cause racine (référence de tableau détachée après réassignation), correctif (`splice` au lieu de
réassigner), impact mesuré (plus aucun bumper silencieux). C'est exactement le type d'histoire que la fiche
Post-Mortem demande ("causes racines identifiées, impact mesuré").

**L'extraction `AlternateWorldState` valide ton diagnostic SRP.** Tu peux dire honnêtement : *"J'avais
identifié cette incohérence en préparant ma review — la logique boss était déjà extraite dans
`BossFightManager`, mais pas la logique monde alternatif. Depuis, l'équipe l'a extraite dans
`AlternateWorldState`, exactement la direction que j'avais anticipée."* Ça montre que ton analyse
architecturale était juste, même si tu n'as pas fait le commit toi-même.

**Il y a maintenant de vrais tests.** Tu peux répondre à la question C3.3/C2.2 sur la stratégie de tests
avec des faits réels : `CollisionEventProcessor.test.ts`, `BumperCollisionHandler.test.ts`,
`BumperHit.test.ts` existent dans `packages/game-engine/test/`, écrits principalement par Hugo Pigree. Tu
peux les ouvrir et les expliquer, même si tu ne les as pas écrits — comprendre et critiquer les tests des
autres est une compétence à part entière.

---

## 3. Inconvénients / risques à connaître

**Le risque principal : la question directe "as-tu écrit ce fichier ?".** Sur `BumperHit.ts` (0% toi) et
`CollisionEventProcessor.ts` (21% toi), une réponse évasive ou un mensonge serait le pire scénario possible
— l'épreuve est *"conçue pour repérer"* le code que tu ne maîtrises pas (citation de ta Fiche Focus HETIC).
Le risque n'est pas d'avoir du code coécrit, c'est de se faire surprendre en train de le cacher.

**Le fix `gameState` n'est plus une "découverte" à ton nom.** Si tu le présentes comme "j'ai trouvé ce bug",
et que le jury vérifie `git blame` ou `git log`, ça peut se retourner contre toi. Reformule (voir §4).

**Le commentaire "prune comments" a supprimé du JSDoc que tu avais écrit toi-même** (`cb49b73 docs: add
JSDoc comments to collision handlers`, ton commit). C'est un peu dommage pour la démonstration de "je
documente mon code proprement" — mais c'est une décision d'équipe globale, pas une critique de ton travail,
et c'est facile à expliquer si demandé.

---

## 4. Comment répondre honnêtement si le jury demande "as-tu écrit ce fichier ?"

**Sur `CollisionHandler.ts`** : *"Oui, entièrement — c'est l'interface que j'ai créée pendant mon refacto
OCP."* Rien à ajouter, c'est vrai à 100%.

**Sur `BumperCollisionHandler.ts`** : *"Oui, je l'ai créé pendant le refacto. Une ligne a été ajustée
depuis par un coéquipier — un check `gameState` manquant que j'avais moi-même identifié en préparant cette
review, avant de voir qu'il était déjà corrigé sur `dev`."* Honnête, montre que tu as fait le travail
d'audit même si tu n'as pas posé le commit.

**Sur `CollisionEventProcessor.ts`** : *"J'ai posé la fondation architecturale de ce fichier — le passage
d'un dispatch en `if/else` à un registre de handlers avec le pattern Strategy, pour respecter l'Open/Closed.
Depuis, l'équipe a construit dessus : extraction de la logique boss et monde alternatif dans des classes
dédiées, correction d'un bug de référence dans `flushPendingPhysics`, ajout d'une horloge injectable pour
les tests. Je maîtrise l'intégralité de ce qui s'y passe aujourd'hui et je peux l'expliquer ligne par
ligne, mais je ne prétends pas avoir écrit chaque ligne actuelle moi-même."*

**Sur `BumperHit.ts`** : *"Non, celui-ci a été écrit par un coéquipier. Je le présente parce qu'il complète
le circuit que je veux montrer — de la détection physique jusqu'à l'ajout du score — et je le comprends et
le défends complètement, y compris pourquoi l'interface `IBumperEject` est définie ici plutôt qu'ailleurs."*

Cette dernière formulation est la plus délicate. Si tu la sens risquée à l'oral, l'alternative sûre est en
§6.

---

## 5. Ce que ça implique pour tes documents de prep déjà faits

`PREPA_CODE_REVIEW_CollisionHandlers.md`, `SCRIPT_PRESENTATION_CODE_REVIEW.md`,
`ARGUMENTAIRE_SOLID_CLEAN_ARCHITECTURE.md` et `TESTS_4_FICHIERS.md` décrivent tous l'ANCIENNE version de
`CollisionEventProcessor.ts` (bloc boss inline, pas d'`AlternateWorldState`, pas d'horloge injectée,
`flushPendingPhysics` par réassignation, "0 test"). Ils sont maintenant partiellement obsolètes sur ce
fichier précis. Les parties sur `CollisionHandler.ts`, `BumperCollisionHandler.ts` et `BumperHit.ts`
restent valables (seul le fix `gameState`, déjà à jour dans `PREPA_CODE_REVIEW`, était concerné).

**Je ne les ai pas encore mis à jour** — je préfère qu'on confirme d'abord ensemble la stratégie de
présentation (§6) avant de tout reprendre, pour ne pas le refaire deux fois.

---

## 6. Décision à prendre avec moi

Trois options possibles pour la suite, à choisir avant que je remette à jour tous les documents :

**Option A — Les 4 fichiers actuels, présentés avec transparence totale.** Le narratif du §4. Le plus riche
techniquement (bug réel, extraction SRP, tests, horloge injectée), le plus exigeant en honnêteté assumée.

**Option B — Recentrer sur `CollisionHandler.ts` + `BumperCollisionHandler.ts` (100%/92% toi) et remplacer
`BumperHit.ts` par un autre use-case que tu as réellement écrit.** Plus sûr sur l'authorship, moins de
matière sur le circuit complet Adapter → Use Case. Il faudrait identifier un use-case qui est vraiment le
tien (à vérifier).

**Option C — Garder les 4 fichiers, mais recentrer le discours sur `CollisionHandler.ts` et
`BumperCollisionHandler.ts` comme cœur de la présentation, et mentionner `CollisionEventProcessor.ts` /
`BumperHit.ts` seulement pour montrer le contexte élargi, sans les défendre ligne à ligne comme "les
tiens".**
