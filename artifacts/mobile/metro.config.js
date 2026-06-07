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
// '../../App' resolves RELATIVE to that deep path — not the project root.
//
// Our strategy: intercept that import inside resolveRequest and re-resolve
// 'expo-router/entry-classic' (or 'expo-router/entry' as fallback) using
// the PROJECT ROOT as the origin, so Metro's own machinery finds the right file.
//
// ⚠ We do NOT pre-resolve the path at config-load time — that fails in EAS
//   because the workspace node_modules may not be accessible yet.
// ⚠ We do NOT hardcode the path — symlink targets differ across environments.
//
// Instead we dynamically call context.resolveRequest with a spoofed
// originModulePath that lives at the project root, which forces Metro to look
// in the project's own node_modules (where expo-router IS installed).

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const isAppEntryImport =
    moduleName === "../../App" &&
    typeof context.originModulePath === "string" &&
    context.originModulePath.includes("AppEntry");

  if (isAppEntryImport) {
    // Spoof origin to project root so Metro resolves from the right node_modules
    const projectRootContext = {
      ...context,
      originModulePath: path.join(projectRoot, "__entry_shim__.js"),
    };

    const candidates = ["expo-router/entry-classic", "expo-router/entry"];
    for (const candidate of candidates) {
      try {
        return projectRootContext.resolveRequest(projectRootContext, candidate, platform);
      } catch (_) {
        // try next candidate
      }
    }

    // Last resort: try via require.resolve with explicit paths
    const resolvePaths = [projectRoot, workspaceRoot].filter(
      (p) => fs.existsSync(path.join(p, "node_modules"))
    );
    for (const candidate of candidates) {
      for (const basePath of resolvePaths) {
        try {
          const resolved = require.resolve(candidate, { paths: [basePath] });
          return { type: "sourceFile", filePath: resolved };
        } catch (_) {}
      }
    }

    console.error(
      "[metro.config] Could not resolve expo-router entry — falling back to default resolution."
    );
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
