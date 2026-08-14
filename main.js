const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  // 🎥 Configure a rigid aspect-ratio matching widescreen viewport wrapper frame
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    useContentSize: true, // Guarantees the canvas context receives crisp allocation bounds
    resizable: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // 🛡️ Bypasses chromium security headers to prevent internal CORS crashes
  // when dragging HTML DOM nodes over localized canvas elements offline.
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': ["default-src 'self' 'unsafe-inline' 'unsafe-eval' ws: wss: https:; img-src 'self' data: blob:;"]
      }
    });
  });

  // 📂 BOOT DIRECTLY FROM COMPUTER HARD DRIVE:
  // Phaser 3 completely bypasses build pipelines and loads flat out of the folder!
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Open the chromium inspector tool belt automatically during sandbox debugging sessions
  mainWindow.webContents.openDevTools();
}

// OS Lifecycle Listeners
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
