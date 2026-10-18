import { contextBridge, ipcRenderer } from 'electron'
import type { NativeApi } from '../shared/desktop'

const api: NativeApi = {
  workspace: {
    read: () => ipcRenderer.invoke('workspace:read'),
    write: (data, revision) => ipcRenderer.invoke('workspace:write', data, revision),
  },
  vault: {
    choose: () => ipcRenderer.invoke('vault:choose'),
    list: () => ipcRenderer.invoke('vault:list'),
    read: (path) => ipcRenderer.invoke('vault:read', path),
  },
  about: () => ipcRenderer.invoke('app:about'),
}
contextBridge.exposeInMainWorld('oddbrain', api)
