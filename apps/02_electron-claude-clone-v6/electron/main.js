const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let apiServer;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'default',
    backgroundColor: '#1a1a1a',
    title: 'AI ASSistant',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Dark by default, Claude-like
  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Keep window fully on-screen with Windows controls visible - default Electron behavior
}

function startApiServer() {
  const serverPath = path.join(__dirname, '../server/vault-api.js');
  apiServer = spawn('node', [serverPath], { stdio: 'inherit' });
  console.log('Vault API server starting at 127.0.0.1:8765');
}

app.whenReady().then(() => {
  startApiServer();
  createWindow();
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (apiServer) apiServer.kill();
    app.quit();
  }
});

app.on('before-quit', () => {
  if (apiServer) apiServer.kill();
});

// IPC for vault operations
ipcMain.handle('get-vault-path', () => {
  return path.join(app.getPath('documents'), 'AI-Brain');
});