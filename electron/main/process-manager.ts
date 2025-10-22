import { spawn, ChildProcess } from "child_process"
import { app } from "electron"
import { existsSync, statSync } from "fs"
import { execSync } from "child_process"

export interface ProcessInfo {
  pid: number
  port: number
}

interface ProcessMeta {
  pid: number
  port: number
  folder: string
  startTime: number
  childProcess: ChildProcess
  logs: string[]
}

class ProcessManager {
  private processes = new Map<number, ProcessMeta>()

  async spawn(folder: string): Promise<ProcessInfo> {
    this.validateFolder(folder)
    this.validateOpenCodeBinary()

    return new Promise((resolve, reject) => {
      const child = spawn("opencode", ["serve", "--port", "0"], {
        cwd: folder,
        stdio: ["ignore", "pipe", "pipe"],
        env: process.env,
        shell: false,
      })

      const timeout = setTimeout(() => {
        child.kill("SIGKILL")
        reject(new Error("Server startup timeout (10s exceeded)"))
      }, 10000)

      let stdoutBuffer = ""
      let stderrBuffer = ""
      let portFound = false

      child.stdout?.on("data", (data: Buffer) => {
        const text = data.toString()
        stdoutBuffer += text

        const lines = stdoutBuffer.split("\n")
        stdoutBuffer = lines.pop() || ""

        for (const line of lines) {
          const portMatch = line.match(/opencode server listening on http:\/\/[^:]+:(\d+)/)
          if (portMatch && !portFound) {
            portFound = true
            const port = parseInt(portMatch[1], 10)
            clearTimeout(timeout)

            const meta: ProcessMeta = {
              pid: child.pid!,
              port,
              folder,
              startTime: Date.now(),
              childProcess: child,
              logs: [line],
            }

            this.processes.set(child.pid!, meta)
            resolve({ pid: child.pid!, port })
          }

          const logEntry = { timestamp: Date.now(), level: "info", message: line }
          const meta = this.processes.get(child.pid!)
          if (meta) {
            meta.logs.push(line)
          }
        }
      })

      child.stderr?.on("data", (data: Buffer) => {
        const text = data.toString()
        stderrBuffer += text

        const lines = stderrBuffer.split("\n")
        stderrBuffer = lines.pop() || ""

        for (const line of lines) {
          const logEntry = { timestamp: Date.now(), level: "error", message: line }
          const meta = this.processes.get(child.pid!)
          if (meta) {
            meta.logs.push(line)
          }
        }
      })

      child.on("error", (error) => {
        clearTimeout(timeout)
        if (error.message.includes("ENOENT")) {
          reject(new Error("opencode binary not found in PATH"))
        } else {
          reject(error)
        }
      })

      child.on("exit", (code, signal) => {
        clearTimeout(timeout)
        this.processes.delete(child.pid!)

        if (!portFound) {
          const errorMsg = stderrBuffer || `Process exited with code ${code}`
          reject(new Error(errorMsg))
        }
      })
    })
  }

  async kill(pid: number): Promise<void> {
    const meta = this.processes.get(pid)
    if (!meta) {
      throw new Error(`Process ${pid} not found`)
    }

    return new Promise((resolve, reject) => {
      const child = meta.childProcess

      const killTimeout = setTimeout(() => {
        child.kill("SIGKILL")
      }, 2000)

      child.on("exit", () => {
        clearTimeout(killTimeout)
        this.processes.delete(pid)
        resolve()
      })

      child.kill("SIGTERM")
    })
  }

  getStatus(pid: number): "running" | "stopped" | "unknown" {
    if (!this.processes.has(pid)) {
      return "unknown"
    }

    try {
      process.kill(pid, 0)
      return "running"
    } catch {
      return "stopped"
    }
  }

  getAllProcesses(): Map<number, ProcessMeta> {
    return new Map(this.processes)
  }

  async cleanup(): Promise<void> {
    const killPromises = Array.from(this.processes.keys()).map((pid) => this.kill(pid).catch(() => {}))
    await Promise.all(killPromises)
  }

  private validateFolder(folder: string): void {
    if (!existsSync(folder)) {
      throw new Error(`Folder does not exist: ${folder}`)
    }

    const stats = statSync(folder)
    if (!stats.isDirectory()) {
      throw new Error(`Path is not a directory: ${folder}`)
    }
  }

  private validateOpenCodeBinary(): void {
    const command = process.platform === "win32" ? "where opencode" : "which opencode"
    try {
      execSync(command, { stdio: "pipe" })
    } catch {
      throw new Error(
        "opencode binary not found in PATH. Please install OpenCode CLI first: npm install -g @opencode/cli",
      )
    }
  }
}

export const processManager = new ProcessManager()

app.on("before-quit", async (event) => {
  event.preventDefault()
  await processManager.cleanup()
  app.exit(0)
})
