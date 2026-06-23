# Refactor #3 — `useBackglassTakeover` : respect du principe SRP

> Fiche de présentation orale. Fichiers concernés :
> - `apps/backglass/src/hooks/useBackglassTakeover.ts` (le hook, allégé)
> - `apps/backglass/src/hooks/takeoverStack.ts` (**nouveau** — la machine à états)

---

## 1. Rappel du principe : SRP (le « S » de SOLID)

> **Single Responsibility Principle** : une unité de code ne doit avoir **qu'une
> seule raison de changer**.

Si un fichier fait 5 choses, il y a 5 raisons de le modifier → il devient fragile
et illisible. On appelle ça un **« god object »** (ici un **god-hook**).

---

## 2. Le problème trouvé

Le hook `useBackglassTakeover` faisait **~320 lignes** et cumulait au moins
**7 responsabilités** dans un seul `useEffect` :

1. cycle de vie de la connexion **Socket.io** + abonnements aux events ;
2. calcul du **rang** / qualification high-score ;
3. la **machine à états** « pile de scènes à priorités » (push / purge) ;
4. le **séquençage** des scènes (`followUp`) ;
5. la politique **attract mode** (inactivité) + Joyce wall ;
6. les **effets dérivés** (fever, onde dorée, agitation, surbrillance, hall-flip) ;
7. le **`setState`** périodique (toutes les 250 ms).

→ 7 raisons de changer dans un seul endroit = **violation de SRP**. Et comme
c'est de la logique stateful complexe **sans aucun test**, c'était risqué à faire
évoluer.

---

## 3. La solution : extraire la machine à états dans une classe pure

On sépare en **deux responsabilités claires** :

### A. `takeoverStack.ts` — la décision « quelle scène afficher » (PUR, sans React)

Une classe `TakeoverStack` qui possède **uniquement** la pile de scènes et sa
logique :

```ts
class TakeoverStack {
  push(entry)              // empile une scène candidate
  markActivity(now)        // repousse l'attract mode
  start(now)               // init des horloges
  tick(now, deps): result  // purge + followUp + highlight + attract + priorité
}
```

- Elle ne connaît **ni React ni Socket.io**.
- On lui **injecte** le temps (`now`) et quelques callbacks (`deps`).
- Donc elle est **testable unitairement** (le gros défaut d'avant : intestable car noyée dans un `useEffect`).

### B. `useBackglassTakeover.ts` — l'orchestration React (le hook, allégé)

Le hook ne garde que ce qui est **intrinsèquement** de son ressort :

- ouvrir/fermer la **socket** et router les events vers `stack.push(...)` ;
- faire tourner l'**interval** et, à chaque tick, appeler `stack.tick(...)` ;
- **projeter** le résultat dans le `setState` (+ signaux annexes : fever, joyce…).

```ts
const { top, highlightRank, holdHallFlip } = stack.tick(now, {
  holdsHallFlip: (clip) => clipBehaviorRef.current[clip]?.holdsHallFlip ?? false,
  attractJoyceName: () => entriesRef.current.find((e) => e.rank === 1)?.name ?? null,
  onJoyce: pushJoyce,
})
setState({ takeover: top ? {…} : null, highlightRank, holdHallFlip, … })
```

---

## 4. Avant / Après

| | Avant | Après |
|---|---|---|
| Responsabilités dans le hook | ~7 mélangées | orchestration (socket + tick + state) |
| Logique de pile (purge/priorité/attract) | dans le `useEffect` | classe `TakeoverStack` dédiée |
| Testable sans navigateur ? | ❌ non | ✅ oui (classe pure) |
| « Raisons de changer » par fichier | beaucoup | une |

> Le pattern utilisé s'appelle **« humble object »** : on sort la logique
> complexe dans un objet pur testable, et on laisse au composant/hook un rôle
> mince et difficile à casser.

---

## 5. Garantie : aucun changement de comportement

C'est un **refactor pur**. La logique du `tick` a été **déplacée telle quelle**
(mêmes calculs, mêmes priorités, mêmes durées). Le **type de retour du hook est
identique** — le composant `BackglassStage` (`pages/index.tsx`) le consomme sans
aucune modification :

```ts
const { takeover, alternateWorld, highlightRank, agitation, joyce,
        holdHallFlip, fever, goldWaveId } = useBackglassTakeover(entries)
```

Seul nettoyage au passage : suppression d'un `prevTopRef` qui était **écrit mais
jamais lu** (code mort sans effet).

### Comment vérifier

```bash
docker compose -f docker-compose.dev.yml restart backglass
```
Laisser tourner : le high-score, le recap, l'attract mode après 60 s d'inactivité
et les cinématiques doivent s'enchaîner **exactement comme avant**.

### Bonus rendu possible

La classe `TakeoverStack` étant pure, on peut maintenant écrire un test unitaire
du genre : *« push HIGH_SCORE → après expiration, le RECAP (followUp) devient la
scène active »* — impossible à tester proprement avant.

---

## 6. Récapitulatif des 3 refactors (pour conclure l'oral)

| # | Fichier | Principe | En une phrase |
|---|---------|----------|---------------|
| 1 | `socket-client.ts` | **DRY** | une seule définition de la connexion socket au lieu de 8 copies |
| 2 | `PlayfieldCameraFit.ts` | **Open/Closed** | table de stratégies par mode → ajouter un mode sans modifier le code |
| 3 | `takeoverStack.ts` | **SRP** | la machine à états sort du god-hook dans une classe pure testable |
