const { getSentryExpoConfig } = require("@sentry/react-native/metro");
const path = require('path');
const fs = require('fs');
const { resolve: metroResolve } = require('metro-resolver');

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

// Deterministic alias: Firebase's `firebase/auth` re-exports from `@firebase/auth`.
// In some Metro/export-resolution combinations, the non-RN build is selected and
// Auth never registers its component, causing:
//   "Component auth has not been registered yet"
// Force `@firebase/auth` and `@firebase/auth/internal` to the RN build shipped
// within the `firebase` package.
const RN_AUTH_ENTRY = path.join(__dirname, 'node_modules', 'firebase', 'node_modules', '@firebase', 'auth', 'dist', 'rn', 'index.js');
const RN_AUTH_INTERNAL_ENTRY = path.join(__dirname, 'node_modules', 'firebase', 'node_modules', '@firebase', 'auth', 'dist', 'rn', 'internal.js');

config.resolver.resolveRequest = (context, moduleName, platform) => {
	try {
		// Force Firebase Auth public entrypoints to the React Native build.
		// Firebase 10.x does not export `firebase/auth/react-native`, and the default
		// `firebase/auth` export chain can select the web build in some Metro setups.
		// This mapping ensures Auth registers its component on native.
		if (moduleName === 'firebase/auth' && fs.existsSync(RN_AUTH_ENTRY)) {
			return { type: 'sourceFile', filePath: RN_AUTH_ENTRY };
		}
		if (moduleName === 'firebase/auth/internal' && fs.existsSync(RN_AUTH_INTERNAL_ENTRY)) {
			return { type: 'sourceFile', filePath: RN_AUTH_INTERNAL_ENTRY };
		}

		if (moduleName === '@firebase/auth' && fs.existsSync(RN_AUTH_ENTRY)) {
			return { type: 'sourceFile', filePath: RN_AUTH_ENTRY };
		}
		if (moduleName === '@firebase/auth/internal' && fs.existsSync(RN_AUTH_INTERNAL_ENTRY)) {
			return { type: 'sourceFile', filePath: RN_AUTH_INTERNAL_ENTRY };
		}
	} catch (_) {
		// fall through to default resolver
	}
	// Important: pass `resolveRequest: null` to ensure the default resolver does
	// not bounce back into this custom resolver (which can cause recursion in
	// some Expo/Metro resolver compositions).
	return metroResolve(Object.freeze({ ...context, resolveRequest: null }), moduleName, platform);
};

module.exports = config;
