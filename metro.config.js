const path = require('node:path');
const { resolve } = require('metro-resolver');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const featureFlagsPath = path.join(
  __dirname,
  'node_modules/react-native/src/private/featureflags/ReactNativeFeatureFlags.js',
);

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  resolver: {
    // RN 0.87's own virtualized-lists package imports this internal module,
    // but RN does not expose that path in its package export map yet.
    resolveRequest(context, moduleName, platform) {
      if (
        moduleName ===
        'react-native/src/private/featureflags/ReactNativeFeatureFlags'
      ) {
        return { type: 'sourceFile', filePath: featureFlagsPath };
      }
      return resolve(context, moduleName, platform);
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
