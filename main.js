const { app, BrowserWindow, ipcMain, globalShortcut, Tray, Menu, nativeImage, clipboard, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile, exec } = require('child_process');

let mainWindow = null;
let tray = null;
let currentShortcut = 'Alt+Space';
let currentRecordShortcut = 'CommandOrControl+Shift+R';
let isQuitting = false;

// Ensure single instance
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function getAppIcon() {
  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  if (fs.existsSync(iconPath)) {
    return nativeImage.createFromPath(iconPath);
  }
  return null;
}

function createWindow() {
  const appIcon = getAppIcon();

  mainWindow = new BrowserWindow({
    width: 380,
    height: 270,
    minWidth: 320,
    minHeight: 180,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    resizable: true,
    skipTaskbar: false,
    show: false,
    icon: appIcon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      backgroundThrottling: false
    }
  });

  // Automatically approve media/microphone permission requests
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media' || permission === 'audio-capture') {
      return callback(true);
    }
    callback(false);
  });

  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    return permission === 'media' || permission === 'audio-capture';
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.setAlwaysOnTop(true, 'floating');

    if (process.env.SMOKE_TEST === 'true') {
      console.log('Smoke test: Window loaded successfully. Quitting.');
      isQuitting = true;
      app.quit();
    }
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'tray-icon.png');
  let icon = null;
  if (fs.existsSync(iconPath)) {
    icon = nativeImage.createFromPath(iconPath);
  }

  tray = new Tray(icon || nativeImage.createEmpty());
  tray.setToolTip('Gemini Live Overlay — Швидка транскрибація');

  const updateContextMenu = () => {
    const isVisible = mainWindow && mainWindow.isVisible();
    const isAlwaysOnTop = mainWindow ? mainWindow.isAlwaysOnTop() : true;

    const contextMenu = Menu.buildFromTemplate([
      {
        label: isVisible ? 'Сховати вікно' : 'Показати віджет',
        click: () => toggleWindowVisibility()
      },
      {
        label: 'Почати / зупинити запис',
        click: () => {
          if (mainWindow) {
            mainWindow.webContents.send('tray-action', 'toggle-recording');
          }
        }
      },
      {
        type: 'separator'
      },
      {
        label: 'Завжди зверху',
        type: 'checkbox',
        checked: isAlwaysOnTop,
        click: (item) => {
          if (mainWindow) {
            mainWindow.setAlwaysOnTop(item.checked, 'floating');
          }
        }
      },
      {
        label: 'Налаштування',
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
            mainWindow.webContents.send('tray-action', 'open-settings');
          }
        }
      },
      {
        type: 'separator'
      },
      {
        label: 'Вийти з Gemini Live',
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ]);

    tray.setContextMenu(contextMenu);
  };

  tray.on('click', () => {
    toggleWindowVisibility();
  });

  tray.on('right-click', () => {
    updateContextMenu();
  });

  updateContextMenu();
}

function toggleWindowVisibility() {
  if (!mainWindow) return;
  if (mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    mainWindow.show();
    mainWindow.focus();
  }
}

function registerShortcuts(options) {
  globalShortcut.unregisterAll();

  let winKey = currentShortcut;
  let recKey = currentRecordShortcut;

  if (typeof options === 'string') {
    winKey = options;
  } else if (options && typeof options === 'object') {
    if (options.toggleWindowHotkey) winKey = options.toggleWindowHotkey;
    if (options.recordHotkey) recKey = options.recordHotkey;
  }

  // Register show/hide toggle shortcut
  if (winKey) {
    try {
      const ok = globalShortcut.register(winKey, () => {
        toggleWindowVisibility();
      });
      if (ok) {
        currentShortcut = winKey;
      }
    } catch (err) {
      console.warn(`Failed to register global shortcut ${winKey}:`, err);
    }
  }

  // Register toggle recording shortcut
  if (recKey) {
    try {
      const ok = globalShortcut.register(recKey, () => {
        if (mainWindow) {
          mainWindow.webContents.send('shortcut-toggle-recording');
        }
      });
      if (ok) {
        currentRecordShortcut = recKey;
      }
    } catch (err) {
      console.warn(`Failed to register record shortcut ${recKey}:`, err);
    }
  }
}

// IPC Handlers
ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-hide', () => {
  if (mainWindow) mainWindow.hide();
});

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.hide();
});

ipcMain.on('window-set-always-on-top', (event, alwaysOnTop) => {
  if (mainWindow) {
    mainWindow.setAlwaysOnTop(Boolean(alwaysOnTop), 'floating');
  }
});

ipcMain.on('window-set-opacity', (event, opacityPercent) => {
  if (mainWindow) {
    const val = Math.max(0.3, Math.min(1.0, opacityPercent / 100));
    mainWindow.setOpacity(val);
  }
});

ipcMain.on('window-resize', (event, { width, height }) => {
  if (mainWindow) {
    mainWindow.setSize(Math.round(width), Math.round(height), true);
  }
});

ipcMain.handle('register-global-shortcut', (event, options) => {
  registerShortcuts(options);
  const targetKey = (typeof options === 'string') ? options : (options && options.toggleWindowHotkey);
  return targetKey ? globalShortcut.isRegistered(targetKey) : true;
});

ipcMain.handle('copy-to-clipboard', (event, text) => {
  clipboard.writeText(text || '');
  return true;
});

function triggerNativePaste(delayMs = 40) {
  const candidates = [
    path.join(__dirname, 'assets', 'send-paste.exe'),
    path.join(process.resourcesPath || '', 'assets', 'send-paste.exe'),
    path.join(__dirname, '..', 'assets', 'send-paste.exe')
  ];
  const pasteExe = candidates.find(p => fs.existsSync(p));

  if (pasteExe) {
    execFile(pasteExe, [String(delayMs)], (err) => {
      if (err) console.warn('send-paste.exe execution error:', err);
    });
  } else {
    // Fallback via PowerShell SendKeys
    const psCmd = `powershell -NoProfile -NonInteractive -Command "$wshell = New-Object -ComObject wscript.shell; Start-Sleep -Milliseconds ${delayMs}; $wshell.SendKeys('^v')"`;
    exec(psCmd, (err) => {
      if (err) console.warn('PowerShell paste fallback error:', err);
    });
  }
}

ipcMain.handle('paste-to-active-window', async (event, text) => {
  if (text) {
    clipboard.writeText(text);
  }

  // If overlay window has focus, blur it so focus reverts to previous window (e.g. Discord)
  if (mainWindow && mainWindow.isFocused()) {
    mainWindow.blur();
  }

  // Brief delay to allow OS focus switch and clipboard buffer sync
  await new Promise(r => setTimeout(r, 60));

  triggerNativePaste(30);
  return true;
});

ipcMain.handle('read-clipboard', () => {
  return clipboard.readText();
});

// Config backup in userData folder
const configPath = path.join(app.getPath('userData'), 'gemini_config_backup.json');

ipcMain.handle('save-config-backup', (event, config) => {
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('load-config-backup', () => {
  try {
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (e) {}
  return null;
});

app.whenReady().then(() => {
  createWindow();
  createTray();
  registerShortcuts(currentShortcut);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (mainWindow) {
      mainWindow.show();
    }
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
