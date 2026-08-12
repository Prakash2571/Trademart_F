/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Product images are served from Shopify's CDN.
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'cdn.shopify.com' }],
  },
};

export default nextConfig;
