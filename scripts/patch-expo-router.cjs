#!/usr/bin/env node
/**
 * Patches the pnpm virtual store after install to fix two known issues:
 *
 * 1. expo-router internal shims — @expo/router-server@55 (bundled with expo@55)
 *    requires expo-router/internal/routing and expo-router/internal/testing,
 *    both of which are missing from expo-router@55.x. We create them here.
 *
 * 2. expo AppEntry.js patch — In a pnpm monorepo the expo package lives at
 *    node_modules/.pnpm/expo@55.x/node_modules/expo/AppEntry.js.
 *    That file does:  import App from '../../App'
 *    '../../' from that deep path does NOT reach the project root — it resolves
 *    to a non-existent path inside the pnpm store, causing bundling to fail on
 *    Android (both local Expo Go and EAS builds).
 *    We replace AppEntry.js with a one-liner that imports expo-router's own
 *    entry point, which handles root-component registration correctly.
 */
const fs = require("fs");
const path = require("path");

const pnpmStore = path.join(__dirname, "../node_modules/.pnpm");

if (!fs.existsSync(pnpmStore)) {
  console.log("[patch-expo-router] pnpm store not found, skipping patch.");
  process.exit(0);
}

const entries = fs.readdirSync(pnpmStore);

// ── 1. expo-router internal shims ─────────────────────────────────────────────
// Match both expo-router@6.x (old numbering) and expo-router@55.x (new SDK numbering)
const ROUTING_SHIM = `"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const matchers = require("../build/matchers");
exports.isTypedRoute = matchers.isTypedRoute;
`;

const TESTING_SHIM = `"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const contextStubs = require("../build/testing-library/context-stubs");
exports.requireContext = contextStubs.requireContext;
exports.requireContextWithOverrides = contextStubs.requireContextWithOverrides;
`;

const routerDirs = entries.filter(
  (e) => e.startsWith("expo-router@6.") || e.startsWith("expo-router@55.")
);

if (routerDirs.length === 0) {
  console.log("[patch-expo-router] No expo-router@6/55 found, skipping router shims.");
} else {
  for (const dir of routerDirs) {
    const routerPath = path.join(pnpmStore, dir, "node_modules", "expo-router");
    const internalDir = path.join(routerPath, "internal");
    if (!fs.existsSync(routerPath)) continue;
    fs.mkdirSync(internalDir, { recursive: true });
    fs.writeFileSync(path.join(internalDir, "routing.js"), ROUTING_SHIM);
    fs.writeFileSync(path.join(internalDir, "testing.js"), TESTING_SHIM);
    console.log(`[patch-expo-router] Router shims patched: ${dir}`);
  }
}

// ── 2. expo AppEntry.js patch ─────────────────────────────────────────────────
// Replace the broken `../../App` import with a direct expo-router entry import.
// This is safe because expo-router/entry-classic calls renderRootComponent()
// itself — we don't need AppEntry's registerRootComponent() call at all.
const APPENTRY_PATCHED = `// Patched by scripts/patch-expo-router.cjs
// Original file imported '../../App' which fails in pnpm deep-store layouts.
// expo-router/entry-classic handles root-component registration on its own.
import 'expo-router/entry-classic';
`;

const expoDirs = entries.filter((e) => e.startsWith("expo@"));

if (expoDirs.length === 0) {
  console.log("[patch-expo-router] No expo@ package found in pnpm store.");
} else {
  for (const dir of expoDirs) {
    const appEntryPath = path.join(
      pnpmStore, dir, "node_modules", "expo", "AppEntry.js"
    );
    if (!fs.existsSync(appEntryPath)) continue;

    const original = fs.readFileSync(appEntryPath, "utf-8");
    if (original.includes("../../App")) {
      fs.writeFileSync(appEntryPath, APPENTRY_PATCHED);
      console.log(`[patch-expo-router] AppEntry.js patched: ${dir}`);
    } else {
      console.log(`[patch-expo-router] AppEntry.js already patched: ${dir}`);
    }
  }
}

console.log("[patch-expo-router] Done.");
