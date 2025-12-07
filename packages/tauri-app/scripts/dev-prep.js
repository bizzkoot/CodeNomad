#!/usr/bin/env node

const fs = require("fs")
const path = require("path")
const { execSync } = require("child_process")

const root = path.resolve(__dirname, "..")
const workspaceRoot = path.resolve(root, "..", "..")
const uiRoot = path.resolve(root, "..", "ui")
const uiDist = path.resolve(uiRoot, "src", "renderer", "dist")
const uiLoadingDest = path.resolve(root, "src-tauri", "resources", "ui-loading")

function ensureUiBuild() {
  const loadingHtml = path.join(uiDist, "loading.html")
  if (fs.existsSync(loadingHtml)) {
    return
  }

  console.log("[dev-prep] UI loader build missing; running workspace build…")
  execSync("npm --workspace @codenomad/ui run build", {
    cwd: workspaceRoot,
    stdio: "inherit",
  })

  if (!fs.existsSync(loadingHtml)) {
    throw new Error("[dev-prep] failed to produce loading.html after UI build")
  }
}

function copyUiLoadingAssets() {
  const loadingSource = path.join(uiDist, "loading.html")
  const assetsSource = path.join(uiDist, "assets")

  fs.rmSync(uiLoadingDest, { recursive: true, force: true })
  fs.mkdirSync(uiLoadingDest, { recursive: true })

  fs.copyFileSync(loadingSource, path.join(uiLoadingDest, "loading.html"))
  if (fs.existsSync(assetsSource)) {
    fs.cpSync(assetsSource, path.join(uiLoadingDest, "assets"), { recursive: true })
  }

  console.log(`[dev-prep] copied loader bundle from ${uiDist}`)
}

ensureUiBuild()
copyUiLoadingAssets()
