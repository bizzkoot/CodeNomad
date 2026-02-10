#!/usr/bin/env node
import { spawnSync } from "child_process"
import { cpSync, existsSync, mkdirSync, rmSync } from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const cliRoot = path.resolve(__dirname, "..")
const sourceDir = path.resolve(cliRoot, "../opencode-config")
const targetDir = path.resolve(cliRoot, "dist/opencode-config")
const nodeModulesDir = path.resolve(sourceDir, "node_modules")
const pluginDistDir = path.resolve(nodeModulesDir, "@opencode-ai/plugin/dist")
const selfLinkDir = path.resolve(nodeModulesDir, "@codenomad", "opencode-config")
const bunLockFile = path.resolve(sourceDir, "bun.lock")
const npmExecPath = process.env.npm_execpath
const npmNodeExecPath = process.env.npm_node_execpath

if (!existsSync(sourceDir)) {
  console.error(`[copy-opencode-config] Missing source directory at ${sourceDir}`)
  process.exit(1)
}

// Remove bun.lock file if it exists, as it can interfere with npm installation
rmSync(bunLockFile, { force: true })

// Check if we need to install (node_modules doesn't exist OR plugin dist is missing)
const needsInstall = !existsSync(nodeModulesDir) || !existsSync(pluginDistDir)

if (needsInstall) {
  // Clean up node_modules if it exists but is corrupted
  if (existsSync(nodeModulesDir) && !existsSync(pluginDistDir)) {
    console.log(`[copy-opencode-config] Cleaning corrupted node_modules in ${sourceDir}`)
    rmSync(nodeModulesDir, { recursive: true, force: true })
  }

  console.log(`[copy-opencode-config] Installing opencode-config dependencies in ${sourceDir}`)

  const npmArgs = [
    "install",
    "--prefix",
    sourceDir,
    "--omit=dev",
    "--ignore-scripts",
    "--fund=false",
    "--audit=false",
    "--package-lock=true",
    "--workspaces=false",
  ]

  const env = { ...process.env, npm_config_workspaces: "false" }

  const npmCli = npmExecPath && npmNodeExecPath ? [npmNodeExecPath, [npmExecPath, ...npmArgs]] : null
  const result = npmCli
    ? spawnSync(npmCli[0], npmCli[1], { cwd: sourceDir, stdio: "inherit", env })
    : spawnSync("npm", npmArgs, { cwd: sourceDir, stdio: "inherit", env, shell: process.platform === "win32" })

  if (result.status !== 0) {
    if (result.error) {
      console.error("[copy-opencode-config] npm install failed to start", result.error)
    }
    console.error("[copy-opencode-config] Failed to install opencode-config dependencies")
    process.exit(result.status ?? 1)
  }

  // Verify the plugin dist folder was created
  if (!existsSync(pluginDistDir)) {
    console.error("[copy-opencode-config] ERROR: @opencode-ai/plugin/dist folder not created after npm install")
    console.error("[copy-opencode-config] This may indicate a network issue or corrupted npm cache")
    console.error("[copy-opencode-config] Try: npm cache clean --force")
    process.exit(1)
  }

  console.log(`[copy-opencode-config] Successfully installed @opencode-ai/plugin with dist folder`)
}

// npm can create a self-referential link for scoped packages on Windows.
// That link causes recursive copies (ELOOP) during bundling.
rmSync(selfLinkDir, { recursive: true, force: true })

rmSync(targetDir, { recursive: true, force: true })
mkdirSync(path.dirname(targetDir), { recursive: true })
cpSync(sourceDir, targetDir, { recursive: true })

console.log(`[copy-opencode-config] Copied ${sourceDir} -> ${targetDir}`)
