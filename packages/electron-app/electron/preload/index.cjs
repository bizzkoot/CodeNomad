const { contextBridge, ipcRenderer } = require("electron")

const electronAPI = {
  onCliStatus: (callback) => {
    ipcRenderer.on("cli:status", (_, data) => callback(data))
    return () => ipcRenderer.removeAllListeners("cli:status")
  },
  onCliError: (callback) => {
    ipcRenderer.on("cli:error", (_, data) => callback(data))
    return () => ipcRenderer.removeAllListeners("cli:error")
  },
  getCliStatus: () => ipcRenderer.invoke("cli:getStatus"),
  restartCli: () => ipcRenderer.invoke("cli:restart"),
  openDialog: (options) => ipcRenderer.invoke("dialog:open", options),
  // MCP bridge methods
  mcpSend: (channel, data) => ipcRenderer.send(channel, data),
  mcpOn: (channel, callback) => {
    ipcRenderer.on(channel, (_, data) => callback(data))
    return () => ipcRenderer.removeAllListeners(channel)
  },
}

contextBridge.exposeInMainWorld("electronAPI", electronAPI)
