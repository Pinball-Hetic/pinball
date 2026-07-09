# Argumentaire SOLID / Clean Architecture — les 4 fichiers

> Le but ici n'est pas de savoir réciter "SRP = Single Responsibility Principle". C'est de pouvoir tenir
> tout seul, à voix haute, le raisonnement complet : définition → preuve dans TON code → ce qui casserait
> si le principe était violé. Chaque fiche suit ce même squelette en 3 temps. Entraîne-toi à le dire sans
> lire la "preuve", juste en regardant le fichier ouvert.

---

## SRP — Single Responsibility Principle

**Définition en une phrase** : une classe ne devrait avoir qu'une seule raison de changer.

**Preuve dans le code** : `BumperCollisionHandler` a une seule raison de changer — si la convention de
nommage des rôles de collider bumper change (`bumper_<index>` devient autre chose). Il n'a AUCUNE raison de
changer si la règle de score change (ça, c'est `BumperHit`), ni si la façon de traiter les collisions en
général change (ça, c'est `CollisionEventProcessor`). Chaque fichier a un seul "propriétaire" de
changement.

**Ce qui casserait sans SRP** : si `BumperCollisionHandler` contenait aussi la règle de score (`+1000
points`) et la logique de dispatch, alors changer la valeur du score obligerait à toucher un fichier qui
gère aussi la plomberie de dispatch — risque de casser autre chose en modifiant un truc sans rapport.

**Phrase-type à l'oral** : *"Je peux te dire en une phrase pourquoi chacun de ces 4 fichiers changerait un
jour — c'est ma façon de vérifier le SRP : si je ne peux pas donner une seule raison claire, c'est que la
classe fait trop de choses."*

**Contre-exemple honnête à connaître** (pour montrer que tu sais aussi critiquer) : `CollisionEventProcessor`
lui-même est plus discutable sur le SRP — il gère à la fois le dispatch générique ET la logique du monde
alternatif (baselines, flags). Voir `PREPA_CODE_REVIEW_CollisionHandlers.md` §8 pour le détail complet, déjà
préparé si le jury pousse là-dessus.

---

## OCP — Open/Closed Principle

**Définition en une phrase** : le code doit être ouvert à l'extension, mais fermé à la modification.

**Preuve dans le code** : le tableau `this.handlers` dans le constructeur de `CollisionEventProcessor`.
Pour ajouter un dixième type de collision, je crée une nouvelle classe qui `implements CollisionHandler`,
je l'instancie, je l'ajoute au tableau. Zéro ligne existante modifiée dans `process()`, dans `handle()` des
autres classes, ni dans `CollisionHandler.ts`.

**Ce qui casserait sans OCP** : l'ancienne version (avant le commit `2530b7b`) faisait probablement tout le
dispatch dans un grand `if/else` ou `switch` sur le rôle — ajouter un type de collision obligeait à modifier
cette fonction centrale, avec le risque de casser un `if` existant à chaque ajout.

**Phrase-type à l'oral** : *"Le test que je me donne pour vérifier l'OCP : si demain on me demande d'ajouter
un flipper collision handler, est-ce que je touche à `CollisionEventProcessor.ts` ? Non — juste le
constructeur, une ligne d'import et une ligne dans le tableau. Le comportement de dispatch lui-même,
`process()`, ne change jamais."*

---

## DIP — Dependency Inversion Principle

**Définition en une phrase** : les modules de haut niveau ne doivent pas dépendre des modules de bas niveau
— les deux doivent dépendre d'abstractions.

**Preuve dans le code** : `BumperHit` (use-case, "haut niveau" au sens métier) ne dépend jamais de
`BallPhysics` (infrastructure, "bas niveau", concret) directement. Il dépend de `IBumperEject`, une
interface qu'IL définit lui-même. C'est `BallPhysics`, l'implémentation concrète, qui vient se conformer à
cette abstraction — pas l'inverse.

**Ce qui casserait sans DIP** : si `BumperHit` importait et instanciait `BallPhysics` directement, il serait
impossible de le tester sans faire tourner un vrai monde Rapier, et impossible de changer d'implémentation
physique un jour sans modifier le use-case.

**Phrase-type à l'oral** : *"L'inversion, c'est que ce n'est pas le use-case qui dépend du détail technique
— c'est le détail technique qui vient se conformer au contrat défini par le use-case. Le sens de dépendance
est inversé par rapport à ce qu'on ferait naturellement."*

---

## ISP — Interface Segregation Principle

**Définition en une phrase** : un client ne devrait jamais être forcé de dépendre de méthodes qu'il n'utilise
pas.

**Preuve dans le code** : `IBumperEject` ne contient qu'UNE méthode, `applyEjectionForce`. Il existe une
interface plus large, `IBallPhysics` (côté `domain/`), qui contient bien plus de méthodes (spawn, sync mesh,
etc.) — `BumperHit` aurait pu dépendre de celle-là à la place, ça aurait marché techniquement (`BallPhysics`
l'implémente aussi). Mais ça aurait forcé `BumperHit` à "connaître" l'existence de méthodes dont il n'a
absolument rien à faire.

**Ce qui casserait sans ISP** : si on modifie une méthode de `IBallPhysics` sans rapport avec l'éjection
(ex. `spawnFromAlternateWorld`), tout le code qui dépend de cette grosse interface — y compris `BumperHit`,
qui n'utilise même pas cette méthode — pourrait potentiellement être affecté à la compilation. Une interface
minimale isole `BumperHit` de ces changements.

**Phrase-type à l'oral** : *"Je n'ai pas fait dépendre `BumperHit` de toute l'API physique de la bille, juste
du strict nécessaire — une seule méthode. C'est le use-case qui définit le contrat minimal dont il a besoin,
pas l'inverse."*

---

## LSP — Liskov Substitution Principle (rapide, pour ne pas être pris au dépourvu)

**Définition en une phrase** : une sous-classe doit pouvoir remplacer sa classe/interface parente sans
casser le programme.

**Preuve dans le code** : les 9 classes qui `implements CollisionHandler` sont toutes interchangeables dans
le tableau `handlers` — `CollisionEventProcessor` les traite exactement pareil (`h.canHandle(role)`,
`h.handle(...)`), sans jamais avoir besoin de savoir laquelle c'est concrètement. Si une implémentation
avait un comportement radicalement différent du contrat attendu (ex. `handle()` qui lance une exception au
lieu de traiter silencieusement un rôle non géré), ce serait une violation de LSP.

**Si le jury demande pourquoi tu ne l'as pas mentionné spontanément** : LSP est moins visible que les
autres ici parce qu'il n'y a pas d'héritage de classes (`extends`) dans ces 4 fichiers, seulement de
l'implémentation d'interface — LSP s'applique surtout quand on remplace une sous-classe par sa classe mère.
Le principe reste respecté (le tableau de handlers en est la preuve), mais c'est moins le sujet central que
OCP/DIP/ISP sur ce code précis.

---

## Strategy pattern

**Définition en une phrase** : encapsuler une famille d'algorithmes interchangeables derrière une interface
commune, et choisir lequel utiliser au runtime.

**Preuve dans le code** : `CollisionHandler` est l'interface commune, les 9 classes concrètes sont les
stratégies, `this.handlers.find(h => h.canHandle(role))` fait le choix au runtime, à chaque collision.

**Phrase-type à l'oral** : *"Techniquement, le choix de la stratégie active se fait par `canHandle()`
plutôt que d'être injecté à l'avance comme dans l'exemple manuel de cours (`ScoreManager.setStrategy(...)`)
— c'est une variante du pattern, un registre polymorphique, mais l'esprit est identique : une interface,
plusieurs implémentations, zéro `if/else` sur le type."*

---

## Adapter pattern (au sens Clean Architecture)

**Définition en une phrase** : traduire un format/protocole externe vers le format attendu par la couche
métier, sans porter de règle métier soi-même.

**Preuve dans le code** : `CollisionEventProcessor` traduit des identifiants numériques Rapier bruts en
appels de Use Cases avec des arguments métier (`bumperIndex`, `bumperPosition`). Il ne décide jamais
combien de points ou quelle force — juste QUI appeler et AVEC QUOI.

---

## Clean Architecture — les 4 couches, mappées sur tes fichiers

| Couche | Fichier(s) concerné(s) | Rôle exact |
|---|---|---|
| Domain / Entity | `ScoringConstants.ts` (`SCORE_BUMPER`), types dans `MapLayout.ts` | Constantes et règles pures, zéro dépendance |
| Use Case | `BumperHit.ts` | La règle "toucher un bumper" — testable seul, sans Rapier |
| Adapter | `CollisionEventProcessor.ts`, `CollisionHandler.ts` | Traduisent l'event physique brut en appel de Use Case |
| Infrastructure | `BumperCollisionHandler.ts` (partiellement — il touche `pendingPhysics`/Rapier indirectement), `BallPhysics.ts` | Détails techniques concrets (Rapier, positions GLB) |

**Nuance à assumer si le jury pousse** : `BumperCollisionHandler` est un cas limite entre Adapter et
Infrastructure — il fait de la traduction (comme un Adapter) mais vit dans le dossier `infrastructure/` et
manipule directement `pendingPhysics`, qui est un détail d'implémentation Rapier. C'est normal et assumé
dans ce projet : la frontière Adapter/Infrastructure n'est pas toujours une ligne parfaitement nette dans
un moteur de jeu temps réel, contrairement à un CRUD classique. Le point non négociable, celui qui compte
vraiment, c'est que la RÈGLE MÉTIER (score, force) ne fuit jamais hors de `BumperHit`.

**Phrase-type à l'oral** : *"La règle que je peux vérifier sur n'importe lequel de ces 4 fichiers : est-ce
qu'il contient un chiffre de score ou une constante de jeu en dur ? Seul `BumperHit`, via
`SCORE_BUMPER`, en a un. Les 3 autres n'en ont aucun — c'est ma preuve concrète que la couche métier est
isolée."*

---

## Testabilité — voir le fichier dédié

Le sujet des tests (testabilité par fichier, exemples de code, types de tests, lien avec C2.2/C3.3) a été
sorti dans son propre document pour ne pas le noyer ici : **`TESTS_4_FICHIERS.md`**. Vas-y directement pour
tout ce qui concerne "est-ce que c'est testé", "comment on teste ça", "quel type de test".
