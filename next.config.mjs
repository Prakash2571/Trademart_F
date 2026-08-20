/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Emit .next/standalone so the Docker runtime image only carries the traced
  // subset of node_modules. Additive: `next dev` and `next start` are unaffected.
  output: 'standalone',
  // Product images are served from Shopify's CDN.
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'cdn.shopify.com' }],
  },
};

export default nextConfig;
