const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let serverProcess;

const isDev = !app.isPackaged;
const SERVER_PORT = 3002;

function startServer() {
  const serverPath = isDev
    ? path.join(__dirname, '..', 'server.js')
    : path.join(process.resourcesPath, 'server.js');

  serverProcess = spawn('node', [serverPath], {
    env: { ...process.env, PORT: SERVER_PORT, DATA_DIR: path.join(app.getPath('userData'), 'data') },
    stdio: 'pipe',
  });

  serverProcess.stdout?.on('data', d => console.log('[server]', d.toString().trim()));
  serverProcess.stderr?.on('data', d => console.error('[server]', d.toString().trim()));

  return new Promise(resolve => {
    const check = setInterval(async () => {
      try {
        const res = await fetch(`http://localhost:${SERVER_PORT}/api/health`);
        if (res.ok) { clearInterval(check); resolve(); }
      } catch {}
    }, 300);
    // Timeout after 15s
    setTimeout(() => { clearInterval(check); resolve(); }, 15000);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 12 },
    backgroundColor: '#0D0D14',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    icon: path.join(__dirname, '..', 'public', 'favicon.svg'),
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5190');
  } else {
    mainWindow.loadURL(`http://localhost:${SERVER_PORT}`);
  }

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(async () => {
  if (!isDev) {
    await startServer();
  }
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (serverProcess) serverProcess.kill();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (serverProcess) serverProcess.kill();
});
