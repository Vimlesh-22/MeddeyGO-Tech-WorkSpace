import type { NextConfig } from "next";

const toolProxyPorts: Record<string, number> = {
  "data-extractor-pro": Number(process.env.EXTRACTOR_PORT ?? 4092),
  "file-merger": Number(process.env.FILE_MERGER_PORT ?? 4093),
  "quote-generator": Number(process.env.QUOTE_PORT ?? 4094),
  "gsheet-integration": Number(process.env.GSHEET_PORT ?? 4095),
  "inventory-management": Number(process.env.INVENTORY_PORT ?? 4096),
  "order-extractor": Number(process.env.ORDER_EXTRACTOR_PORT ?? 4097),
  "ai-seo-strategist": Number(process.env.AI_SEO_PORT ?? 4098),
};

const rewrites = [
  // Allow frontends to use /tools/:slug/api/ paths while proxying to backend
  // This keeps them on their wrapper URL while the server tunnels requests
  {
    source: '/tools/:slug/api/:path*',
    destination: '/api/proxy/:slug/api/:path*',
  },
  {
    source: '/api/_proxy/:slug/:path*',
    destination: '/api/proxy/:slug/:path*',
  },
  // Proxy routes - use /_proxy/ prefix for actual backend proxying
  ...Object.entries(toolProxyPorts).map(([slug, port]) => ({
    source: `/_proxy/${slug}/:path*`,
    destination: `/api/proxy/${slug}/:path*`,
  })),
  // Handle static assets that might come without tool slug
  {
    source: `/_proxy/static/:path*`,
    destination: `/api/proxy/static/:path*`,
  },
];

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    // Optimize bundle size
    optimizePackageImports: ['lucide-react', '@google/genai'],
    // Reduce memory usage during build
    workerThreads: false,
  },
  // Optimize production builds
  productionBrowserSourceMaps: false,
  // Reduce webpack cache size
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }
    return config;
  },
  async rewrites() {
    return rewrites;
  },
};

export default nextConfig;
