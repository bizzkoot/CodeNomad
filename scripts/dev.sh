#!/bin/bash

# Kill background processes on exit
trap 'kill $(jobs -p) 2>/dev/null' EXIT

# Build main and preload in watch mode
NODE_ENV=development vite build --watch --mode development --config electron.vite.config.ts --outDir dist/main &
MAIN_PID=$!

NODE_ENV=development vite build --watch --mode development --ssr electron/preload/index.ts --outDir dist/preload &
PRELOAD_PID=$!

# Start vite dev server for renderer
NODE_ENV=development vite --config electron.vite.config.ts --mode development &
RENDERER_PID=$!

# Wait for builds to complete
sleep 2

# Launch Electron
NODE_ENV=development electron .

# This will run when electron closes
wait
