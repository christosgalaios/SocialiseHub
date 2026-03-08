import { app, BaseWindow, WebContentsView, session, shell, dialog, ipcMain, clipboard } from 'electron';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import type { Server } from 'node:http';

// node-pty is a native CJS module — use createRequire for reliable ESM import
const require = createRequire(import.meta.url);
const pty = require('node-pty') as typeof import('node-pty');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const isDev = !!process.env.ELECTRON_DEV;
const CONFIG_PATH = join(app.getPath('userData'), 'config.json');

// Claude Chrome extension ID on the Chrome Web Store
const CLAUDE_EXTENSION_ID = 'fcoeoabgfenejglbffodgkkbkcdhcgfn';

// Default Claude side panel width in pixels
const DEFAULT_PANEL_WIDTH = 420;

// ── Config persistence ──────────────────────────────────

interface AppConfig {
  claudeExtensionPath?: string;
  windowBounds?: { width: number; height: number; x?: number; y?: number };
  claudePanelOpen?: boolean;
  claudePanelWidth?: number;
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
  // Dynamic import of the ESM Express app
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

// ── Chrome extension auto-detection ─────────────────────

/**
 * Finds the Claude Chrome extension on the user's system.
 * Checks Chrome's default extension directory on Windows, macOS, and Linux.
 * Returns the path to the latest version, or null if not found.
 */
function findChromeExtension(): string | null {
  const home = homedir();

  // Platform-specific Chrome extension paths
  const chromePaths: string[] = [];
  if (process.platform === 'win32') {
    chromePaths.push(
      join(home, 'AppData', 'Local', 'Google', 'Chrome', 'User Data', 'Default', 'Extensions', CLAUDE_EXTENSION_ID),
      join(home, 'AppData', 'Local', 'Google', 'Chrome', 'User Data', 'Profile 1', 'Extensions', CLAUDE_EXTENSION_ID),
    );
  } else if (process.platform === 'darwin') {
    chromePaths.push(
      join(home, 'Library', 'Application Support', 'Google', 'Chrome', 'Default', 'Extensions', CLAUDE_EXTENSION_ID),
      join(home, 'Library', 'Application Support', 'Google', 'Chrome', 'Profile 1', 'Extensions', CLAUDE_EXTENSION_ID),
    );
  } else {
    chromePaths.push(
      join(home, '.config', 'google-chrome', 'Default', 'Extensions', CLAUDE_EXTENSION_ID),
      join(home, '.config', 'google-chrome', 'Profile 1', 'Extensions', CLAUDE_EXTENSION_ID),
    );
  }

  for (const extDir of chromePaths) {
    if (!existsSync(extDir)) continue;

    try {
      // Extension directory contains version subdirectories (e.g., "1.0.0_0")
      const versions = readdirSync(extDir)
        .filter((v) => !v.startsWith('.'))
        .sort()
        .reverse(); // Latest version first

      if (versions.length > 0) {
        const versionPath = join(extDir, versions[0]);
        // Verify it has a manifest.json
        if (existsSync(join(versionPath, 'manifest.json'))) {
          return versionPath;
        }
      }
    } catch { /* ignore */ }
  }

  return null;
}

// ── Extension loading ──────────────────────────────────

let loadedExtensionId: string | null = null;

/**
 * Loads the Claude Chrome extension into Electron's session.
 *
 * Priority:
 * 1. Manually configured path (from config)
 * 2. Auto-detected from Chrome installation
 * 3. No extension (graceful fallback)
 */
async function loadChromeExtension(config: AppConfig): Promise<boolean> {
  // Try configured path first
  let extPath = config.claudeExtensionPath;
  if (extPath && existsSync(extPath) && existsSync(join(extPath, 'manifest.json'))) {
    console.log(`Using configured extension path: ${extPath}`);
  } else {
    // Auto-detect from Chrome installation
    extPath = findChromeExtension() ?? undefined;
    if (extPath) {
      console.log(`Auto-detected Claude extension at: ${extPath}`);
      // Save for future launches
      config.claudeExtensionPath = extPath;
      saveConfig(config);
    }
  }

  if (!extPath) {
    console.log('Claude Chrome extension not found — install it in Chrome first');
    return false;
  }

  try {
    const ses = session.defaultSession;
    // Use the newer extensions API (loadExtension on session is deprecated)
    const loader = (ses as any).extensions?.loadExtension?.bind(ses.extensions)
      ?? ses.loadExtension.bind(ses);
    const ext = await loader(extPath, { allowFileAccess: true });
    loadedExtensionId = ext.id;
    console.log(`Loaded Chrome extension: ${ext.name} (${ext.version}) [${ext.id}]`);
    return true;
  } catch (err) {
    console.warn('Failed to load Chrome extension:', err);
    // Clear the saved path so we retry detection next launch
    config.claudeExtensionPath = undefined;
    saveConfig(config);
    return false;
  }
}

// ── Window state ────────────────────────────────────────

let mainWindow: BaseWindow | null = null;
let appView: WebContentsView | null = null;
let claudeView: WebContentsView | null = null;
let claudePanelOpen = true;
let claudeViewAttached = false;
// eslint-disable-next-line prefer-const -- reassigned in terminal handlers
let ptyProcess: ReturnType<typeof pty.spawn> | null = null;

// ── Layout management ───────────────────────────────────

/**
 * Lays out the app view and Claude panel within the BaseWindow.
 * When the panel is open, the app takes (width - panelWidth) and Claude takes panelWidth.
 * When hidden, the app takes full width and the Claude view is detached (but stays alive).
 */
function layoutViews(win: BaseWindow, panelWidth: number): void {
  if (!appView || !claudeView) return;

  const { width, height } = win.getContentBounds();

  if (claudePanelOpen) {
    const appWidth = Math.max(400, width - panelWidth);
    const actualPanelWidth = width - appWidth;
    appView.setBounds({ x: 0, y: 0, width: appWidth, height });
    claudeView.setBounds({ x: appWidth, y: 0, width: actualPanelWidth, height });

    if (!claudeViewAttached) {
      win.contentView.addChildView(claudeView);
      claudeViewAttached = true;
    }
  } else {
    appView.setBounds({ x: 0, y: 0, width, height });

    if (claudeViewAttached) {
      win.contentView.removeChildView(claudeView);
      claudeViewAttached = false;
    }
  }
}

function togglePanel(config: AppConfig): boolean {
  if (!mainWindow) return false;

  claudePanelOpen = !claudePanelOpen;
  config.claudePanelOpen = claudePanelOpen;
  saveConfig(config);

  layoutViews(mainWindow, config.claudePanelWidth ?? DEFAULT_PANEL_WIDTH);
  return claudePanelOpen;
}

function focusPanel(config: AppConfig): void {
  if (!mainWindow || !claudeView) return;

  if (!claudePanelOpen) {
    claudePanelOpen = true;
    config.claudePanelOpen = true;
    saveConfig(config);
    layoutViews(mainWindow, config.claudePanelWidth ?? DEFAULT_PANEL_WIDTH);
  }

  claudeView.webContents.focus();
}

// ── Window creation ─────────────────────────────────────

function createMainWindow(port: number, config: AppConfig, hasExtension: boolean): BaseWindow {
  const bounds = config.windowBounds ?? { width: 1400, height: 900 };
  claudePanelOpen = config.claudePanelOpen ?? true;
  const panelWidth = config.claudePanelWidth ?? DEFAULT_PANEL_WIDTH;

  const win = new BaseWindow({
    ...bounds,
    minWidth: 900,
    minHeight: 600,
    title: 'SocialiseHub',
  });

  mainWindow = win;

  // ── App View (left panel — the SocialiseHub React app) ──
  appView = new WebContentsView({
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  });

  // ── Claude View (right panel — claude.ai chat) ──
  claudeView = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Add app view (always visible)
  win.contentView.addChildView(appView);

  // Set initial layout (adds claudeView if panel is open)
  layoutViews(win, panelWidth);

  // Handle window resize — recalculate layout
  win.on('resize', () => {
    layoutViews(win, config.claudePanelWidth ?? DEFAULT_PANEL_WIDTH);
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

  // ── App View: external link handling ──
  appView.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(`http://localhost:${port}`)) {
      return { action: 'allow' };
    }
    if (url.includes('meetup.com') || url.includes('eventbrite.com') || url.includes('headfirstbristol.co.uk')) {
      return { action: 'allow' };
    }
    if (url.includes('claude.ai')) {
      return { action: 'allow' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // ── Claude View: keep auth flows in-panel, open other links externally ──
  claudeView.webContents.setWindowOpenHandler(({ url }) => {
    if (
      url.includes('claude.ai') ||
      url.includes('anthropic.com') ||
      url.includes('accounts.google.com') ||
      url.includes('appleid.apple.com') ||
      url.includes('login.microsoftonline.com')
    ) {
      return { action: 'allow' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Load the SocialiseHub app
  if (isDev) {
    appView.webContents.loadURL('http://localhost:5173');
    appView.webContents.openDevTools({ mode: 'detach' });
  } else {
    appView.webContents.loadURL(`http://localhost:${port}`);
  }

  // Load Claude panel — always use claude.ai for maximum reliability.
  // The extension's content scripts inject into appView for DOM access,
  // while claude.ai in the right panel provides the chat interface.
  claudeView.webContents.loadURL('https://claude.ai/new');
  console.log('Claude panel: loading claude.ai');

  // Log extension status once app is loaded
  appView.webContents.on('did-finish-load', () => {
    if (hasExtension) {
      console.log('Claude extension content scripts injected into app view');
    } else {
      console.log(
        '\n  ⚠ Claude Chrome extension not loaded.\n' +
        '  Install it in Chrome first: https://chromewebstore.google.com/detail/claude/fcoeoabgfenejglbffodgkkbkcdhcgfn\n' +
        '  Then restart SocialiseHub — it will be detected automatically.\n',
      );
    }
  });

  // Cleanup on window close
  win.on('closed', () => {
    appView = null;
    claudeView = null;
    mainWindow = null;
    claudeViewAttached = false;
  });

  return win;
}

// ── IPC handlers ────────────────────────────────────────

function setupIpcHandlers(config: AppConfig): void {
  ipcMain.handle('open-external', async (_event, url: string) => {
    await shell.openExternal(url);
  });

  ipcMain.handle('copy-to-clipboard', (_event, text: string) => {
    clipboard.writeText(text);
  });

  ipcMain.handle('get-version', () => {
    return app.getVersion();
  });

  // Claude panel controls
  ipcMain.handle('toggle-claude-panel', () => {
    return togglePanel(config);
  });

  ipcMain.handle('focus-claude-panel', () => {
    focusPanel(config);
  });

  ipcMain.handle('get-claude-panel-state', () => {
    return claudePanelOpen;
  });

  ipcMain.handle('get-claude-panel-width', () => {
    return config.claudePanelWidth ?? DEFAULT_PANEL_WIDTH;
  });

  ipcMain.handle('resize-claude-panel', (_event, width: number) => {
    if (!mainWindow) return;
    const bounds = mainWindow.getContentBounds();
    // Clamp: min 280px, max 70% of window width
    const clamped = Math.max(280, Math.min(width, Math.floor(bounds.width * 0.7)));
    config.claudePanelWidth = clamped;
    saveConfig(config);
    layoutViews(mainWindow, clamped);
    return clamped;
  });

  // ── Terminal (PTY) handlers ──

  ipcMain.handle('terminal-create', () => {
    if (ptyProcess) {
      ptyProcess.kill();
      ptyProcess = null;
    }

    const shellCmd = process.platform === 'win32' ? 'powershell.exe' : 'bash';
    ptyProcess = pty.spawn(shellCmd, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: process.cwd(),
      env: process.env as Record<string, string>,
    });

    ptyProcess.onData((data: string) => {
      appView?.webContents.send('terminal-data', data);
    });

    ptyProcess.onExit(() => {
      appView?.webContents.send('terminal-exit');
      ptyProcess = null;
    });
  });

  ipcMain.on('terminal-input', (_event, data: string) => {
    ptyProcess?.write(data);
  });

  ipcMain.handle('terminal-resize', (_event, cols: number, rows: number) => {
    ptyProcess?.resize(cols, rows);
  });

  ipcMain.handle('terminal-destroy', () => {
    ptyProcess?.kill();
    ptyProcess = null;
  });

  // ── Execute JavaScript in the app view ──

  ipcMain.handle('execute-in-app', async (_event, code: string) => {
    if (!appView) return { error: 'App view not available' };
    try {
      const result = await appView.webContents.executeJavaScript(code);
      return { result: result !== undefined ? String(result) : 'undefined' };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });
}

// ── App lifecycle ───────────────────────────────────────

app.whenReady().then(async () => {
  const config = loadConfig();

  setupIpcHandlers(config);

  try {
    const port = await startExpressServer();

    // Load Claude extension (auto-detect from Chrome, or use saved path)
    const hasExtension = await loadChromeExtension(config);

    createMainWindow(port, config, hasExtension);

    app.on('activate', () => {
      if (!mainWindow) {
        createMainWindow(port, config, hasExtension);
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
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (ptyProcess) {
    ptyProcess.kill();
    ptyProcess = null;
  }
  if (server) {
    server.close();
    server = null;
  }
});
