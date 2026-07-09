# Script de présentation orale — Code Review (≈12 min)

> Écrit à la première personne, comme si c'était toi qui parlais. Ce n'est pas fait pour être lu mot à mot
> le jour J — entraîne-toi à voix haute 2-3 fois jusqu'à ce que ça sorte naturellement, avec tes propres
> mots. Les passages entre crochets *(→ Action : ...)* ne sont PAS à dire, ce sont des indications pour
> savoir quoi montrer à l'écran au bon moment.
>
> Minutage indicatif, à ajuster en te chronométrant réellement une fois répété. Les 4 fichiers couverts :
> `CollisionEventProcessor.ts`, `CollisionHandler.ts`, `BumperCollisionHandler.ts`, `BumperHit.ts`.

---

## 0:00 – 1:30 — Intro : l'architecture du projet

*(→ Action : rien à l'écran, ou le README/l'arborescence du repo)*

Bonjour, aujourd'hui je vais vous présenter quatre fichiers de mon projet, en me concentrant sur toute la
chaîne de traitement des collisions physiques du jeu — depuis la détection par le moteur physique jusqu'à
l'ajout du score.

Avant de rentrer dans le code, un mot rapide sur l'architecture générale du projet. C'est un monorepo,
organisé en deux familles : des `apps`, les programmes qu'on déploie tels quels — l'écran de jeu en 3D fait
avec Next.js et Three.js, un écran DMD qui affiche le score en temps réel, un écran de classement, un
serveur backend, et un pont USB-série pour les boutons physiques de la borne — et des `packages`, des
librairies internes partagées entre ces apps.

Le package qui nous intéresse aujourd'hui s'appelle `game-engine`. C'est là que vit toute la physique et
toute la logique de jeu, complètement indépendante de React — il n'y a pas une seule ligne d'interface
utilisateur là-dedans. Il est lui-même découpé en trois couches, sur le principe de la Clean Architecture :
une couche `domain`, avec les constantes et les règles pures ; une couche `infrastructure`, qui contient
tout ce qui touche concrètement au moteur physique Rapier et à Three.js ; et une couche `use-cases`, les
actions du jeu en logique pure, indépendantes de la physique et du rendu.

---

## 1:30 – 2:30 — Les 4 fichiers et pourquoi ce choix

*(→ Action : ouvre l'arborescence `packages/game-engine/src/`, montre les dossiers `infrastructure/` et
`use-cases/`)*

Les quatre fichiers que je vais vous montrer suivent exactement cette architecture. Trois sont dans
`infrastructure` : `CollisionEventProcessor`, `CollisionHandler`, et `BumperCollisionHandler`. Et un est
dans `use-cases` : `BumperHit`. J'ai volontairement choisi ce quatuor parce qu'il me permet de montrer le
trajet complet d'une collision physique, depuis le moment où le moteur Rapier détecte un contact, jusqu'au
moment où le score est réellement incrémenté — en traversant deux couches différentes de l'architecture,
pas juste un seul fichier isolé.

---

## 2:30 – 3:30 — Vue d'ensemble du circuit

*(→ Action : si tu as un schéma ou un tableau blanc, trace rapidement : Rapier → CollisionEventProcessor →
CollisionHandler → BumperCollisionHandler → BumperHit)*

Concrètement, voici le circuit. Rapier, le moteur physique, détecte que deux objets se touchent et remonte
ça sous forme d'événements bruts — juste deux identifiants numériques de colliders, sans aucune
signification métier. `CollisionEventProcessor` reçoit ces événements à chaque frame, soit soixante fois
par seconde, et fait deux choses : il traduit ces identifiants en noms compréhensibles, comme `bumper_2`,
et il choisit, parmi une liste de handlers spécialisés, lequel doit s'en occuper. `CollisionHandler` est
l'interface qui définit le contrat commun que tous ces handlers respectent. Pour l'exemple du bumper, celui
qui prend en charge la collision, c'est `BumperCollisionHandler` — mais lui-même ne connaît aucune règle de
jeu, il transmet juste l'information à `BumperHit`, qui est la seule classe de toute cette chaîne à savoir
ce qu'il faut vraiment faire : appliquer une force physique et ajouter des points.

---

## 3:30 – 6:00 — `CollisionEventProcessor.ts`

*(→ Action : ouvre le fichier, montre d'abord le constructeur, puis scrolle vers `process()`)*

On commence par `CollisionEventProcessor`. C'est l'orchestrateur : le point d'entrée unique, appelé à
chaque frame, qui reçoit toutes les collisions détectées par Rapier pendant cette frame-là.

Dans le constructeur, il reçoit en injection tout ce dont il a besoin : le layout de la map, une `Map` qui
traduit les identifiants numériques de collider en noms lisibles, et quatre use-cases déjà instanciés
ailleurs — dont `BumperHit`, qu'on va voir en détail après. Il construit ensuite un tableau, `handlers`,
qui contient neuf objets, chacun spécialisé dans un type de collision — bumper, drain, drop target, portail,
et ainsi de suite. Tous ces objets implémentent la même interface, `CollisionHandler`. C'est du **pattern
Strategy** : une interface commune, plusieurs implémentations interchangeables, et le fait que je puisse
ajouter un dixième handler demain sans modifier une seule ligne de ce fichier, c'est la démonstration
concrète du principe **Open/Closed**.

*(→ Action : scrolle vers `process()`)*

Dans `process()`, pour chaque collision, je traduis d'abord l'identifiant numérique en rôle lisible, je
gère un cas prioritaire pour les combats de boss — que je ne détaille pas aujourd'hui — et ensuite je fais
`this.handlers.find(h => h.canHandle(role))` : je cherche, dans l'ordre, le premier handler qui répond
qu'il est concerné, et je lui délègue le traitement avec `handler.handle(...)`. À ce moment-là,
`CollisionEventProcessor` ne sait absolument pas ce qui va se passer concrètement — c'est du
**polymorphisme** pur, et c'est exactement le rôle d'un **Adapter** au sens Clean Architecture : traduire
un événement technique brut en appel vers la bonne logique, sans jamais contenir lui-même de règle métier.

Un dernier point technique important : ce fichier ne modifie jamais la physique directement. Rapier
interdit toute mutation de son monde physique depuis l'intérieur de la boucle de traitement des collisions
— ça fait planter le moteur. Du coup, les handlers qui doivent agir sur la physique empilent une action
dans un tableau, `pendingPhysics`, qui est vidé juste après, une fois que Rapier autorise à nouveau les
modifications. C'est un pattern de report d'exécution qu'on a mis en place suite à un vrai bug rencontré en
développement.

---

## 6:00 – 7:00 — `CollisionHandler.ts`

*(→ Action : ouvre le fichier, il est très court)*

Ce fichier est volontairement minuscule : une interface avec deux méthodes, `canHandle`, qui répond juste
vrai ou faux, et `handle`, qui exécute l'action réelle. C'est le contrat que chaque handler doit respecter
pour pouvoir rejoindre le tableau qu'on vient de voir. Séparer la question — "est-ce que ce rôle me
concerne" — de l'action — "que dois-je faire" — permet de garder chaque handler concret simple à lire, et
c'est ce contrat qui rend le pattern Strategy possible : sans lui, `CollisionEventProcessor` ne pourrait
pas traiter tous les handlers de façon uniforme.

---

## 7:00 – 9:00 — `BumperCollisionHandler.ts`

*(→ Action : ouvre le fichier)*

Voilà maintenant une implémentation concrète de ce contrat, pour le cas du bumper. `canHandle` vérifie
juste que le rôle du collider commence par `bumper_`. Dans `handle`, je récupère l'index du bumper en
découpant le texte du rôle — par exemple `bumper_2` me donne l'index `2` — je vais chercher sa position
réelle sur le plateau dans le layout de la map, et si cette position existe, j'empile une action dans
`pendingPhysics` qui appellera le use-case `BumperHit` avec cet index et cette position.

Ce fichier est volontairement mince, et c'est un choix assumé : il ne fait aucune règle de jeu, juste de la
plomberie entre "quel rôle a été touché" et "quel use-case appeler avec quelles coordonnées". Toute la
logique métier est repoussée dans la couche suivante — c'est de la **séparation des responsabilités**.

*(→ Action : facultatif si le temps le permet — montrer que les autres handlers vérifient `gameState` et
que celui-ci non)*

Je veux aussi être honnête sur un point que j'ai identifié en préparant cette review : à l'origine, ce
handler ne vérifiait jamais l'état du jeu, `gameState`, contrairement à tous les huit autres handlers du
même dossier, qui filtrent tous sur `gameState !== 'playing'`. Concrètement, ça voulait dire qu'un bumper
pouvait continuer à ajouter des points même en dehors d'une partie en cours. C'est un écart réel que j'ai
trouvé en comparant les fichiers entre eux — et que j'ai corrigé avant de venir aujourd'hui : une seule
ligne modifiée, revérifiée avec le linter et le compilateur TypeScript, zéro erreur.

---

## 9:00 – 11:00 — `BumperHit.ts`

*(→ Action : ouvre le fichier, dans `use-cases/`)*

Et enfin, `BumperHit`, dans la couche use-case. C'est ici, et seulement ici, que la vraie règle du jeu est
écrite : quand un bumper est touché, on applique une force d'éjection physique et on ajoute mille points.
Ce fichier ne connaît ni Rapier, ni Three.js, ni React — c'est un Use Case pur au sens Clean Architecture,
testable de façon complètement isolée.

Le point que je veux mettre en avant ici, c'est l'interface `IBumperEject`, définie directement dans ce
fichier, pas dans la couche domaine, ni dans l'infrastructure. C'est le use-case lui-même qui décide du
contrat minimal dont il a besoin — une seule méthode, `applyEjectionForce`. C'est la classe
`BallPhysics`, du côté infrastructure, qui vient ensuite se conformer à ce contrat en l'implémentant. Ça
illustre deux principes en même temps : le **DIP**, l'inversion de dépendance, parce que `BumperHit` ne
dépend jamais d'une classe concrète mais d'une abstraction ; et l'**Interface Segregation**, parce que
plutôt que de dépendre de la grosse interface qui gère toute la physique de la bille, il ne dépend que du
strict minimum dont il a réellement besoin.

C'est exactement le principe qu'on peut résumer par la citation du Gang of Four : *"Program to interfaces,
not implementations"*. Et c'est ce qui rend ce fichier testable unitairement en quelques lignes : un mock
de `IBumperEject`, un mock de la fonction d'émission d'événements, et on peut vérifier tout le
comportement sans jamais démarrer de moteur physique.

---

## 11:00 – 12:00 — Conclusion

*(→ Action : reviens sur le schéma d'ensemble ou reste sur le dernier fichier ouvert)*

Pour résumer, ces quatre fichiers montrent ensemble : le pattern Strategy et l'Open/Closed via
`CollisionHandler` et le registre de handlers, le rôle d'Adapter de `CollisionEventProcessor` qui traduit
la physique brute sans jamais porter de règle métier, la séparation stricte entre une couche
infrastructure qui route l'information et une couche use-case qui porte la vraie logique, et l'inversion
de dépendance avec `IBumperEject`.

Et pour être transparent sur les limites : aucun de ces quatre fichiers n'a de test unitaire aujourd'hui,
alors qu'ils sont facilement testables avec de simples mocks — c'est la prochaine chose que je mettrais en
place. Et comme je l'ai dit, `BumperCollisionHandler` avait un oubli de vérification d'état de jeu, que
j'ai identifié et corrigé moi-même en comparant les fichiers avant de venir aujourd'hui. Voilà, je suis
prêt à répondre à vos questions.

---

## Repères de minutage (à ajuster après un vrai chrono)

| Bloc | Durée cible | Cumul |
|---|---|---|
| Intro architecture | 1:30 | 1:30 |
| Les 4 fichiers / pourquoi ce choix | 1:00 | 2:30 |
| Vue d'ensemble du circuit | 1:00 | 3:30 |
| `CollisionEventProcessor.ts` | 2:30 | 6:00 |
| `CollisionHandler.ts` | 1:00 | 7:00 |
| `BumperCollisionHandler.ts` | 2:00 | 9:00 |
| `BumperHit.ts` | 2:00 | 11:00 |
| Conclusion | 1:00 | 12:00 |

## Ce que ce script coche déjà pour la grille d'évaluation

- **C3.1** (lisibilité, specs, vocabulaire) → nommage explicite cité (`canHandle`, `handle`,
  `applyEjectionForce`), vocabulaire technique précis (Strategy, OCP, DIP, ISP, Adapter, polymorphisme).
- **C3.2** (maîtrise du framework) → explication concrète de la contrainte Rapier (`pendingPhysics`),
  usage correct des interfaces TypeScript.
- **C3.3** (debugging, correction) → le bug `pendingPhysics`/crash Rapier expliqué avec sa cause, le
  manque de check `gameState` trouvé ET corrigé avant l'oral (cycle complet detection → correction →
  validation), les tests manquants identifiés proactivement.
- **Attitude face à la critique** → la conclusion assume deux limites réelles (tests, `gameState`) sans
  attendre que le jury les trouve — c'est volontairement placé à la fin pour finir sur une note de recul
  critique plutôt que sur une liste de qualités.

Ce script ne couvre pas en détail les blocs "boss" (`BossFightManager`, `BossTargetSensor`) ni les autres
handlers (`DropTargetCollisionHandler`, etc.) — normal, ce n'est pas le sujet de ces 4 fichiers. Si le jury
pose une question dessus, tu as déjà des réponses dans le document principal
`PREPA_CODE_REVIEW_CollisionHandlers.md`.
