const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");
const fs = require("fs");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// ─── Monorepo support (local dev / Replit only) ────────────────────────────────
// In EAS builds the project is extracted to an isolated build directory.
// Skip workspace watch-folder/nodeModulePaths when the workspace root doesn't exist.
const isWorkspace = fs.existsSync(path.join(workspaceRoot, "pnpm-workspace.yaml"));
if (isWorkspace) {
  config.watchFolders = [workspaceRoot];
  config.resolver.nodeModulesPaths = [
    path.resolve(projectRoot, "node_modules"),
    path.resolve(workspaceRoot, "node_modules"),
  ];
}

// ─── pnpm deep-store / EAS entry-point fix ────────────────────────────────────
// pnpm puts packages in a deep virtual store:
//   node_modules/.pnpm/expo@55.x/node_modules/expo/AppEntry.js
//
// AppEntry.js does:  import App from '../../App'
// '../../' from that deep path resolves inside the pnpm store — NOT the project
// root — so Metro throws "Unable to resolve module ../../App".
//
// Primary defence: scripts/patch-expo-router.cjs replaces AppEntry.js at
// install time so the import never happens at all.
//
// Secondary defence (this resolver): if the patched AppEntry is somehow not in
// place (pnpm cache hit without postinstall), intercept the import here and
// redirect it to expo-router/entry-classic.

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const isAppEntryImport =
    moduleName === "../../App" &&
    typeof context.originModulePath === "string" &&
    context.originModulePath.includes("AppEntry");

  if (isAppEntryImport) {
    const resolvePaths = [projectRoot];
    if (isWorkspace) resolvePaths.push(workspaceRoot);

    const candidates = ["expo-router/entry-classic", "expo-router/entry"];

    // Primary: Node's require.resolve respects pnpm symlinks correctly
    for (const candidate of candidates) {
      for (const basePath of resolvePaths) {
        try {
          const resolved = require.resolve(candidate, { paths: [basePath] });
          if (resolved) {
            console.log(`[metro] Redirected AppEntry ../../App → ${candidate}`);
            return { type: "sourceFile", filePath: resolved };
          }
        } catch (_) {}
      }
    }

    // Fallback: spoof originModulePath so Metro resolves from the project root
    const projectRootContext = {
      ...context,
      originModulePath: path.join(projectRoot, "__entry_shim__.js"),
    };
    for (const candidate of candidates) {
      try {
        return projectRootContext.resolveRequest(projectRootContext, candidate, platform);
      } catch (_) {}
    }

    console.warn(
      "[metro] Could not redirect AppEntry ../../App — falling back to default (will likely fail)."
    );
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
