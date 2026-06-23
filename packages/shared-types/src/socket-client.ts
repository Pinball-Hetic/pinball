// ───────────────────────────────────────────────────────────────────────────
// Factory Socket.io côté CLIENT (kiosques playfield / dmd / backglass).
//
// POURQUOI CE FICHIER EXISTE
// Avant, ces 3 lignes étaient copiées-collées dans ~8 hooks/pages :
//
//     const url = process.env.NEXT_PUBLIC_SOCKET_URL || undefined
//     const transports = url ? ['websocket'] : ['polling']
//     const socket = io(url, { transports })
//
// C'est une violation du principe DRY (Don't Repeat Yourself) : une SEULE
// règle métier (« comment un kiosque se connecte au serveur ») était dupliquée
// partout. Le jour où cette règle change, il fallait éditer 8 fichiers — en
// oublier un = bug SILENCIEUX en production. On centralise donc ici.
//
// IMPORTANT — ce fichier n'est volontairement PAS ré-exporté depuis index.ts.
// Le `server` importe `@pinball/shared-types` (pour les TYPES) mais n'a pas la
// dépendance `socket.io-client` (il utilise `socket.io` côté serveur). Le
// passer par `export *` tirerait du code client dans le bundle server. Les
// frontends l'importent donc en chemin direct :
//     import { createPinballSocket } from '@pinball/shared-types/src/socket-client'
// ───────────────────────────────────────────────────────────────────────────

import { io, type Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from './socket-events';

/**
 * Socket.io typé du projet : les events entrants (Server→Client) et sortants
 * (Client→Server) sont contraints par les contrats partagés. Centralisé ici
 * pour que tous les consommateurs partagent le même type (avant, chaque fichier
 * le redéfinissait à l'identique).
 */
export type PinballSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * Crée et OUVRE une connexion Socket.io vers le serveur de jeu.
 *
 * Le choix du transport dépend de l'environnement de déploiement :
 *
 * - `NEXT_PUBLIC_SOCKET_URL` DÉFINIE (dev local : le port du serveur est
 *   exposé, ex. http://localhost:3334) → connexion WebSocket DIRECTE, plus
 *   rapide.
 *
 * - `NEXT_PUBLIC_SOCKET_URL` ABSENTE (prod Fliphetic : le serveur n'a pas de
 *   port hôte, on passe par un rewrite Next.js « same-origin ») → POLLING pur.
 *   Raison : les rewrites Next.js ne savent pas relayer l'« upgrade » HTTP qui
 *   fait passer une connexion de polling à WebSocket → un WebSocket échouerait
 *   silencieusement. Le polling (~50-100 ms de latence) reste acceptable pour
 *   des boutons et du score.
 *
 * NB : `process.env.NEXT_PUBLIC_SOCKET_URL` est remplacé par sa valeur au BUILD
 * par Next.js (variable « publique » inlinée dans le bundle). Ça ne marche que
 * parce que `@pinball/shared-types` est listé dans `transpilePackages` des 3
 * apps — sinon Next ne ferait pas le remplacement dans ce fichier.
 *
 * @returns un socket déjà en cours de connexion. À l'appelant de gérer son
 *          cycle de vie (`socket.disconnect()` au démontage du composant).
 */
export function createPinballSocket(): PinballSocket {
  const url = process.env.NEXT_PUBLIC_SOCKET_URL || undefined;
  const transports: ('websocket' | 'polling')[] = url ? ['websocket'] : ['polling'];
  return io(url, { transports });
}
