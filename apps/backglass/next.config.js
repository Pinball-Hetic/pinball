/** @type {import('next').NextConfig} */
const SERVER_INTERNAL_URL = process.env.SERVER_INTERNAL_URL || 'http://server:3001';

const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@pinball/shared-types'],
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${SERVER_INTERNAL_URL}/:path*`,
      },
      {
        source: '/socket.io/:path*',
        destination: `${SERVER_INTERNAL_URL}/socket.io/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
