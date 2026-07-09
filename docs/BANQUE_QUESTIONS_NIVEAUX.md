# Banque de questions par niveau — les 4 fichiers

> Volontairement sans réponses, comme ta banque `Questions_CollisionEventProcessor.pdf` — le but est de
> t'entraîner à répondre à voix haute, dans le désordre, pas de relire une réponse toute faite. Les
> réponses/éléments de fond existent déjà, répartis dans : `PREPA_CODE_REVIEW_CollisionHandlers.md`,
> `LEXIQUE_SYNTAXE_TS.md`, `ARGUMENTAIRE_SOLID_CLEAN_ARCHITECTURE.md`. Si tu bloques plus de 15 secondes sur
> une question, va chercher l'indice dans le bon document, puis reviens réessayer sans regarder.
>
> Méthode conseillée : demande à quelqu'un (ou repasse ce fichier toi-même) de te poser les questions DANS
> LE DÉSORDRE, pas dans l'ordre du fichier — c'est ça qui simule vraiment un oral.

---

## Niveau 1 — Syntaxe (lecture ligne à ligne)

1. Dans `private readonly pendingPhysics: Array<() => void>`, à quoi sert `private readonly` écrit
   directement dans le constructeur ?
2. Que fait exactement `?.` dans `handler?.handle(role, gameState, started)` ? Que se passerait-il sans lui ?
3. Quelle différence entre `a ?? b` et `a || b` ? Donne un exemple où ça change le résultat.
4. Dans `parseInt(role.split('_')[1], 10)`, à quoi sert le `10` ?
5. Que retourne `role.split('_')` sur la chaîne `'bumper_2'` ? Et `[1]` juste après ?
6. Quelle est la différence entre `import type { X }` et `import { X }` ? Donne un exemple de chaque dans
   tes 4 fichiers.
7. Que représente `Array<() => void>` comme type ? Décompose-le.
8. Explique `Partial<Record<BossId, number>>` sans dire juste "c'est un objet partiel".
9. Dans `this.handlers.find(h => h.canHandle(role))`, que fait `find()` précisément ? Que retourne-t-il si
   rien ne correspond ?
10. Quelle différence entre une `interface` et une `class` en TypeScript ? Les deux disparaissent-elles à
    la compilation ?

## Niveau 2 — Mécanique / fonctionnement d'un fichier

11. Décris, sans regarder le code, ce que fait `process()` du début à la fin.
12. Pourquoi `pendingPhysics` existe-t-il ? Que se passe-t-il si on appelle `bumperHitUC.execute()`
    directement dans `handle()` ?
13. Dans `flushPendingPhysics()`, pourquoi `this.pendingPhysics = []` est réassigné AVANT la boucle
    d'exécution et pas après ?
14. `BumperCollisionHandler.canHandle()` fait quel test exactement ? Pourquoi ce test-là et pas un autre ?
15. Comment `BumperCollisionHandler` retrouve-t-il la position réelle du bumper touché ?
16. Que fait le `if (pos)` avant le `push` dans `pendingPhysics` ? Que se passe-t-il si cette condition
    n'existait pas et que `pos` était `undefined` ?
17. Dans `BumperHit.execute()`, dans quel ordre les deux actions se produisent-elles, et pourquoi cet ordre
    (et pas l'inverse) ?
18. `IBumperEject` est définie où exactement, et qui l'implémente ?
19. Pourquoi `CollisionEventProcessor` ne modifie-t-il jamais la physique lui-même ?
20. Rejoue de mémoire, à voix haute, le trajet complet d'une collision bumper — de Rapier jusqu'au score
    ajouté, sans sauter d'étape.

## Niveau 3 — Principes & patterns

21. En quoi `CollisionHandler` illustre-t-il le pattern Strategy ? Cite les 3 ingrédients du pattern
    présents dans le code.
22. Explique l'OCP avec un exemple concret : comment ajouterais-tu un `FlipperCollisionHandler` sans
    modifier `CollisionEventProcessor.ts` ?
23. Pourquoi `BumperHit` dépend-il de `IBumperEject` et pas directement de `BallPhysics` ? Quel principe
    ça illustre ?
24. Quelle différence entre `IBumperEject` et `IBallPhysics` ? Pourquoi cette différence est un exemple
    d'ISP ?
25. Donne une seule raison de changer pour chacun des 4 fichiers. Si tu en trouves deux raisons pour un
    même fichier, qu'est-ce que ça indiquerait ?
26. `CollisionEventProcessor` est-il un bon exemple de SRP à 100% ? Justifie, y compris ses limites.
27. Explique le rôle d'Adapter de `CollisionEventProcessor` avec tes propres mots, sans utiliser le mot
    "traduit".
28. Que veut dire "program to interfaces, not implementations" appliqué concrètement à `BumperHit.ts` ?

## Niveau 4 — Architecture globale

29. Place les 4 fichiers (+ `BallPhysics.ts` et `ScoringConstants.ts`) dans les 4 couches de la Clean
    Architecture. Justifie chaque placement.
30. Pourquoi `BumperCollisionHandler` est un cas limite entre Adapter et Infrastructure ? Est-ce un
    problème ?
31. Si demain on remplaçait Rapier par un autre moteur physique, quels fichiers parmi les 4 devraient
    changer ? Lesquels resteraient identiques ?
32. Où vit `CollisionEventProcessor` dans l'appli réelle ? Qui l'instancie, et où est-il appelé dans la
    boucle de jeu ?
33. Quelle est la règle de dépendance fondamentale de la Clean Architecture, et où la vois-tu respectée (ou
    pas) dans ces 4 fichiers ?

## Niveau 5 — Testabilité

34. Est-ce que ces 4 fichiers ont des tests aujourd'hui ? Comment le sais-tu ?
35. Classe les 4 fichiers du plus facile au plus difficile à tester unitairement, et justifie l'ordre.
36. Pourquoi `BumperHit.ts` est-il particulièrement facile à tester ? Qu'est-ce qui le rend testable sans
    dépendance lourde ?
37. Qu'est-ce qui rend `CollisionEventProcessor.ts` plus difficile à tester que les autres ?
38. Si tu devais écrire UN SEUL test avant l'oral pour prouver que tu sais faire, lequel choisirais-tu et
    pourquoi ?
39. Une interface (`CollisionHandler.ts`) se teste-t-elle directement ? Justifie.

## Niveau 6 — Debugging & modification en direct

40. Explique le crash Rapier qu'on évite avec `pendingPhysics`. Dans quelles conditions se produit-il
    exactement ?
41. Quel bug as-tu trouvé et corrigé dans `BumperCollisionHandler.ts` ? Montre le diff de mémoire.
42. Pourquoi ce bug ne provoquait-il pas d'erreur visible (pas de crash, pas d'exception) ? Comment
    l'as-tu détecté alors ?
43. Le jury te demande d'ajouter un logging quand `layout.bumpers[idx]` est `undefined` — fais-le en
    direct, en une ligne, sans casser le comportement existant.
44. Le jury te demande d'annuler ton fix `gameState` puis de le refaire — fais-le sans notes.
45. Le jury te demande d'ajouter un `KickbackCollisionHandler` en 2 minutes — énumère les fichiers que tu
    touches, dans l'ordre.
