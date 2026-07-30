const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('stumpland', {
  save: (json) => ipcRenderer.invoke('save', json),
  load: () => ipcRenderer.invoke('load'),
});
