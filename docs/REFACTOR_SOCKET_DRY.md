# Refactor #1 — Factorisation de l'init Socket.io (principe DRY)

> Fiche de présentation orale. Explique **le problème trouvé**, **le principe SOLID/DRY concerné**, **la solution**, et **le code avant/après**.

---

## 1. Le problème en une phrase

La **même logique de connexion Socket.io** (3 lignes) était **copiée-collée dans 8 fichiers** des 3 écrans (playfield, dmd, backglass). C'est une violation du principe **DRY — _Don't Repeat Yourself_** (« ne te répète pas »).

### Les 3 lignes dupliquées partout

```ts
const url = process.env.NEXT_PUBLIC_SOCKET_URL || undefined
const transports = url ? ['websocket'] : ['polling']
const socket = io(url, { transports })
```

### Les 8 endroits concernés

| Écran | Fichier |
|-------|---------|
| backglass | `hooks/useBackglassData.ts` |
| backglass | `hooks/useBackglassTakeover.ts` |
| backglass | `hooks/useIngameReactor.ts` |
| dmd | `hooks/useDmdState.ts` |
| playfield | `hooks/usePhysicalInputs.ts` |
| playfield | `hooks/useDmdOrchestrator.ts` |
| playfield | `pages/pinball.tsx` |
| playfield | `pages/debug.tsx` |

*(Le 9ᵉ client, `apps/input-bridge`, est volontairement laissé à part : ce n'est pas un écran mais un service Node, et il se connecte différemment — avec un rôle d'authentification `auth: { role: 'input-bridge' }`.)*

---

## 2. Pourquoi c'est dangereux (pas juste « moche »)

Ces 3 lignes encodent une **règle métier subtile et critique** : *comment un écran choisit son mode de transport selon l'environnement*.

- En **dev**, le port du serveur est exposé → on se connecte en **WebSocket** direct (rapide).
- En **prod (borne Fliphetic)**, le serveur n'a pas de port exposé : on passe par un *rewrite* Next.js « same-origin ». Or **les rewrites Next.js ne savent pas relayer l'« upgrade » WebSocket** → il faut forcer le **polling** pur, sinon la connexion échoue **silencieusement**.

**Conséquence de la duplication** : le jour où cette règle change, il faut modifier **8 fichiers**. En oublier **un seul** = un écran qui ne se connecte plus en prod, **sans message d'erreur**. C'est exactement le type de bug que DRY évite : **une règle = un seul endroit**.

---

## 3. La solution : une fonction « usine » (factory) partagée

On crée **une seule fonction** qui contient la règle, et tout le monde l'appelle.

### Nouveau fichier : `packages/shared-types/src/socket-client.ts`

```ts
import { io, type Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from './socket-events';

// Le type du socket, centralisé (avant, chaque fichier le redéfinissait).
export type PinballSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

// La SEULE source de vérité de « comment un écran se connecte au serveur ».
export function createPinballSocket(): PinballSocket {
  const url = process.env.NEXT_PUBLIC_SOCKET_URL || undefined;
  const transports: ('websocket' | 'polling')[] = url ? ['websocket'] : ['polling'];
  return io(url, { transports });
}
```

### Avant / Après dans un écran

```ts
// AVANT (répété 8×)
const url = process.env.NEXT_PUBLIC_SOCKET_URL || undefined
const transports = url ? ['websocket'] : ['polling']
const socket = io(url, { transports })

// APRÈS (1 ligne, lisible, règle centralisée)
const socket = createPinballSocket()
```

---

## 4. Un choix d'architecture important à expliquer à l'oral

**Pourquoi mettre le helper dans `shared-types` mais NE PAS l'exporter depuis `index.ts` ?**

- `shared-types` est le package partagé par **tous** : les 3 écrans **et** le `server`.
- Mais le `server` utilise `socket.io` (côté serveur), **pas** `socket.io-client` (côté navigateur) : il n'a pas cette dépendance.
- Si on ajoutait `createPinballSocket` à l'`index.ts` (qui fait `export *`), on tirerait du **code client dans le bundle du serveur** → risque de casser son build.

**Solution** : le helper vit dans un fichier séparé, importé en **chemin direct** uniquement par les écrans :

```ts
import { createPinballSocket } from '@pinball/shared-types/src/socket-client'
```

Ainsi le `server` n'y touche jamais. (On a aussi déclaré `socket.io-client` dans les dépendances de `shared-types` pour que la dépendance soit explicite.)

---

## 5. Le principe SOLID/DRY illustré

| Avant | Après |
|-------|-------|
| 8 copies de la même règle | 1 seule définition (`createPinballSocket`) |
| Changer la règle = éditer 8 fichiers | Changer la règle = éditer **1 fichier** |
| Type `PinballSocket` redéfini 7× | Type défini **1 fois**, importé partout |
| Risque d'oubli → bug silencieux | Impossible d'oublier : tout le monde appelle la même fonction |

> **DRY** : chaque connaissance/règle du système doit avoir **une représentation unique, non ambiguë et faisant autorité**.

---

## 6. Comment vérifier que ça marche

```bash
# Redémarrer les écrans (modif dans packages/ → pas de hot reload fiable)
docker compose -f docker-compose.dev.yml restart playfield dmd backglass
```

Puis ouvrir chaque écran et confirmer que le score/les boutons remontent toujours (la connexion socket fonctionne). Le comportement est **identique** à avant — c'est un refactor **sans changement fonctionnel**, juste mieux rangé.
