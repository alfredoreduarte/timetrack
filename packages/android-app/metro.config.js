const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Watch monorepo root for shared packages
config.watchFolders = [monorepoRoot];

// Resolve modules from both local and root node_modules
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

// Block the ROOT copies of react and react-native from being bundled.
// This forces all imports to resolve to the LOCAL copies (React 19 / RN 0.81).
// We escape the path for use in a regex and only block the specific package dirs.
const rootNM = path.resolve(monorepoRoot, "node_modules");
const escaped = rootNM.replace(/[/\\]/g, "[/\\\\]");
config.resolver.blockList = [
  new RegExp(`${escaped}[/\\\\]react[/\\\\].*`),
  new RegExp(`${escaped}[/\\\\]react-native[/\\\\].*`),
];

// Also set extraNodeModules so bare imports prefer local copies
config.resolver.extraNodeModules = {
  react: path.resolve(projectRoot, "node_modules/react"),
  "react-native": path.resolve(projectRoot, "node_modules/react-native"),
};

module.exports = config;
