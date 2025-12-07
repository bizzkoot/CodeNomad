#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "fs"
import { resolve, join, basename } from "path"
import { PNG } from "pngjs"
import png2icons from "png2icons"

function printUsage() {
  console.log(`\nUsage: node scripts/generate-icons.js <input.png> [outputDir] [--name icon] [--radius 0.22]\n\nOptions:\n  --name    Base filename for generated assets (default: icon)\n  --radius  Corner radius ratio between 0 and 0.5 (default: 0.22)\n  --help    Show this message\n`)
}

function parseArgs(argv) {
  const args = [...argv]
  const options = {
    name: "icon",
    radius: 0.22,
  }

  for (let i = 0; i < args.length; i++) {
    const token = args[i]
    if (token === "--help" || token === "-h") {
      options.help = true
      continue
    }
    if (token === "--name" && i + 1 < args.length) {
      options.name = args[i + 1]
      i++
      continue
    }
    if (token === "--radius" && i + 1 < args.length) {
      options.radius = Number(args[i + 1])
      i++
      continue
    }
    if (!options.input) {
      options.input = token
      continue
    }
    if (!options.output) {
      options.output = token
      continue
    }
  }

  return options
}

function applyRoundedCorners(png, ratio) {
  const { width, height, data } = png
  const clamped = Math.max(0, Math.min(ratio, 0.5))
  if (clamped === 0) return png

  const radius = Math.max(1, Math.min(width, height) * clamped)
  const radiusSq = radius * radius
  const rightThreshold = width - radius
  const bottomThreshold = height - radius

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) * 4
      if (data[idx + 3] === 0) continue

      const px = x + 0.5
      const py = y + 0.5

      const inLeft = px < radius
      const inRight = px > rightThreshold
      const inTop = py < radius
      const inBottom = py > bottomThreshold

      let outside = false

      if (inLeft && inTop) {
        outside = (px - radius) ** 2 + (py - radius) ** 2 > radiusSq
      } else if (inRight && inTop) {
        outside = (px - rightThreshold) ** 2 + (py - radius) ** 2 > radiusSq
      } else if (inLeft && inBottom) {
        outside = (px - radius) ** 2 + (py - bottomThreshold) ** 2 > radiusSq
      } else if (inRight && inBottom) {
        outside = (px - rightThreshold) ** 2 + (py - bottomThreshold) ** 2 > radiusSq
      }

      if (outside) {
        data[idx + 3] = 0
      }
    }
  }

  return png
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  if (args.help || !args.input) {
    printUsage()
    process.exit(args.help ? 0 : 1)
  }

  const inputPath = resolve(args.input)
  const outputDir = resolve(args.output || "electron/resources")
  const baseName = args.name || basename(inputPath, ".png")
  const radiusRatio = Number.isFinite(args.radius) ? args.radius : 0.22

  let buffer
  try {
    buffer = readFileSync(inputPath)
  } catch (error) {
    console.error(`Failed to read ${inputPath}:`, error.message)
    process.exit(1)
  }

  let png
  try {
    png = PNG.sync.read(buffer)
  } catch (error) {
    console.error("Input must be a valid PNG:", error.message)
    process.exit(1)
  }

  applyRoundedCorners(png, radiusRatio)

  const roundedBuffer = PNG.sync.write(png)

  try {
    mkdirSync(outputDir, { recursive: true })
  } catch (error) {
    console.error("Failed to create output directory:", error.message)
    process.exit(1)
  }

  const pngPath = join(outputDir, `${baseName}.png`)
  writeFileSync(pngPath, roundedBuffer)

  const icns = png2icons.createICNS(roundedBuffer, png2icons.BICUBIC, false)
  if (!icns) {
    console.error("Failed to create ICNS file. Make sure the source PNG is at least 256x256.")
    process.exit(1)
  }
  writeFileSync(join(outputDir, `${baseName}.icns`), icns)

  const ico = png2icons.createICO(roundedBuffer, png2icons.BICUBIC, false)
  if (!ico) {
    console.error("Failed to create ICO file. Make sure the source PNG is at least 256x256.")
    process.exit(1)
  }
  writeFileSync(join(outputDir, `${baseName}.ico`), ico)

  console.log(`\nGenerated assets in ${outputDir}:`)
  console.log(`- ${baseName}.png`)
  console.log(`- ${baseName}.icns`)
  console.log(`- ${baseName}.ico`)
}

main()
