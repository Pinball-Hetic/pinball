/** @type {import('next').NextConfig} */
const SERVER_INTERNAL_URL = process.env.SERVER_INTERNAL_URL || 'http://server:3001';

const nextConfig = {
  // Sans ça, Next 308-redirige /socket.io/?EIO=4 vers /socket.io AVANT
  // les rewrites → engine.io (path strict /socket.io/) répond 404 →
  // le mode same-origin Fliphetic est mort. Ne pas retirer.
  skipTrailingSlashRedirect: true,
  reactStrictMode: true,
  turbopack: { root: '../..' },
  transpilePackages: ['@pinball/game-engine', '@pinball/shared-types'],
  async rewrites() {
    return [
      {
        // Préserve le préfixe /api : les routes server sont exposées en
        // /api/* — URL identique en accès direct (:3001/api/...) et via
        // le proxy same-origin.
        source: '/api/:path*',
        destination: `${SERVER_INTERNAL_URL}/api/:path*`,
      },
      {
        // engine.io n'utilise jamais de sous-path : la destination est
        // hardcodée AVEC le slash final (path-to-regexp rendait
        // `/socket.io` sans slash quand :path* est vide → 404 engine.io).
        // La query string (?EIO=4&transport=...) est forwardée d'office.
        source: '/socket.io/:path*',
        destination: `${SERVER_INTERNAL_URL}/socket.io/`,
      },
    ];
  },
};

module.exports = nextConfig;
