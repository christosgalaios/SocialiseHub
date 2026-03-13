import { contextBridge, ipcRenderer } from 'electron';

/**
 * Preload script — exposes a safe API to the renderer (React app).
 * The React app can check `window.electronAPI` to detect Electron features.
 */
contextBridge.exposeInMainWorld('electronAPI', {
  /** Whether we're running inside Electron */
  isElectron: true,

  /** Open a URL in the system default browser (for OAuth) */
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),

  /** Copy text to the system clipboard */
  copyToClipboard: (text: string) => ipcRenderer.invoke('copy-to-clipboard', text),

  /** Get app version */
  getVersion: () => ipcRenderer.invoke('get-version'),

  // ── Claude panel ──

  /** Toggle the Claude side panel (show/hide). Returns new state. */
  toggleClaudePanel: () => ipcRenderer.invoke('toggle-claude-panel'),

  /** Show and focus the Claude side panel */
  focusClaudePanel: () => ipcRenderer.invoke('focus-claude-panel'),

  /** Check whether the Claude panel is currently open */
  isClaudePanelOpen: () => ipcRenderer.invoke('get-claude-panel-state'),

  /** Get the current Claude panel width */
  getClaudePanelWidth: () => ipcRenderer.invoke('get-claude-panel-width'),

  /** Resize the Claude panel (returns clamped width) */
  resizeClaudePanel: (width: number) => ipcRenderer.invoke('resize-claude-panel', width),

  /** Get Claude extension loading status (loaded, error, diagnosis, fix) */
  getExtensionStatus: () => ipcRenderer.invoke('get-extension-status'),

  // ── Terminal (PTY) ──

  /** Spawn a new terminal shell process */
  terminalCreate: () => ipcRenderer.invoke('terminal-create'),

  /** Send keyboard input to the terminal */
  terminalInput: (data: string) => ipcRenderer.send('terminal-input', data),

  /** Resize the terminal grid */
  terminalResize: (cols: number, rows: number) => ipcRenderer.invoke('terminal-resize', cols, rows),

  /** Kill the terminal process */
  terminalDestroy: () => ipcRenderer.invoke('terminal-destroy'),

  /** Subscribe to terminal output data. Returns cleanup function. */
  onTerminalData: (callback: (data: string) => void) => {
    const handler = (_event: unknown, data: string) => callback(data);
    ipcRenderer.on('terminal-data', handler);
    return () => { ipcRenderer.removeListener('terminal-data', handler); };
  },

  /** Subscribe to terminal exit events. Returns cleanup function. */
  onTerminalExit: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('terminal-exit', handler);
    return () => { ipcRenderer.removeListener('terminal-exit', handler); };
  },

  // ── JS execution ──

  /** Execute JavaScript in the app view context (for controlling the app) */
  executeInApp: (code: string) => ipcRenderer.invoke('execute-in-app', code),

  /** Execute JavaScript in the Claude panel (for DOM interaction) */
  executeInClaudePanel: (code: string) => ipcRenderer.invoke('execute-in-claude-panel', code),

  /**
   * Send a prompt to Claude and wait for the response.
   * Opens the Claude panel if needed, types the prompt, clicks send,
   * and polls until Claude finishes generating.
   * Returns { response: string } on success or { error: string } on failure.
   */
  sendPromptToClaude: (prompt: string) => ipcRenderer.invoke('claude-send-prompt', prompt),

  // ── Browser Automation ──

  /** Start a browser automation task (connect, publish, scrape) */
  startAutomation: (request: { platform: string; action: string; data?: unknown; externalId?: string }) =>
    ipcRenderer.invoke('automation:start', request),

  /** Cancel the currently running automation task */
  cancelAutomation: () => ipcRenderer.invoke('automation:cancel'),

  /** Resume automation after user intervention (login, CAPTCHA) */
  resumeAutomation: () => ipcRenderer.invoke('automation:resume'),

  /** Subscribe to automation status updates. Returns cleanup function. */
  onAutomationStatus: (callback: (status: { step: number; totalSteps: number; description: string; state: string }) => void) => {
    const handler = (_event: unknown, status: { step: number; totalSteps: number; description: string; state: string }) => callback(status);
    ipcRenderer.on('automation:status', handler);
    return () => { ipcRenderer.removeListener('automation:status', handler); };
  },

  /** Subscribe to automation result events. Returns cleanup function. */
  onAutomationResult: (callback: (result: { success: boolean; error?: string; data?: unknown }) => void) => {
    const handler = (_event: unknown, result: { success: boolean; error?: string; data?: unknown }) => callback(result);
    ipcRenderer.on('automation:result', handler);
    return () => { ipcRenderer.removeListener('automation:result', handler); };
  },
});
