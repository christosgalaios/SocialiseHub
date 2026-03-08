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

  // ── JS execution in app view ──

  /** Execute JavaScript in the app view context (for controlling the app) */
  executeInApp: (code: string) => ipcRenderer.invoke('execute-in-app', code),
});
