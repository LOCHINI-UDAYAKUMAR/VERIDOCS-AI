/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  webpack: (config, { isServer }) => {
    config.resolve.alias.canvas = false;
    if (isServer) {
      // onnxruntime-node ships prebuilt .node native binaries that webpack
      // cannot parse. Mark them (and their parent packages) as externals so
      // Node's native require() loads them at runtime instead of bundling.
      const originalExternals = config.externals || [];
      config.externals = [
        ...originalExternals,
        ({ request }, callback) => {
          if (
            request &&
            (request.includes('onnxruntime') ||
              request.includes('@xenova/transformers'))
          ) {
            return callback(null, `commonjs ${request}`);
          }
          callback();
        },
      ];
    }
    // Prevent webpack from trying to parse binary .node files at all
    config.module = config.module || {};
    config.module.rules = config.module.rules || [];
    config.module.rules.push({
      test: /\.node$/,
      use: 'node-loader',
    });
    return config;
  },
  experimental: {
    serverComponentsExternalPackages: [
      'better-sqlite3',
      'tesseract.js',
      'pdf-parse',
      '@xenova/transformers',
      'onnxruntime-node',
    ],
  },
  // SECURITY: baseline hardening headers applied to every response.
  // - X-Content-Type-Options blocks MIME-sniffing (relevant given
  //   documents/files are served back to users; see also the explicit
  //   nosniff header set directly on the file/QR routes).
  // - X-Frame-Options / frame-ancestors prevent this app being embedded in
  //   a hidden iframe on another site (clickjacking).
  // - Referrer-Policy avoids leaking full URLs (which can contain tokens
  //   in query strings on some routes) to third-party referrers.
  // - Permissions-Policy disables browser features this app never uses.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};
module.exports = nextConfig;
