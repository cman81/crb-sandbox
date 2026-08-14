const { contextBridge } = require('electron');

// Expose safe custom window properties to your Phaser application if needed later
contextBridge.exposeInMainWorld('electronAPI', {
  appVersion: '1.0.0'
});
