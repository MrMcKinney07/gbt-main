// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// expo-sqlite's web build ships a wasm binary (wa-sqlite) that Metro's default asset
// extensions don't include, so `expo start --web` fails to bundle it out of the box.
// This is Expo's own documented fix, not app-specific: register .wasm as an asset.
config.resolver.assetExts.push('wasm');

// expo-sqlite's web worker needs cross-origin isolation (SharedArrayBuffer) to run.
config.server.enhanceMiddleware = (middleware) => {
  return (req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    return middleware(req, res, next);
  };
};

module.exports = config;
