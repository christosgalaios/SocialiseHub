import { app, BaseWindow, WebContentsView, session, shell, dialog, ipcMain, clipboard } from 'electron';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import type { Server } from 'node:http';
import { importChromeCookies } from './chrome-cookies.js';

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

interface ExtensionStatus {
  loaded: boolean;
  error?: string;
  diagnosis?: string;
  fix?: string;
  extensionPath?: string;
}

let extensionStatus: ExtensionStatus = { loaded: false };

/**
 * Loads the Claude Chrome extension into Electron's session.
 *
 * Priority:
 * 1. Manually configured path (from config)
 * 2. Auto-detected from Chrome installation
 * 3. No extension (graceful fallback with diagnostic info)
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
    extensionStatus = {
      loaded: false,
      error: 'Claude Chrome extension not found on this system.',
      diagnosis: 'The extension is not installed in Chrome, or Chrome is using a non-default profile path.',
      fix: 'Install the Claude extension in Chrome:\n'
        + '1. Open Chrome and go to: https://chromewebstore.google.com/detail/claude/fcoeoabgfenejglbffodgkkbkcdhcgfn\n'
        + '2. Click "Add to Chrome"\n'
        + '3. Restart SocialiseHub — it will be detected automatically.',
    };
    console.log(`Extension status: ${extensionStatus.error}`);
    return false;
  }

  try {
    const ses = session.defaultSession;
    // Use the newer extensions API (loadExtension on session is deprecated)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Electron types don't expose session.extensions yet
    const loader = (ses as any).extensions?.loadExtension?.bind(ses.extensions)
      ?? ses.loadExtension.bind(ses);
    const ext = await loader(extPath, { allowFileAccess: true });
    extensionStatus = { loaded: true, extensionPath: extPath };
    console.log(`Loaded Chrome extension: ${ext.name} (${ext.version}) [${ext.id}]`);
    return true;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    extensionStatus = {
      loaded: false,
      error: `Extension found at ${extPath} but failed to load.`,
      extensionPath: extPath,
      diagnosis: `Load error: ${errMsg}`,
      fix: errMsg.includes('manifest')
        ? 'The extension manifest is invalid or incompatible with this Electron version.\n'
          + 'Try updating Chrome to get the latest extension version, then restart SocialiseHub.'
        : errMsg.includes('version')
          ? 'The extension version is incompatible with this Electron version.\n'
            + 'Update both Chrome and SocialiseHub to their latest versions.'
          : 'Try these steps:\n'
            + '1. Update Chrome to the latest version\n'
            + '2. Make sure the Claude extension is enabled in Chrome (chrome://extensions)\n'
            + '3. Close Chrome completely\n'
            + '4. Restart SocialiseHub',
    };
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
let ptyProcess: ReturnType<typeof pty.spawn> | null = null;
let automationView: WebContentsView | null = null;
let automationViewAttached = false;

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

  // If automation view is showing, re-layout it too
  if (automationViewAttached && automationView) {
    const appWidth = Math.max(400, width - panelWidth);
    const actualPanelWidth = width - appWidth;
    appView?.setBounds({ x: 0, y: 0, width: appWidth, height });
    automationView.setBounds({ x: appWidth, y: 0, width: actualPanelWidth, height });
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

function showAutomationView(win: BaseWindow, panelWidth: number): void {
  if (!automationView || automationViewAttached) return;
  // Hide Claude panel if open
  if (claudePanelOpen && claudeView && claudeViewAttached) {
    win.contentView.removeChildView(claudeView);
    claudeViewAttached = false;
  }
  win.contentView.addChildView(automationView);
  automationViewAttached = true;
  const { width, height } = win.getContentBounds();
  const appWidth = Math.max(400, width - panelWidth);
  const actualPanelWidth = width - appWidth;
  appView?.setBounds({ x: 0, y: 0, width: appWidth, height });
  automationView.setBounds({ x: appWidth, y: 0, width: actualPanelWidth, height });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- used in Task 14
function hideAutomationView(win: BaseWindow, config: AppConfig): void {
  if (!automationView || !automationViewAttached) return;
  win.contentView.removeChildView(automationView);
  automationViewAttached = false;
  // Restore layout (brings Claude panel back if it was open)
  layoutViews(win, config.claudePanelWidth ?? DEFAULT_PANEL_WIDTH);
}

// ── Window creation ─────────────────────────────────────

async function createMainWindow(port: number, config: AppConfig, hasExtension: boolean): Promise<BaseWindow> {
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

  // ── Automation View (right panel — platform websites during automation) ──
  const automationSession = session.fromPartition('persist:automation');
  automationView = new WebContentsView({
    webPreferences: {
      session: automationSession,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  // Set a standard Chrome user-agent to avoid bot detection
  automationView.webContents.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
  );

  // Import cookies from Chrome into the automation session (awaited so cookies
  // are ready before user clicks Connect)
  try {
    const { imported, error } = await importChromeCookies(automationSession);
    if (error) console.warn(`[chrome-cookies] ${error}`);
    if (imported > 0) console.log(`[chrome-cookies] Imported ${imported} cookies from Chrome`);
    else console.log(`[chrome-cookies] No cookies imported (${error ?? 'no matching cookies found'})`);
  } catch (err) {
    console.warn('[chrome-cookies] Import failed:', err);
  }

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
      console.log(`\n  ⚠ ${extensionStatus.error ?? 'Claude Chrome extension not loaded.'}`);
      if (extensionStatus.diagnosis) console.log(`  Diagnosis: ${extensionStatus.diagnosis}`);
      if (extensionStatus.fix) console.log(`  Fix:\n  ${extensionStatus.fix.replace(/\n/g, '\n  ')}`);
    }
  });

  // Cleanup on window close
  win.on('closed', () => {
    appView = null;
    claudeView = null;
    automationView = null;
    mainWindow = null;
    claudeViewAttached = false;
    automationViewAttached = false;
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

  ipcMain.handle('get-extension-status', () => {
    return extensionStatus;
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

  // ── Execute JavaScript in the Claude panel ──
  // SECURITY: This runs arbitrary JS in the Claude panel context (claude.ai session).
  // Only called from the preload bridge — never pass user-controlled strings as code.

  ipcMain.handle('execute-in-claude-panel', async (_event, code: string) => {
    if (!claudeView) return { error: 'Claude panel not available' };
    try {
      const result = await claudeView.webContents.executeJavaScript(code);
      return { result: result !== undefined ? String(result) : 'undefined' };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  // ── Send prompt to Claude and wait for response ──

  ipcMain.handle('claude-send-prompt', async (_event, prompt: string) => {
    if (!claudeView) return { error: 'Claude panel not available' };
    if (!mainWindow) return { error: 'Main window not available' };

    const wc = claudeView.webContents;

    // Ensure panel is open
    if (!claudePanelOpen) {
      claudePanelOpen = true;
      const panelWidth = config.claudePanelWidth ?? DEFAULT_PANEL_WIDTH;
      mainWindow.contentView.addChildView(claudeView);
      layoutViews(mainWindow, panelWidth);
    }

    try {
      // Step 1: Navigate to a new chat if needed, then find the input
      const inputResult = await wc.executeJavaScript(`
        (async () => {
          // Wait for the input area to be ready
          const maxWait = 15000;
          const start = Date.now();
          while (Date.now() - start < maxWait) {
            // Claude.ai uses a contenteditable div or ProseMirror editor
            const editor = document.querySelector('[contenteditable="true"]')
              || document.querySelector('.ProseMirror')
              || document.querySelector('textarea');
            if (editor) return 'ready';
            await new Promise(r => setTimeout(r, 500));
          }
          return 'not-found';
        })()
      `);

      if (inputResult !== 'ready') {
        return { error: 'Could not find Claude input field — is claude.ai loaded?' };
      }

      // Step 2: Paste prompt into the editor
      // Uses Electron's clipboard API + webContents.paste() which is the most
      // reliable method — works without window focus, goes through ProseMirror's
      // native paste handler. sendInputEvent has known issues on Windows and
      // requires the window to be focused.
      const { clipboard } = await import('electron');
      const previousClipboard = clipboard.readText();
      clipboard.writeText(prompt);

      // Focus the editor first
      await wc.executeJavaScript(`
        (() => {
          const editor = document.querySelector('[contenteditable="true"]')
            || document.querySelector('.ProseMirror')
            || document.querySelector('textarea');
          if (!editor) return 'no-editor';
          editor.focus();
          return 'focused';
        })()
      `);

      // Use webContents.paste() — direct Electron API, no keyboard simulation needed
      wc.paste();

      // Wait for paste to register in the editor
      await new Promise(r => setTimeout(r, 1000));

      // Restore previous clipboard content
      clipboard.writeText(previousClipboard);

      // Step 3: Click the send button
      // Claude.ai selectors verified 2026-03-13 — may need updating when UI changes
      const sendResult = await wc.executeJavaScript(`
        (() => {
          // Try multiple selectors for the send button
          const btn = document.querySelector('button[aria-label="Send message"]')
            || document.querySelector('button[aria-label="Send Message"]')
            || document.querySelector('button[data-testid="send-button"]')
            || document.querySelector('fieldset button:not([disabled])')
            || [...document.querySelectorAll('button')].find(b => {
              const svg = b.querySelector('svg');
              const inForm = b.closest('fieldset, form, [role="presentation"]');
              return svg && inForm && !b.disabled;
            });
          if (btn) {
            btn.click();
            return 'clicked';
          }
          return 'no-button';
        })()
      `);

      // If button click failed, try Enter key as fallback
      if (sendResult === 'no-button') {
        await wc.executeJavaScript(\`
          (() => {
            const editor = document.querySelector('[contenteditable="true"]')
              || document.querySelector('.ProseMirror');
            if (editor) {
              editor.dispatchEvent(new KeyboardEvent('keydown', {
                key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true
              }));
            }
          })()
        \`);
      }

      // Step 4: Poll for the response to complete
      // We wait for Claude to finish generating (streaming indicator disappears)
      const pollResult = await wc.executeJavaScript(`
        (async () => {
          const maxWait = 300000; // 5 min max
          const pollInterval = 2000;
          const start = Date.now();

          // Wait a bit for response to start
          await new Promise(r => setTimeout(r, 3000));

          while (Date.now() - start < maxWait) {
            // Check if Claude is still generating
            const stopBtn = document.querySelector('button[aria-label="Stop generating"]')
              || document.querySelector('button[aria-label="Stop Response"]')
              || document.querySelector('[data-testid="stop-button"]');

            if (!stopBtn) {
              // Not generating — check if there's a response
              await new Promise(r => setTimeout(r, 1000));

              // Get the last assistant message
              const messages = document.querySelectorAll('[data-message-author-role="assistant"], .font-claude-message, [class*="agent-turn"]');
              if (messages.length > 0) {
                const last = messages[messages.length - 1];
                const text = last.innerText || last.textContent || '';
                if (text.trim().length > 0) {
                  return JSON.stringify({ done: true, response: text.trim() });
                }
              }

              // Alternative: look for markdown content blocks
              const codeBlocks = document.querySelectorAll('[class*="message"] [class*="markdown"], [class*="response"]');
              if (codeBlocks.length > 0) {
                const last = codeBlocks[codeBlocks.length - 1];
                const text = last.innerText || last.textContent || '';
                if (text.trim().length > 0) {
                  return JSON.stringify({ done: true, response: text.trim() });
                }
              }
            }

            await new Promise(r => setTimeout(r, pollInterval));
          }

          return JSON.stringify({ done: false, error: 'Timed out waiting for Claude response' });
        })()
      `);

      const parsed = JSON.parse(pollResult);
      if (parsed.done) {
        return { response: parsed.response };
      }
      return { error: parsed.error || 'Unknown error waiting for response' };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  // ── Browser Automation handlers ──

  let currentEngine: InstanceType<typeof import('../dist/automation/engine.js').AutomationEngine> | null = null;

  ipcMain.handle('automation:start', async (_event, request) => {
    if (!mainWindow || !automationView) return;

    const panelWidth = config.claudePanelWidth ?? DEFAULT_PANEL_WIDTH;
    showAutomationView(mainWindow, panelWidth);

    try {
      const { meetupConnectSteps, meetupPublishSteps, meetupScrapeSteps } = await import('../dist/automation/meetup.js');
      const { eventbriteConnectSteps, eventbritePublishSteps, eventbriteScrapeSteps } = await import('../dist/automation/eventbrite.js');
      const { headfirstConnectSteps, headfirstPublishSteps, headfirstScrapeSteps } = await import('../dist/automation/headfirst.js');

      type StepFn = () => import('../dist/automation/types.js').AutomationStep[];
      const dispatch: Record<string, Record<string, StepFn | undefined>> = {
        meetup: {
          connect: () => meetupConnectSteps(),
          publish: () => meetupPublishSteps(request.data, request.data?.groupUrlname ?? '', request.data?.draft === true),
          scrape: () => meetupScrapeSteps(request.data?.groupUrlname ?? ''),
        },
        eventbrite: {
          connect: () => eventbriteConnectSteps(),
          publish: () => eventbritePublishSteps(request.data),
          scrape: () => eventbriteScrapeSteps(),
        },
        headfirst: {
          connect: () => headfirstConnectSteps(),
          publish: () => headfirstPublishSteps(request.data),
          scrape: () => headfirstScrapeSteps(),
        },
      };

      const stepFn = dispatch[request.platform]?.[request.action];
      if (!stepFn) {
        appView?.webContents.send('automation:result', { success: false, error: `Unsupported: ${request.platform}/${request.action}` });
        return;
      }

      const steps = stepFn();
      const { AutomationEngine } = await import('../dist/automation/engine.js');
      currentEngine = new AutomationEngine(automationView.webContents as never);

      currentEngine.onStatus((status: { step: number; totalSteps: number; description: string; state: string }) => {
        appView?.webContents.send('automation:status', status);
      });

      const result = await currentEngine.run(steps);
      console.log('[automation] result:', JSON.stringify(result));
      appView?.webContents.send('automation:result', result);
      currentEngine = null;
    } catch (err) {
      appView?.webContents.send('automation:result', { success: false, error: String(err) });
      currentEngine = null;
    }
  });

  ipcMain.handle('automation:cancel', () => {
    currentEngine?.cancel();
    currentEngine = null;
    if (mainWindow) {
      hideAutomationView(mainWindow, config);
    }
  });

  ipcMain.handle('automation:resume', () => {
    // Resume is for future pause/login flow support
  });
}

// ── App lifecycle ───────────────────────────────────────

app.whenReady().then(async () => {
  const config = loadConfig();

  setupIpcHandlers(config);

  try {
    const port = await startExpressServer();

    // ── Internal automation bridge server ──
    // Separate from the main Express server — only listens on 127.0.0.1
    const http = await import('node:http');
    const bridgeServer = http.createServer(async (req, res) => {
      if (req.method === 'POST' && req.url === '/automation/execute') {
        let body = '';
        req.on('data', (chunk: string) => { body += chunk; });
        req.on('end', async () => {
          try {
            const request = JSON.parse(body);
            const { meetupConnectSteps, meetupPublishSteps, meetupScrapeSteps } = await import('../dist/automation/meetup.js');
            const { eventbriteConnectSteps, eventbritePublishSteps, eventbriteScrapeSteps } = await import('../dist/automation/eventbrite.js');
            const { headfirstConnectSteps, headfirstPublishSteps, headfirstScrapeSteps } = await import('../dist/automation/headfirst.js');

            type StepFn = () => import('../dist/automation/types.js').AutomationStep[];
            const dispatch: Record<string, Record<string, StepFn | undefined>> = {
              meetup: {
                connect: () => meetupConnectSteps(),
                publish: () => meetupPublishSteps(request.data, request.data?.groupUrlname ?? '', request.data?.draft === true),
                scrape: () => meetupScrapeSteps(request.data?.groupUrlname ?? ''),
              },
              eventbrite: {
                connect: () => eventbriteConnectSteps(),
                publish: () => eventbritePublishSteps(request.data),
                scrape: () => eventbriteScrapeSteps(),
              },
              headfirst: {
                connect: () => headfirstConnectSteps(),
                publish: () => headfirstPublishSteps(request.data),
                scrape: () => headfirstScrapeSteps(),
              },
            };

            const stepFn = dispatch[request.platform]?.[request.action];
            if (!stepFn) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: `Unsupported: ${request.platform}/${request.action}` }));
              return;
            }

            const steps = stepFn();

            if (!mainWindow || !automationView) {
              res.writeHead(503, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: 'App window not available' }));
              return;
            }

            const config2 = loadConfig();
            const panelWidth = config2.claudePanelWidth ?? DEFAULT_PANEL_WIDTH;
            showAutomationView(mainWindow, panelWidth);

            // Import and create engine from the automation view's webContents
            const { AutomationEngine } = await import('../dist/automation/engine.js');
            const engine = new AutomationEngine(automationView.webContents as never);

            // Forward status updates to the renderer
            engine.onStatus((status: { step: number; totalSteps: number; description: string; state: string }) => {
              appView?.webContents.send('automation:status', status);
            });

            const result = await engine.run(steps);

            // Send result to renderer
            appView?.webContents.send('automation:result', result);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: String(err) }));
          }
        });
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    const { getBridgePort } = await import('../dist/automation/bridge.js' as string);
    bridgeServer.listen(getBridgePort(), '127.0.0.1', () => {
      console.log(`Automation bridge listening on http://127.0.0.1:${getBridgePort()}`);
    });

    // Load Claude extension (auto-detect from Chrome, or use saved path)
    const hasExtension = await loadChromeExtension(config);

    await createMainWindow(port, config, hasExtension);

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
