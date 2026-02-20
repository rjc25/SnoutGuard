/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: [
    '@archguard/core',
    '@archguard/api',
    '@archguard/shared',
  ],
  experimental: {
    serverActions: true,
  },
};

module.exports = nextConfig;
