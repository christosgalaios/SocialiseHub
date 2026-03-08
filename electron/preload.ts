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

  /** Toggle the Claude side panel (show/hide). Returns new state. */
  toggleClaudePanel: () => ipcRenderer.invoke('toggle-claude-panel'),

  /** Show and focus the Claude side panel */
  focusClaudePanel: () => ipcRenderer.invoke('focus-claude-panel'),

  /** Check whether the Claude panel is currently open */
  isClaudePanelOpen: () => ipcRenderer.invoke('get-claude-panel-state'),
});
