const { getSentryExpoConfig } = require("@sentry/react-native/metro");

const config = getSentryExpoConfig(__dirname);

// Firebase Auth fix (Expo SDK 54 / Metro):
// Ensure package `exports` resolution includes the `react-native` condition so
// `@firebase/auth` resolves to its RN build (which calls registerAuth(...)).
// Without this, some production bundles can throw:
//   "Component auth has not been registered yet"
config.resolver = config.resolver || {};
config.resolver.unstable_enablePackageExports = true;

const existingConditions = Array.isArray(config.resolver.unstable_conditionNames)
	? config.resolver.unstable_conditionNames
	: [];
const neededConditions = ['react-native', 'browser', 'default'];
config.resolver.unstable_conditionNames = Array.from(
	new Set([...neededConditions, ...existingConditions])
);

module.exports = config;
