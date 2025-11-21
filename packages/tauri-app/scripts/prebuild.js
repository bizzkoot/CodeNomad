#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const serverRoot = path.resolve(root, "..", "server");
const dest = path.resolve(root, "src-tauri", "resources", "server");

const sources = ["dist", "public", "node_modules", "package.json"];

fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(dest, { recursive: true });

for (const name of sources) {
  const from = path.join(serverRoot, name);
  const to = path.join(dest, name);
  if (!fs.existsSync(from)) {
    console.warn(`[prebuild] skipped missing ${from}`);
    continue;
  }
  fs.cpSync(from, to, { recursive: true });
  console.log(`[prebuild] copied ${from} -> ${to}`);
}
