const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,

  // Window management
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  hideWindow: () => ipcRenderer.send('window-hide'),
  closeWindow: () => ipcRenderer.send('window-close'),
  setAlwaysOnTop: (alwaysOnTop) => ipcRenderer.send('window-set-always-on-top', alwaysOnTop),
  setOpacity: (opacity) => ipcRenderer.send('window-set-opacity', opacity),
  resizeWindow: (width, height) => ipcRenderer.send('window-resize', { width, height }),

  // Shortcuts & Tray
  registerGlobalShortcut: (acceleratorOrConfig) => ipcRenderer.invoke('register-global-shortcut', acceleratorOrConfig),
  onGlobalShortcutTriggered: (callback) => {
    ipcRenderer.on('shortcut-toggle-recording', () => callback('toggle-recording'));
    ipcRenderer.on('shortcut-toggle-window', () => callback('toggle-window'));
  },
  onTrayAction: (callback) => {
    ipcRenderer.on('tray-action', (event, action) => callback(action));
  },

  // Clipboard & Direct Input
  copyToClipboard: (text) => ipcRenderer.invoke('copy-to-clipboard', text),
  pasteToActiveWindow: (text) => ipcRenderer.invoke('paste-to-active-window', text),
  readClipboard: () => ipcRenderer.invoke('read-clipboard'),

  // Config sync
  saveConfigBackup: (config) => ipcRenderer.invoke('save-config-backup', config),
  loadConfigBackup: () => ipcRenderer.invoke('load-config-backup')
});
