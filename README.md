# Pinball Monorepo

Bienvenue dans le monorepo du projet Pinball. Ce projet utilise une **Clean Architecture** pour assurer sa scalabilité et sa maintenabilité.

## Structure du Projet

- `packages/game-engine` : Moteur de jeu (Three.js + Cannon.js)
- `packages/server` : Backend (Node.js + Express + Socket.io + Prisma)
- `packages/app` : Frontend (Next.js)
- `packages/config-lint` : Configurations partagées (TS, ESLint, Prettier)

## Architecture Logicielle (Clean Architecture)

Chaque package suit cette structure :
- `domain` : Entités et modèles métier purs.
- `use-cases` : Logique métier.
- `infrastructure` : Implémentations concrètes (DB, moteur physique, rendu).
- `interface` : Adaptateurs pour l’UI ou les contrôleurs.

## Outils de Productivité

- **Task** (`Taskfile.yml`) : Unifié les commandes communes.
- **Docker Compose** : Démarre l'infrastructure locale (DB, Server, App).
- **GitHub Actions** : Pipeline CI automatisée pour lint et build.

## Démarrage Rapide

### Utilisation de Task (Recommandé)
```bash
task install
task db:up
task dev
```

### Installation Classique
```bash
npm install
```

### Développement
```bash
npm run dev
```

### Build
```bash
npm run build
```

### Lint
```bash
npm run lint
```
