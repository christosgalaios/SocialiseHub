import { app, BrowserWindow, session, shell, dialog, ipcMain, clipboard } from 'electron';
import { join } from 'path';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import type { Server } from 'http';

const isDev = !app.isPackaged;
const CONFIG_PATH = join(app.getPath('userData'), 'config.json');

// ── Config persistence ──────────────────────────────────

interface AppConfig {
  claudeExtensionPath?: string;
  windowBounds?: { width: number; height: number; x?: number; y?: number };
}

function loadConfig(): AppConfig {
  try {
    if (existsSync(CONFIG_PATH)) {
      return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
    }
  } catch { /* ignore */ }
  return {};
}

function saveConfig(config: AppConfig): void {
  try {
    writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  } catch { /* ignore */ }
}

// ── Express server ──────────────────────────────────────

let server: Server | null = null;
const PORT = 3000;

async function startExpressServer(): Promise<number> {
  // Dynamic import of the ESM Express app from our CJS Electron main
  const { createApp } = await import('../dist/app.js' as string);
  const expressApp = createApp();

  return new Promise((resolve, reject) => {
    server = expressApp.listen(PORT, () => {
      console.log(`SocialiseHub server running on http://localhost:${PORT}`);
      resolve(PORT);
    });
    server!.on('error', reject);
  });
}

// ── Chrome extension loading ────────────────────────────

async function loadChromeExtension(config: AppConfig): Promise<void> {
  const extPath = config.claudeExtensionPath;
  if (!extPath || !existsSync(extPath)) {
    console.log('Claude Chrome extension not configured — using claude.ai directly');
    return;
  }

  try {
    const ext = await session.defaultSession.loadExtension(extPath, {
      allowFileAccess: true,
    });
    console.log(`Loaded Chrome extension: ${ext.name}`);
  } catch (err) {
    console.warn('Failed to load Chrome extension:', err);
  }
}

// ── Window creation ─────────────────────────────────────

function createMainWindow(port: number, config: AppConfig): BrowserWindow {
  const bounds = config.windowBounds ?? { width: 1400, height: 900 };

  const win = new BrowserWindow({
    ...bounds,
    minWidth: 900,
    minHeight: 600,
    title: 'SocialiseHub',
    backgroundColor: '#FAFAF6',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Allow the Claude extension to work
      webviewTag: true,
    },
  });

  // Save window bounds on resize/move
  const saveBounds = () => {
    if (!win.isMinimized()) {
      config.windowBounds = win.getBounds();
      saveConfig(config);
    }
  };
  win.on('resize', saveBounds);
  win.on('move', saveBounds);

  // Open external links in the default browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    // Allow OAuth callbacks to load internally
    if (url.startsWith(`http://localhost:${port}`)) {
      return { action: 'allow' };
    }
    // Platform OAuth pages should also open internally so extensions can see them
    if (url.includes('meetup.com') || url.includes('eventbrite.com') || url.includes('headfirstbristol.co.uk')) {
      return { action: 'allow' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Load the app
  if (isDev) {
    // In dev mode, load from Vite dev server
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    // In production, load from Express (which serves built frontend)
    win.loadURL(`http://localhost:${port}`);
  }

  return win;
}

// ── IPC handlers ────────────────────────────────────────

function setupIpcHandlers(): void {
  ipcMain.handle('open-external', async (_event, url: string) => {
    await shell.openExternal(url);
  });

  ipcMain.handle('copy-to-clipboard', (_event, text: string) => {
    clipboard.writeText(text);
  });

  ipcMain.handle('get-version', () => {
    return app.getVersion();
  });
}

// ── App lifecycle ───────────────────────────────────────

app.whenReady().then(async () => {
  const config = loadConfig();

  // Set up IPC handlers before creating windows
  setupIpcHandlers();

  try {
    // Start Express server
    const port = await startExpressServer();

    // Load Claude Chrome extension (if configured)
    await loadChromeExtension(config);

    // Create the main window
    const win = createMainWindow(port, config);

    // On macOS, re-create window when dock icon clicked
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow(port, config);
      }
    });
  } catch (err) {
    console.error('Failed to start SocialiseHub:', err);
    dialog.showErrorBox(
      'SocialiseHub — Startup Error',
      `Failed to start the application:\n\n${err instanceof Error ? err.message : String(err)}`,
    );
    app.quit();
  }
});

app.on('window-all-closed', () => {
  // On macOS, keep the app running until explicitly quit
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (server) {
    server.close();
    server = null;
  }
});
