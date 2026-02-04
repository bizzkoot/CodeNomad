const { contextBridge, ipcRenderer } = require("electron")

const electronAPI = {
  onCliStatus: (callback) => {
    const listener = (_, data) => callback(data)
    ipcRenderer.on("cli:status", listener)
    return () => ipcRenderer.removeListener("cli:status", listener)
  },
  onCliError: (callback) => {
    const listener = (_, data) => callback(data)
    ipcRenderer.on("cli:error", listener)
    return () => ipcRenderer.removeListener("cli:error", listener)
  },
  getCliStatus: () => ipcRenderer.invoke("cli:getStatus"),
  restartCli: () => ipcRenderer.invoke("cli:restart"),
  openDialog: (options) => ipcRenderer.invoke("dialog:open", options),
  // MCP bridge methods
  mcpSend: (channel, data) => ipcRenderer.send(channel, data),
  mcpOn: (channel, callback) => {
    const listener = (_, data) => callback(data)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  },
}

contextBridge.exposeInMainWorld("electronAPI", electronAPI)
