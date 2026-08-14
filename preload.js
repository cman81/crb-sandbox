const { contextBridge, ipcRenderer } = require('electron');

// 🌉 Safely expose a secure api bridge to your front-end window context
contextBridge.exposeInMainWorld('crbElectronBridge', {
    // Allows Phaser scenes to request an array of all filenames inside the mod directory
    getModdedFilesList: () => ipcRenderer.invoke('get-modded-files')
});
