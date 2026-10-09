const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const userDataDir = app.getPath('userData');
const portFilePath = path.join(userDataDir, '.port');
const dbPath = path.join(userDataDir, 'sistema_contable.db');
const preferredPort = Number.parseInt(process.env.PORT || '', 10) || 3000;

process.env.PORT = String(preferredPort);
process.env.PORT_FILE = portFilePath;
process.env.SQLITE_DB_PATH = dbPath;

let mainWindow;
let backendServer;

function readPortFromFile() {
  try {
    if (fs.existsSync(portFilePath)) {
      const value = fs.readFileSync(portFilePath, 'utf8').trim();
      const port = Number.parseInt(value, 10);
      if (Number.isInteger(port) && port > 0) return port;
    }
  } catch (error) {
    // Se reutiliza el puerto preferido si no existe el archivo temporal.
  }

  return preferredPort;
}

async function startBackend() {
  const { startServer } = require('../server/index.js');
  const started = await startServer({ port: preferredPort, host: '127.0.0.1' });
  backendServer = started.server;
  return started.port;
}

async function waitForBackend() {
  const maxIntentos = 80;

  for (let intento = 0; intento < maxIntentos; intento += 1) {
    const port = readPortFromFile();
    try {
      const respuesta = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (respuesta.ok) return port;
    } catch (error) {
      // Espera de arranque del backend local.
    }

    await new Promise(resolve => setTimeout(resolve, 250));
  }

  throw new Error(`No se pudo conectar con el backend en http://127.0.0.1:${preferredPort}`);
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 980,
    minWidth: 1200,
    minHeight: 760,
    title: 'Sistema Contable',
    backgroundColor: '#101827',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const port = await startBackend();
  await mainWindow.loadURL(`http://127.0.0.1:${port}`);
  mainWindow.setMenuBarVisibility(false);
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.sistemacontable.desktop');
  createWindow().catch(error => {
    console.error('No se pudo abrir la ventana de Electron:', error);
    app.quit();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (backendServer && typeof backendServer.close === 'function') {
    backendServer.close();
  }

  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (backendServer && typeof backendServer.close === 'function') {
    backendServer.close();
  }
});
