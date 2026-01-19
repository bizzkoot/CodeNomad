#!/usr/bin/env node

import { spawn } from "child_process"
import { existsSync, readFileSync } from "fs"
import path, { join } from "path"
import { fileURLToPath } from "url"

const __dirname = fileURLToPath(new URL(".", import.meta.url))
const appDir = join(__dirname, "..")
const workspaceRoot = join(appDir, "..", "..")

const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm"
const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx"
const nodeModulesPath = join(appDir, "node_modules")
const workspaceNodeModulesPath = join(workspaceRoot, "node_modules")

const platforms = {
  mac: {
    args: ["--mac", "--x64", "--arm64"],
    description: "macOS (Intel & Apple Silicon)",
  },
  "mac-x64": {
    args: ["--mac", "--x64"],
    description: "macOS (Intel only)",
  },
  "mac-arm64": {
    args: ["--mac", "--arm64"],
    description: "macOS (Apple Silicon only)",
  },
  win: {
    args: ["--win", "--x64"],
    description: "Windows (x64)",
  },
  "win-arm64": {
    args: ["--win", "--arm64"],
    description: "Windows (ARM64)",
  },
  linux: {
    args: ["--linux", "--x64"],
    description: "Linux (x64)",
  },
  "linux-arm64": {
    args: ["--linux", "--arm64"],
    description: "Linux (ARM64)",
  },
  "linux-rpm": {
    args: ["--linux", "rpm", "--x64", "--arm64"],
    description: "Linux RPM packages (x64 & ARM64)",
  },
  all: {
    args: ["--mac", "--win", "--linux", "--x64", "--arm64"],
    description: "All platforms (macOS, Windows, Linux)",
  },
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, NODE_PATH: nodeModulesPath, ...(options.env || {}) }
    const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path") ?? "PATH"

    const binPaths = [
      join(nodeModulesPath, ".bin"),
      join(workspaceNodeModulesPath, ".bin"),
    ]

    env[pathKey] = `${binPaths.join(path.delimiter)}${path.delimiter}${env[pathKey] ?? ""}`

    const spawnOptions = {
      cwd: appDir,
      stdio: "inherit",
      shell: process.platform === "win32",
      ...options,
      env,
    }

    const child = spawn(command, args, spawnOptions)

    child.on("error", reject)
    child.on("exit", (code) => {
      if (code === 0) {
        resolve(undefined)
      } else {
        reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`))
      }
    })
  })
}

function printAvailablePlatforms() {
  console.error(`\nAvailable platforms:`)
  for (const [name, cfg] of Object.entries(platforms)) {
    console.error(`  - ${name.padEnd(12)} : ${cfg.description}`)
  }
}

async function build(platform) {
  const config = platforms[platform]

  if (!config) {
    console.error(`❌ Unknown platform: ${platform}`)
    printAvailablePlatforms()
    process.exit(1)
  }

  console.log(`\n🔨 Building for: ${config.description}\n`)

  try {
    console.log("📦 Step 1/3: Building CLI dependency...\n")
    await run(npmCmd, ["run", "build", "--workspace", "@neuralnomads/codenomad"], {
      cwd: workspaceRoot,
      env: { NODE_PATH: workspaceNodeModulesPath },
    })

    console.log("\n📦 Step 2/3: Building Electron app...\n")
    await run(npmCmd, ["run", "build"])

    console.log("\n📦 Step 3/3: Packaging binaries...\n")

    // Step 2.5: Copy CLI dist and node_modules to resources
    console.log("\n📦 Step 2.5/3: Preparing CLI resources...")
    const { cpSync, renameSync, writeFileSync, existsSync, rmSync, readdirSync, statSync, readFileSync } = await import("fs")
    const { join } = await import("path")

    const serverDir = join(process.cwd(), "../server")
    const resourcesDir = join(process.cwd(), "resources")
    const cliDest = join(resourcesDir, "cli")
    const workspaceRootNodeModules = join(process.cwd(), "../../node_modules")

    // Ensure clean destination
    if (existsSync(cliDest)) rmSync(cliDest, { recursive: true, force: true })

    console.log(`Copying CLI from ${serverDir} to ${cliDest}`)
    cpSync(serverDir, cliDest, {
      recursive: true,
      filter: (source, destination) => {
        return !source.includes(".bin") && !source.includes("node_modules")
      }
    })

    // Install production dependencies in the copied CLI to ensure all transitive deps are resolved
    console.log(`\n📦 Installing production dependencies in copied CLI...`)
    const installResult = await run(npmCmd, ["install", "--production", "--no-package-lock"], {
      cwd: cliDest,
      stdio: "pipe",
    })
    console.log(`✓ Dependencies installed`)

    // Rename node_modules -> _node_modules to bypass electron-builder ignore
    if (existsSync(join(cliDest, "node_modules"))) {
      console.log("✓ Renaming node_modules -> _node_modules to bypass ignore rules")
      renameSync(join(cliDest, "node_modules"), join(cliDest, "_node_modules"))
    } else {
      console.warn("⚠️ node_modules not found in CLI dir")
    }

    // Create boot.js wrapper that sets up module resolution
    const bootContent = `
import { existsSync, symlinkSync, copyFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const hiddenPath = join(__dirname, '_node_modules');
const realPath = join(__dirname, 'node_modules');

// Create symlink from node_modules -> _node_modules (works in most cases)
if (existsSync(hiddenPath) && !existsSync(realPath)) {
  try {
    // Try creating a symlink first (works if we have write permissions)
    symlinkSync(hiddenPath, realPath, 'dir');
    console.log('[CodeNomad] Created symlink: node_modules -> _node_modules');
  } catch (e) {
    // Symlink failed, likely due to permissions
    // Set NODE_PATH as fallback for child processes
    process.env.NODE_PATH = hiddenPath;
    console.warn('[CodeNomad] Could not create symlink, using NODE_PATH fallback');
  }
}

// Import the CLI entry point
await import('./dist/bin.js');
`;
    writeFileSync(join(cliDest, "boot.js"), bootContent)
    console.log("✓ Created boot.js wrapper")

    // Cleanup source files
    const filesToRemove = ["src", "tsconfig.json", ".gitignore", "nodemon.json"]
    filesToRemove.forEach(f => {
      const p = join(cliDest, f)
      if (existsSync(p)) rmSync(p, { recursive: true, force: true })
    })
    const distPath = join(appDir, "dist")
    if (!existsSync(distPath)) {
      throw new Error("dist/ directory not found. Build failed.")
    }

    await run(npxCmd, ["electron-builder", "--publish=never", ...config.args])

    console.log("\n✅ Build complete!")
    console.log(`📁 Binaries available in: ${join(appDir, "release")}\n`)
  } catch (error) {
    console.error("\n❌ Build failed:", error)
    process.exit(1)
  }
}

const platform = process.argv[2] || "mac"

console.log(`
╔════════════════════════════════════════╗
║   CodeNomad - Binary Builder          ║
╚════════════════════════════════════════╝
`)

await build(platform)
