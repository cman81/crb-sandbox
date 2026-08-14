const { app, BrowserWindow, protocol, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');

// 🛠️ Register the custom mod protocol scheme before the app finishes initializing
protocol.registerSchemesAsPrivileged([
  { scheme: 'crb-mod', privileges: { bypassCSP: true, secure: true, corsEnabled: true } }
]);

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    useContentSize: true,
    resizable: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      // 🔓 Expose a secure path resolution bridge to the front-end scene engine
      preload: path.join(__dirname, 'preload.js') 
    }
  });

  // 📂 Set up the cross-platform Documents mod pathway map
  const documentsPath = app.getPath('documents');
  const modsDirectory = path.join(documentsPath, 'CRB_Sandbox_Mods');

  // Verify the directory exists on the user's hard drive; if not, generate it automatically
  if (!fs.existsSync(modsDirectory)) {
    fs.mkdirSync(modsDirectory, { recursive: true });
    console.log(`📁 Generated initial cross-platform mods repository at: ${modsDirectory}`);
  }

  // 🔄 Handle the virtual 'crb-mod://' secure loading streams via absolute file buffers
  protocol.handle('crb-mod', async (request) => {
    // Convert url link 'crb-mod://BS01.json' into clean file path syntax
    const assetUrl = request.url.replace('crb-mod://', '');
    const safeDecodedPath = decodeURIComponent(assetUrl);
    const fullyResolvedAbsoluteFilePath = path.join(modsDirectory, safeDecodedPath);

    try {
      // 🛠️ MODERN ELECTRON FIX: Read raw binary stream buffers directly from disk bypassing chromium fetch
      const fileBuffer = await fs.promises.readFile(fullyResolvedAbsoluteFilePath);
      
      // Determine the exact MIME type so Phaser's JSON parser and Image loaders don't crash
      let mimeType = 'image/png';
      if (fullyResolvedAbsoluteFilePath.endsWith('.json')) {
        mimeType = 'application/json';
      }

      return new Response(fileBuffer, {
        headers: { 'content-type': mimeType }
      });
    } catch (error) {
      console.warn(`⚠️ Custom asset protocol read fail for: ${safeDecodedPath}`);
      return new Response(null, { status: 404 });
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.webContents.openDevTools();
}

// 📡 Listen for the front-end scene asking for a list of files in the mods folder
ipcMain.handle('get-modded-files', async () => {
  const documentsPath = app.getPath('documents');
  const modsDirectory = path.join(documentsPath, 'CRB_Sandbox_Mods');
  
  try {
    if (fs.existsSync(modsDirectory)) {
      // Return a clean flat array of string filenames (e.g., ['BS01.png', 'BS01.json'])
      return fs.readdirSync(modsDirectory);
    }
  } catch (error) {
    console.error("⚠️ Failed to scan community mod directory:", error);
  }
  return [];
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
