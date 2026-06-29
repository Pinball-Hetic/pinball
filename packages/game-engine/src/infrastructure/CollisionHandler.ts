/**
 * Contrat du pattern Strategy pour la gestion des collisions (OCP).
 *
 * Chaque type de collider possède son propre handler dédié.
 * Ajouter un nouveau rôle = créer une classe qui implémente cette interface
 * et l'enregistrer dans CollisionEventProcessor — sans modifier le processeur.
 */
export interface CollisionHandler {
  /** Retourne true si ce handler est responsable du rôle de collider donné. */
  canHandle(role: string): boolean;

  /**
   * Traite l'événement de collision.
   * @param role      - rôle du collider (préfixe GLB, ex. 'bumper_0', 'drain')
   * @param gameState - état courant du jeu ('playing', 'game_over', …)
   * @param started   - true = début de contact, false = fin de contact
   */
  handle(role: string, gameState: string, started: boolean): void;
}
