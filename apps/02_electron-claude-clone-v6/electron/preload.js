const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getVaultPath: () => ipcRenderer.invoke('get-vault-path'),
  isElectron: true
});