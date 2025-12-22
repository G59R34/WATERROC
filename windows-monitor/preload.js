const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  sendLog: (data) => ipcRenderer.send('log-activity', data)
});
