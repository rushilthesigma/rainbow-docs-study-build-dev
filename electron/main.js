const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

// macOS app menu name + dock label.
app.setName('RushilAI');

let mainWindow;
let serverProcess;

const isDev = !app.isPackaged;
const SERVER_PORT = 3002;

// electron/main.js lives one level under the project root in BOTH layouts:
//   dev      -> <repo>/electron/main.js            (root = <repo>)
//   packaged -> .../Resources/app/electron/main.js (root = .../Resources/app, asar disabled)
// so server.js, node_modules, dist, data and .env all resolve as siblings of `appRoot`.
const appRoot = path.join(__dirname, '..');

function startServer() {
  const serverPath = path.join(appRoot, 'server.js');

  // Run the Express server with Electron's bundled Node (ELECTRON_RUN_AS_NODE)
  // so the packaged app does not require a system Node install. The .env next
  // to server.js supplies the API keys; DATA_DIR is a per-user writable dir.
  serverProcess = spawn(process.execPath, [serverPath], {
    cwd: appRoot,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      PORT: String(SERVER_PORT),
      DATA_DIR: path.join(app.getPath('userData'), 'data'),
    },
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
    // Don't hang the launch forever if the server is slow to bind.
    setTimeout(() => { clearInterval(check); resolve(); }, 20000);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'RushilAI',
    // Hidden inset title bar: the OS draws only the traffic lights at the far
    // left, and our MenuBar renders the RushilAI brand + controls on the right.
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 8 },
    backgroundColor: '#0D0D14',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    icon: path.join(appRoot, 'build', 'favicon.svg.png'),
  });

  mainWindow.loadURL(isDev ? 'http://localhost:5190' : `http://localhost:${SERVER_PORT}`);

  // Open external links in the user's browser, never in an app window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(async () => {
  if (!isDev) await startServer();
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
