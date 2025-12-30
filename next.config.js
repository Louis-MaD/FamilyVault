/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:3000"]
    },
    // Enable server components for libsodium if needed (though we removed externals)
    serverComponentsExternalPackages: ['argon2'],
  },
  // Webpack config removed to allow Next.js types to handle module resolution automatically
  webpack: (config) => {
    const path = require('path');
    // Fix for libsodium-wrappers ESM resolution: 
    // Alias to the absolute path of the CommonJS file to bypass 'exports' restriction
    config.resolve.alias = {
      ...config.resolve.alias,
      'libsodium-wrappers': path.join(__dirname, 'node_modules/libsodium-wrappers/dist/modules/libsodium-wrappers.js'),
    };
    return config;
  },
};

module.exports = nextConfig;