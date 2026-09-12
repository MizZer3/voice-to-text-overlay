/**
 * Main Frontend Application Controller for Gemini Live Overlay
 */

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const appContainer = document.getElementById('appContainer');
  const statusBadge = document.getElementById('statusBadge');
  const statusText = document.getElementById('statusText');
  const btnPin = document.getElementById('btnPin');
  const btnOpenSettings = document.getElementById('btnOpenSettings');
  const btnCloseSettings = document.getElementById('btnCloseSettings');
  const btnMinimize = document.getElementById('btnMinimize');
  const btnClose = document.getElementById('btnClose');
  const modeBar = document.getElementById('modeBar');
  const waveformContainer = document.getElementById('waveformContainer');
  const waveBars = document.querySelectorAll('.wave-bar');
  const transcriptBox = document.getElementById('transcriptBox');
  const activeModeLabel = document.getElementById('activeModeLabel');
  const statsLabel = document.getElementById('statsLabel');
  const btnRecord = document.getElementById('btnRecord');
  const recordIndicator = document.getElementById('recordIndicator');
  const recordBtnLabel = document.getElementById('recordBtnLabel');
  const badgeAutoCopy = document.getElementById('badgeAutoCopy');
  const autoCopyCheck = document.getElementById('autoCopyCheck');
  const badgeDirectPaste = document.getElementById('badgeDirectPaste');
  const directPasteCheck = document.getElementById('directPasteCheck');
  const btnTranslateText = document.getElementById('btnTranslateText');
  const translateBtnLabel = document.getElementById('translateBtnLabel');
  const translateIconWrap = document.getElementById('translateIconWrap');
  const quickTargetLangSelect = document.getElementById('quickTargetLangSelect');
  const btnCopy = document.getElementById('btnCopy');
  const copyIconWrap = document.getElementById('copyIconWrap');
  const copyBtnLabel = document.getElementById('copyBtnLabel');
  const btnClear = document.getElementById('btnClear');
  const toastNotice = document.getElementById('toastNotice');
  const resizeHandle = document.getElementById('resizeHandle');
  const emptyPlaceholder = document.getElementById('emptyPlaceholder');

  // Settings Elements
  const settingsDrawer = document.getElementById('settingsDrawer');
  const inputApiKey = document.getElementById('inputApiKey');
  const btnToggleKeyVisibility = document.getElementById('btnToggleKeyVisibility');
  const selectMode = document.getElementById('selectMode');
  const selectSpokenLanguage = document.getElementById('selectSpokenLanguage');
  const sectionTargetLang = document.getElementById('sectionTargetLang');
  const selectTargetLang = document.getElementById('selectTargetLang');
  const selectModel = document.getElementById('selectModel');
  const sectionCustomModel = document.getElementById('sectionCustomModel');
  const inputCustomModel = document.getElementById('inputCustomModel');
  const selectRecordingBehavior = document.getElementById('selectRecordingBehavior');
  const selectFontSize = document.getElementById('selectFontSize');
  const checkAutoCopy = document.getElementById('checkAutoCopy');
  const checkDirectPaste = document.getElementById('checkDirectPaste');
  const checkAlwaysOnTop = document.getElementById('checkAlwaysOnTop');
  const rangeSilenceTimeout = document.getElementById('rangeSilenceTimeout');
  const valSilenceTimeout = document.getElementById('valSilenceTimeout');
  const rangeVadThreshold = document.getElementById('rangeVadThreshold');
  const valVadThreshold = document.getElementById('valVadThreshold');
  const inputGlobalHotkey = document.getElementById('inputGlobalHotkey');
  const inputRecordHotkey = document.getElementById('inputRecordHotkey');
  const inputCustomInstructions = document.getElementById('inputCustomInstructions');
  const rangeOpacity = document.getElementById('rangeOpacity');
  const valOpacity = document.getElementById('valOpacity');
  const selectAudioDevice = document.getElementById('selectAudioDevice');
  const btnSaveSettings = document.getElementById('btnSaveSettings');
  const btnResetSettings = document.getElementById('btnResetSettings');

  // State
  let config = ConfigManager.load();
  let isRecording = false;
  let isPushToTalkActive = false;
  let audioRecorder = null;
  let liveClient = null;
  let currentFullText = '';
  let sessionBaseText = '';
  let rawCheckpoint = '';
  let originalTextBeforeTranslate = null;
  let isShowingTranslation = false;
  let toastTimer = null;
  let cursorEl = null;
  let currentClearEpoch = 0;
  let lastCommittedUtterances = [];

  // Initialize UI with saved config
  populateModelOptions();
  applyConfigToUI();
  populateAudioDevices();
  setupElectronIntegration();
  setupEventListeners();

  /**
   * Populate model dropdown options dynamically from DEFAULT_MODELS
   */
  function populateModelOptions() {
    if (!selectModel || typeof DEFAULT_MODELS === 'undefined') return;
    selectModel.innerHTML = '';
    DEFAULT_MODELS.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.name;
      selectModel.appendChild(opt);
    });
    const customOpt = document.createElement('option');
    customOpt.value = 'custom';
    customOpt.textContent = 'Власна модель (Custom ID)...';
    selectModel.appendChild(customOpt);
  }

  /**
   * Update placeholder overlay visibility based on text content
   */
  function updatePlaceholderVisibility() {
    if (!emptyPlaceholder) return;
    const hasText = Boolean(currentFullText && currentFullText.trim()) || Boolean(transcriptBox.innerText && transcriptBox.innerText.trim());
    if (isRecording || hasText) {
      emptyPlaceholder.classList.add('hidden');
    } else {
      emptyPlaceholder.classList.remove('hidden');
    }
  }

  /**
   * Apply config values to the UI
   */
  function applyConfigToUI() {
    inputApiKey.value = config.apiKey || '';
    selectMode.value = config.mode || 'smart_polish';
    selectTargetLang.value = config.targetLanguage || 'English';
    applyModelToUI();
    selectRecordingBehavior.value = config.recordingBehavior || 'toggle';
    if (selectFontSize) selectFontSize.value = config.fontSize || 'medium';
    checkAutoCopy.checked = Boolean(config.autoCopy);
    if (checkDirectPaste) checkDirectPaste.checked = Boolean(config.directPaste);
    checkAlwaysOnTop.checked = Boolean(config.alwaysOnTop);

    rangeSilenceTimeout.value = config.silenceTimeoutMs || 1800;
    valSilenceTimeout.textContent = `${(rangeSilenceTimeout.value / 1000).toFixed(1)} с`;

    const vadVal = Math.round((config.vadThreshold || 0.018) * 1000);
    rangeVadThreshold.value = vadVal;
    valVadThreshold.textContent = (vadVal / 1000).toFixed(3);

    inputGlobalHotkey.value = config.globalHotkey || 'Alt+Space';
    if (inputRecordHotkey) inputRecordHotkey.value = config.recordHotkey || 'CommandOrControl+Shift+R';
    if (inputCustomInstructions) inputCustomInstructions.value = config.customInstructions || '';

    rangeOpacity.value = config.windowOpacity || 98;
    valOpacity.textContent = `${rangeOpacity.value}%`;

    // Apply font size to transcript box
    transcriptBox.classList.remove('font-small', 'font-medium', 'font-large');
    transcriptBox.classList.add(`font-${config.fontSize || 'medium'}`);

    // Spoken and target language in UI
    if (selectSpokenLanguage) selectSpokenLanguage.value = config.spokenLanguage || 'uk';
    if (quickTargetLangSelect) quickTargetLangSelect.value = config.targetLanguage || 'English';
    if (sectionTargetLang) sectionTargetLang.style.display = 'flex';

    // Auto-copy and Direct Paste badges in main screen
    updateAutoCopyBadge();
    updateDirectPasteBadge();

    // Mode pills in main screen
    updateModePillsUI(config.mode);

    // Update quick translate target select
    updateTranslateBarUI();

    // Initial placeholder state
    updatePlaceholderVisibility();

    // Update opacity & alwaysOnTop via Electron
    if (window.electronAPI) {
      window.electronAPI.setAlwaysOnTop(config.alwaysOnTop);
      window.electronAPI.setOpacity(config.windowOpacity);
    }
    btnPin.classList.toggle('active', config.alwaysOnTop);
  }

  function updateTranslateBarUI() {
    if (quickTargetLangSelect && config.targetLanguage) {
      quickTargetLangSelect.value = config.targetLanguage;
    }
    if (selectTargetLang && config.targetLanguage) {
      selectTargetLang.value = config.targetLanguage;
    }
  }

  function applyModelToUI() {
    const currentModel = config.model || 'gemini-3.5-transcribe-live';
    const cleanModel = currentModel.replace(/^models\//, '');
    let foundInPresets = false;
    for (let i = 0; i < selectModel.options.length; i++) {
      if (selectModel.options[i].value === currentModel || selectModel.options[i].value === cleanModel) {
        selectModel.value = selectModel.options[i].value;
        foundInPresets = true;
        break;
      }
    }
    if (foundInPresets) {
      if (sectionCustomModel) sectionCustomModel.style.display = 'none';
      if (inputCustomModel) inputCustomModel.value = currentModel;
    } else {
      selectModel.value = 'custom';
      if (sectionCustomModel) sectionCustomModel.style.display = 'flex';
      if (inputCustomModel) inputCustomModel.value = currentModel;
    }
  }

  function updateAutoCopyBadge() {
    badgeAutoCopy.classList.toggle('active', config.autoCopy);
    if (autoCopyCheck) {
      if (config.autoCopy) {
        autoCopyCheck.innerHTML = '<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
      } else {
        autoCopyCheck.innerHTML = '<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>';
      }
    }
  }

  function updateDirectPasteBadge() {
    if (!badgeDirectPaste) return;
    badgeDirectPaste.classList.toggle('active', Boolean(config.directPaste));
    if (directPasteCheck) {
      if (config.directPaste) {
        directPasteCheck.innerHTML = '<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
      } else {
        directPasteCheck.innerHTML = '<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>';
      }
    }
  }

  function updateModePillsUI(activeMode) {
    document.querySelectorAll('.mode-pill').forEach(pill => {
      const isCurrent = pill.getAttribute('data-mode') === activeMode;
      pill.classList.toggle('active', isCurrent);
    });

    updateTranslateBarUI();

    const modeObj = MODES[activeMode] || MODES.smart_polish;
    const modelDisplay = config.model || 'gemini-3.5-transcribe-live';
    const langBadge = (config.spokenLanguage || 'uk') === 'uk' ? '🇺🇦 UA' : ((config.spokenLanguage === 'en') ? '🇬🇧 EN' : ((config.spokenLanguage === 'pl') ? '🇵🇱 PL' : ((config.spokenLanguage === 'de') ? '🇩🇪 DE' : ((config.spokenLanguage === 'es') ? '🇪🇸 ES' : '🌐 AUTO'))));
    activeModeLabel.textContent = `${modeObj.name} · ${langBadge} · ${modelDisplay}`;
  }

  /**
   * Populate microphone devices
   */
  async function populateAudioDevices() {
    try {
      const devices = await AudioRecorder.getAudioInputDevices();
      selectAudioDevice.innerHTML = '<option value="">За замовчуванням (Default)</option>';
      devices.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.deviceId;
        opt.textContent = d.label || `Мікрофон ${selectAudioDevice.children.length}`;
        if (d.deviceId === config.deviceId) {
          opt.selected = true;
        }
        selectAudioDevice.appendChild(opt);
      });
    } catch (e) {
      console.warn('Could not enumerate audio devices:', e);
    }
  }

  /**
   * Setup Electron IPC Integration
   */
  function setupElectronIntegration() {
    if (!window.electronAPI) return;

    // Sync backup config if localStorage was fresh
    if (window.electronAPI.loadConfigBackup) {
      window.electronAPI.loadConfigBackup().then(backup => {
        if (backup && typeof backup === 'object') {
          let updated = false;
          for (const k in backup) {
            if (config[k] === undefined || config[k] === '' || config[k] === null) {
              config[k] = backup[k];
              updated = true;
            }
          }
          if (updated) {
            ConfigManager.save(config);
            applyConfigToUI();
          }
        }
      }).catch(err => {
        console.warn('Could not load config backup:', err);
      });
    }

    btnMinimize.addEventListener('click', () => {
      window.electronAPI.minimizeWindow();
    });

    btnClose.addEventListener('click', () => {
      window.electronAPI.hideWindow();
    });

    btnPin.addEventListener('click', () => {
      config.alwaysOnTop = !config.alwaysOnTop;
      ConfigManager.save(config);
      btnPin.classList.toggle('active', config.alwaysOnTop);
      checkAlwaysOnTop.checked = config.alwaysOnTop;
      window.electronAPI.setAlwaysOnTop(config.alwaysOnTop);
      showToast(config.alwaysOnTop ? 'Завжди зверху: увімкнено' : 'Завжди зверху: вимкнено', 1500);
    });

    // Listen for global shortcut trigger
    window.electronAPI.onGlobalShortcutTriggered((action) => {
      if (action === 'toggle-recording') {
        toggleRecording();
      }
    });

    // Listen for tray menu actions
    window.electronAPI.onTrayAction((action) => {
      if (action === 'toggle-recording') {
        toggleRecording();
      } else if (action === 'open-settings') {
        openSettings();
      }
    });

    // Register configured global shortcuts
    registerConfiguredShortcuts();

    // Resize handle interaction
    if (resizeHandle) {
      let isResizing = false;
      let startX = 0;
      let startY = 0;
      let startW = 0;
      let startH = 0;

      resizeHandle.addEventListener('mousedown', (e) => {
        isResizing = true;
        startX = e.screenX;
        startY = e.screenY;
        startW = window.outerWidth;
        startH = window.outerHeight;
        e.preventDefault();
      });

      window.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const newW = Math.max(320, startW + (e.screenX - startX));
        const newH = Math.max(180, startH + (e.screenY - startY));
        window.electronAPI.resizeWindow(newW, newH);
      });

      window.addEventListener('mouseup', () => {
        isResizing = false;
      });
    }
  }

  function registerConfiguredShortcuts() {
    if (window.electronAPI && window.electronAPI.registerGlobalShortcut) {
      window.electronAPI.registerGlobalShortcut({
        toggleWindowHotkey: config.globalHotkey || 'Alt+Space',
        recordHotkey: config.recordHotkey || 'CommandOrControl+Shift+R'
      });
    }
  }

  /**
   * Setup UI Event Listeners
   */
  function setupEventListeners() {
    // Sync inline edits inside transcriptBox and update placeholder visibility
    transcriptBox.addEventListener('input', () => {
      const text = transcriptBox.innerText || '';
      currentFullText = text;
      if (isShowingTranslation) {
        isShowingTranslation = false;
        originalTextBeforeTranslate = null;
        if (translateBtnLabel) translateBtnLabel.textContent = 'Перекласти';
        if (btnTranslateText) btnTranslateText.classList.remove('active-translated', 'loading');
      }
      if (!text.trim()) {
        sessionBaseText = '';
        rawCheckpoint = '';
        currentClearEpoch++;
        lastCommittedUtterances = [];
        if (liveClient) {
          liveClient.clearTranscript();
          if (isRecording) {
            liveClient.resetSession();
          }
        }
      } else {
        sessionBaseText = text.trim();
        rawCheckpoint = (liveClient && isRecording) ? (liveClient.getFullText() || '').trim() : '';
      }
      updatePlaceholderVisibility();
      updateWordStats(currentFullText);
    });

    transcriptBox.addEventListener('focus', () => {
      if (!currentFullText.trim()) {
        if (emptyPlaceholder) emptyPlaceholder.classList.add('hidden');
      }
    });

    transcriptBox.addEventListener('blur', () => {
      updatePlaceholderVisibility();
    });

    if (selectTargetLang) {
      selectTargetLang.addEventListener('change', () => {
        config.targetLanguage = selectTargetLang.value;
        if (quickTargetLangSelect) quickTargetLangSelect.value = config.targetLanguage;
        ConfigManager.save(config);
        if (window.electronAPI && window.electronAPI.saveConfigBackup) {
          window.electronAPI.saveConfigBackup(config);
        }
        updateTranslateBarUI();
      });
    }

    if (selectSpokenLanguage) {
      selectSpokenLanguage.addEventListener('change', () => {
        config.spokenLanguage = selectSpokenLanguage.value;
        ConfigManager.save(config);
        if (window.electronAPI && window.electronAPI.saveConfigBackup) {
          window.electronAPI.saveConfigBackup(config);
        }
        showToast(`Пріоритет мови: ${config.spokenLanguage.toUpperCase()}`, 1500);
      });
    }

    // Mode selector pills
    modeBar.addEventListener('click', (e) => {
      const pill = e.target.closest('.mode-pill');
      if (!pill) return;
      const newMode = pill.getAttribute('data-mode');
      switchMode(newMode);
    });

    // Main Record Button
    btnRecord.addEventListener('click', () => {
      if (config.recordingBehavior === 'toggle') {
        toggleRecording();
      }
    });

    // Push-to-talk mouse events on record button
    btnRecord.addEventListener('mousedown', () => {
      if (config.recordingBehavior === 'push_to_talk' && !isRecording) {
        isPushToTalkActive = true;
        startRecording();
      }
    });

    window.addEventListener('mouseup', () => {
      if (config.recordingBehavior === 'push_to_talk' && isPushToTalkActive) {
        isPushToTalkActive = false;
        stopRecording();
      }
    });

    // Push-to-talk keyboard spacebar hold (when not in an input)
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && config.recordingBehavior === 'push_to_talk') {
        const tag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
        if (tag !== 'input' && tag !== 'select' && tag !== 'textarea' && document.activeElement !== transcriptBox) {
          if (!isPushToTalkActive && !isRecording) {
            isPushToTalkActive = true;
            startRecording();
          }
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space' && config.recordingBehavior === 'push_to_talk') {
        if (isPushToTalkActive) {
          isPushToTalkActive = false;
          stopRecording();
        }
      }
    });

    // Auto-copy badge click
    badgeAutoCopy.addEventListener('click', () => {
      config.autoCopy = !config.autoCopy;
      ConfigManager.save(config);
      checkAutoCopy.checked = config.autoCopy;
      updateAutoCopyBadge();
      showToast(config.autoCopy ? 'Автокопіювання: увімкнено' : 'Автокопіювання: вимкнено');
    });

    // Direct Paste badge click
    if (badgeDirectPaste) {
      badgeDirectPaste.addEventListener('click', () => {
        config.directPaste = !config.directPaste;
        ConfigManager.save(config);
        if (checkDirectPaste) checkDirectPaste.checked = config.directPaste;
        if (window.electronAPI && window.electronAPI.saveConfigBackup) {
          window.electronAPI.saveConfigBackup(config);
        }
        updateDirectPasteBadge();
        showToast(config.directPaste ? 'Автовставка в активне вікно: увімкнено' : 'Автовставка: вимкнено');
      });
    }

    // Quick Target Language Dropdown (in action bar translate group)
    if (quickTargetLangSelect) {
      quickTargetLangSelect.addEventListener('change', () => {
        config.targetLanguage = quickTargetLangSelect.value;
        if (selectTargetLang) selectTargetLang.value = config.targetLanguage;
        ConfigManager.save(config);
        if (window.electronAPI && window.electronAPI.saveConfigBackup) {
          window.electronAPI.saveConfigBackup(config);
        }
        updateTranslateBarUI();
        showToast(`Мова перекладу: ${config.targetLanguage}`, 1500);
      });
    }

    // Translate button (on-demand fast translation)
    if (btnTranslateText) {
      btnTranslateText.addEventListener('click', () => {
        handleOnDemandTranslate();
      });
    }

    // Copy button
    btnCopy.addEventListener('click', () => {
      copyTranscript(true);
    });

    // Clear button
    btnClear.addEventListener('click', () => {
      clearTranscript();
    });

    // Settings drawer buttons
    btnOpenSettings.addEventListener('click', openSettings);
    btnCloseSettings.addEventListener('click', () => {
      saveSettingsFromUI();
      closeSettings();
    });

    inputApiKey.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        saveSettingsFromUI();
        closeSettings();
        showToast('API ключ збережено!');
      }
    });

    if (inputCustomModel) {
      inputCustomModel.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          saveSettingsFromUI();
          closeSettings();
          showToast('Налаштування збережено!');
        }
      });
    }

    btnToggleKeyVisibility.addEventListener('click', () => {
      const isPassword = inputApiKey.type === 'password';
      inputApiKey.type = isPassword ? 'text' : 'password';
      if (isPassword) {
        btnToggleKeyVisibility.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/></svg>';
      } else {
        btnToggleKeyVisibility.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
      }
    });

    // Range input live feedback
    rangeSilenceTimeout.addEventListener('input', () => {
      valSilenceTimeout.textContent = `${(rangeSilenceTimeout.value / 1000).toFixed(1)} с`;
    });

    rangeVadThreshold.addEventListener('input', () => {
      valVadThreshold.textContent = (rangeVadThreshold.value / 1000).toFixed(3);
    });

    rangeOpacity.addEventListener('input', () => {
      valOpacity.textContent = `${rangeOpacity.value}%`;
      if (window.electronAPI) {
        window.electronAPI.setOpacity(Number(rangeOpacity.value));
      }
    });

    selectMode.addEventListener('change', () => {
      switchMode(selectMode.value);
    });

    selectModel.addEventListener('change', () => {
      if (selectModel.value === 'custom') {
        if (sectionCustomModel) {
          sectionCustomModel.style.display = 'flex';
          if (inputCustomModel) {
            inputCustomModel.value = config.model || '';
            inputCustomModel.focus();
          }
        }
      } else {
        if (sectionCustomModel) sectionCustomModel.style.display = 'none';
        if (inputCustomModel) inputCustomModel.value = selectModel.value;
      }
    });

    btnSaveSettings.addEventListener('click', () => {
      saveSettingsFromUI();
      closeSettings();
      showToast('Налаштування збережено!');
    });

    btnResetSettings.addEventListener('click', () => {
      if (confirm('Скинути всі налаштування до початкових значень?')) {
        config = ConfigManager.reset();
        applyConfigToUI();
        showToast('Налаштування скинуто');
      }
    });
  }

  async function switchMode(newMode) {
    if (!newMode || !MODES[newMode]) return;
    if (config.mode === newMode) return;

    // Cleanly stop any active recording session before changing mode
    const wasRecording = isRecording;
    if (wasRecording) {
      await stopRecording(false);
    }

    config.mode = newMode;

    const baseModel = (config.model || '').replace(/^models\//, '').trim();
    if (!baseModel || baseModel === 'gemini-3.5-live-translate' || baseModel === 'gemini-3.5-live-translate-preview' || baseModel.startsWith('gemini-2.')) {
      config.model = 'gemini-3.5-transcribe-live';
    }

    ConfigManager.save(config);

    // Clear old text in the window and reset client transcript state
    clearTranscript(true);

    if (selectMode) selectMode.value = newMode;
    if (sectionTargetLang) sectionTargetLang.style.display = 'flex';
    applyModelToUI();
    updateModePillsUI(newMode);

    // If recording was active, seamlessly restart in the new mode
    if (wasRecording) {
      await startRecording();
    }
  }

  function openSettings() {
    settingsDrawer.classList.add('open');
    populateAudioDevices();
  }

  function closeSettings() {
    settingsDrawer.classList.remove('open');
  }

  async function saveSettingsFromUI() {
    const oldMode = config.mode;
    const oldTargetLang = config.targetLanguage;
    const oldSpokenLang = config.spokenLanguage;
    const oldModel = config.model;

    config.apiKey = inputApiKey.value.trim();
    config.mode = selectMode.value;
    if (selectSpokenLanguage) config.spokenLanguage = selectSpokenLanguage.value;
    config.targetLanguage = selectTargetLang.value;

    if (selectModel.value === 'custom') {
      config.model = (inputCustomModel && inputCustomModel.value.trim()) || 'gemini-3.5-transcribe-live';
    } else {
      config.model = selectModel.value;
    }

    const baseModel = (config.model || '').replace(/^models\//, '').trim();
    if (!baseModel || baseModel === 'gemini-3.5-live-translate' || baseModel.startsWith('gemini-2.')) {
      config.model = 'gemini-3.5-transcribe-live';
    }

    config.recordingBehavior = selectRecordingBehavior.value;
    if (selectFontSize) config.fontSize = selectFontSize.value;
    config.autoCopy = checkAutoCopy.checked;
    if (checkDirectPaste) config.directPaste = checkDirectPaste.checked;
    config.alwaysOnTop = checkAlwaysOnTop.checked;
    config.silenceTimeoutMs = Number(rangeSilenceTimeout.value);
    config.vadThreshold = Number(rangeVadThreshold.value) / 1000;
    config.globalHotkey = inputGlobalHotkey.value.trim() || 'Alt+Space';
    if (inputRecordHotkey) config.recordHotkey = inputRecordHotkey.value.trim() || 'CommandOrControl+Shift+R';
    if (inputCustomInstructions) config.customInstructions = inputCustomInstructions.value.trim();
    config.windowOpacity = Number(rangeOpacity.value);
    config.deviceId = selectAudioDevice.value;

    ConfigManager.save(config);

    if (window.electronAPI) {
      window.electronAPI.setAlwaysOnTop(config.alwaysOnTop);
      window.electronAPI.setOpacity(config.windowOpacity);
      registerConfiguredShortcuts();
      window.electronAPI.saveConfigBackup(config);
    }

    applyConfigToUI();

    if (oldMode !== config.mode) {
      clearTranscript(true);
    }

    if (isRecording && (oldMode !== config.mode || oldTargetLang !== config.targetLanguage || oldSpokenLang !== config.spokenLanguage || oldModel !== config.model)) {
      await restartSession();
    }
  }

  /**
   * Toggle recording session
   */
  async function toggleRecording() {
    if (isRecording) {
      await stopRecording();
    } else {
      await startRecording();
    }
  }

  /**
   * Start Live Audio Streaming to Gemini Live API
   */
  async function startRecording() {
    if (isRecording) return;

    if (!config.apiKey || !config.apiKey.trim()) {
      openSettings();
      inputApiKey.focus();
      showToast('Вкажіть Gemini API ключ у налаштуваннях', 3500);
      return;
    }

    try {
      // Capture any existing text in the transcript box so new recording is appended rather than overwritten
      sessionBaseText = (currentFullText || (transcriptBox && transcriptBox.innerText) || '').trim();
      rawCheckpoint = '';

      setStatus('connecting', 'Підключення до Gemini Live...');
      btnRecord.classList.add('recording');
      if (recordIndicator) {
        recordIndicator.className = 'record-square';
      }
      recordBtnLabel.textContent = config.recordingBehavior === 'push_to_talk' ? 'Слухаю...' : 'Зупинити';
      appContainer.classList.add('recording');
      waveformContainer.classList.add('active');

      updatePlaceholderVisibility();
      ensureBlinkCursor();

      // 1. Initialize Gemini Live WebSocket Client
      if (isShowingTranslation) {
        isShowingTranslation = false;
        originalTextBeforeTranslate = null;
        if (translateBtnLabel) translateBtnLabel.textContent = 'Переклад';
        if (btnTranslateText) btnTranslateText.classList.remove('active-translated', 'loading');
      }

      const systemPrompt = getSystemPrompt(config.mode, {
        targetLanguage: config.targetLanguage,
        spokenLanguage: config.spokenLanguage || 'uk',
        customInstructions: config.customInstructions
      });

      liveClient = new GeminiLiveClient({
        apiKey: config.apiKey,
        model: config.model,
        systemPrompt: systemPrompt
      });

      liveClient.onStatusChange = (status, details) => {
        if (status === 'connecting') {
          setStatus('connecting', details);
        } else if (status === 'setup') {
          setStatus('connecting', 'Сетап...');
        } else if (status === 'ready') {
          setStatus('recording', 'Запис наживо');
        } else if (status === 'disconnected') {
          if (!isRecording) {
            setStatus('idle', 'Очікування');
          }
        }
      };

      liveClient.onDelta = (delta, currentTurn, fullText) => {
        const rawSpeech = typeof extractNewSpeech === 'function' ? extractNewSpeech(fullText, rawCheckpoint) : fullText;

        let displayText = rawSpeech;
        if (typeof filterLanguageLock === 'function') {
          displayText = filterLanguageLock(displayText, config.spokenLanguage || 'uk');
        }
        if (config.mode === 'smart_polish' && typeof cleanSmartPolish === 'function') {
          displayText = cleanSmartPolish(displayText, config.spokenLanguage || 'uk');
          if (sessionBaseText && typeof stripTailOverlap === 'function') {
            displayText = stripTailOverlap(sessionBaseText, displayText);
          }
        }
        const combined = sessionBaseText ? (displayText ? `${sessionBaseText} ${displayText}` : sessionBaseText) : displayText;
        currentFullText = combined;
        renderTranscript(combined);
        updateWordStats(combined);
      };

      liveClient.onTurnComplete = async (turnText, utteranceIndex) => {
        if (!turnText || !turnText.trim()) return;

        let processedTurn = turnText;
        if (typeof filterLanguageLock === 'function') {
          processedTurn = filterLanguageLock(processedTurn, config.spokenLanguage || 'uk');
        }

        // Background safeguard: if configured for Ukrainian and Polish indicators remain, translate back to Ukrainian
        if ((config.spokenLanguage || 'uk') === 'uk' && typeof hasPolishIndicators === 'function' && hasPolishIndicators(processedTurn)) {
          if (config.apiKey && typeof translateText === 'function') {
            try {
              const ukrainianTurn = await translateText(processedTurn, 'Ukrainian', config.apiKey);
              if (ukrainianTurn && ukrainianTurn !== processedTurn) {
                processedTurn = ukrainianTurn;
                if (typeof utteranceIndex === 'number' && utteranceIndex >= 0 && liveClient) {
                  liveClient.updateUtterance(utteranceIndex, ukrainianTurn);
                  currentFullText = (sessionBaseText ? `${sessionBaseText} ${ukrainianTurn}` : ukrainianTurn).trim();
                  renderTranscript(currentFullText);
                  updateWordStats(currentFullText);
                }
              }
            } catch (e) {
              console.warn('Auto-conversion from Polish to Ukrainian failed:', e);
            }
          }
        }

        if (typeof utteranceIndex === 'number' && utteranceIndex >= 0) {
          lastCommittedUtterances[utteranceIndex] = processedTurn;
        }

        if (config.autoCopy && isRecording) {
          copyTranscript(false); // silent clipboard sync during live session without interrupting toast
        }
      };

      liveClient.onError = (err) => {
        console.error('Gemini Live API Error:', err);
        setStatus('error', 'Помилка API');
        showToast(`Помилка: ${err.message || 'Не вдалося з’єднатися'}`, 4000);
        stopRecording(false);
      };

      await liveClient.connect();

      // 2. Initialize Audio Capture & VAD with silence suppression and 700ms hangover
      audioRecorder = new AudioRecorder({
        targetSampleRate: 16000,
        vadThreshold: config.vadThreshold,
        silenceTimeoutMs: config.silenceTimeoutMs,
        hangoverDurationMs: 700,
        deviceId: config.deviceId
      });

      audioRecorder.onAudioChunk = (base64Pcm, rms) => {
        if (liveClient && isRecording) {
          liveClient.sendAudioChunk(base64Pcm);
        }
      };

      audioRecorder.onRmsUpdate = (normalizedRms, isSpeaking) => {
        updateWaveform(normalizedRms);
      };

      // When user pauses speaking (silence timeout), sync clipboard if autoCopy is active
      audioRecorder.onSilenceDetected = () => {
        if (liveClient && isRecording) {
          if (config.autoCopy && currentFullText && currentFullText.trim()) {
            copyTranscript(false);
          }
        }
      };

      // Google Live API tracks voiceActivity internally and finalizes utterances.
      // Silence suppression in AudioRecorder suppresses background noise without artificial turn completes.

      audioRecorder.onError = (err) => {
        console.error('Microphone capture error:', err);
        setStatus('error', 'Помилка мікрофона');
        showToast('Помилка доступу до мікрофона', 4000);
        stopRecording(false);
      };

      await audioRecorder.start();
      isRecording = true;
      setStatus('recording', 'Запис наживо');

    } catch (err) {
      console.error('Failed to start recording session:', err);
      await stopRecording(false);
      setStatus('error', 'Помилка запуску');
      showToast(err.message || 'Не вдалося почати запис', 4000);
    }
  }

  /**
   * Stop Live Audio Streaming & auto-copy if enabled
   * @param {boolean} [resetStatusToIdle=true]
   */
  async function stopRecording(resetStatusToIdle = true) {
    const stopEpoch = currentClearEpoch;
    isRecording = false;
    btnRecord.classList.remove('recording');
    if (recordIndicator) {
      recordIndicator.className = 'record-dot';
    }
    recordBtnLabel.textContent = 'Запис';
    appContainer.classList.remove('recording');
    waveformContainer.classList.remove('active');
    resetWaveform();
    removeBlinkCursor();
    if (audioRecorder) {
      audioRecorder.stop();
      audioRecorder = null;
    }

    // Wait for final audio chunks to be received and transcribed by Gemini Live server.
    // Dynamically poll up to 650ms if deltas are actively streaming to prevent truncating the last word.
    const waitStart = Date.now();
    await new Promise(r => setTimeout(r, 450));

    while (liveClient && (Date.now() - (liveClient.lastDeltaTime || 0) < 200) && (Date.now() - waitStart < 650)) {
      await new Promise(r => setTimeout(r, 50));
    }

    if (stopEpoch !== currentClearEpoch) {
      // Transcript was cleared while waiting! Cleanly abort.
      if (liveClient) {
        liveClient.disconnect();
        liveClient = null;
      }
      return;
    }

    if (liveClient) {
      const finalRaw = liveClient.getFullText();
      const newSpeech = typeof extractNewSpeech === 'function' ? extractNewSpeech(finalRaw, rawCheckpoint) : finalRaw;
      let cleaned = newSpeech;
      if (typeof filterLanguageLock === 'function') {
        cleaned = filterLanguageLock(cleaned, config.spokenLanguage || 'uk');
      }
      if (config.mode === 'smart_polish' && typeof cleanSmartPolish === 'function') {
        cleaned = cleanSmartPolish(cleaned, config.spokenLanguage || 'uk');
        if (sessionBaseText && typeof stripTailOverlap === 'function') {
          cleaned = stripTailOverlap(sessionBaseText, cleaned);
        }
      }
      if (cleaned && cleaned.trim()) {
        currentFullText = sessionBaseText ? `${sessionBaseText} ${cleaned.trim()}` : cleaned.trim();
        renderTranscript(currentFullText);
        updateWordStats(currentFullText);
      }
    }

    // Save full accumulated text for subsequent recording sessions
    sessionBaseText = (currentFullText || (transcriptBox && transcriptBox.innerText) || '').trim();
    rawCheckpoint = '';

    if (stopEpoch !== currentClearEpoch) {
      if (liveClient) {
        liveClient.disconnect();
        liveClient = null;
      }
      return;
    }

    if (liveClient) {
      liveClient.disconnect();
      liveClient = null;
    }

    if (resetStatusToIdle) {
      setStatus('idle', 'Очікування');
    }

    // Auto copy on complete
    if (config.autoCopy && currentFullText && currentFullText.trim()) {
      copyTranscript(!config.directPaste);
    }

    // Direct paste to active window on complete
    if (config.directPaste && currentFullText && currentFullText.trim()) {
      await pasteToActiveWindow(currentFullText);
    }
  }

  async function restartSession() {
    if (isRecording) {
      await stopRecording();
      await startRecording();
    }
  }

  /**
   * Update transcription text with smart autoscroll
   */
  function renderTranscript(text) {
    if (!transcriptBox) return;

    updatePlaceholderVisibility();

    // Only autoscroll if user was already at/near the bottom
    const threshold = 60;
    const isNearBottom = (transcriptBox.scrollHeight - transcriptBox.scrollTop - transcriptBox.clientHeight) <= threshold;

    removeBlinkCursor();
    transcriptBox.innerText = text;
    ensureBlinkCursor();

    if (isNearBottom) {
      transcriptBox.scrollTop = transcriptBox.scrollHeight;
    }
  }

  function ensureBlinkCursor() {
    if (!cursorEl) {
      cursorEl = document.createElement('span');
      cursorEl.className = 'cursor-blink';
    }
    if (cursorEl.parentElement !== transcriptBox) {
      transcriptBox.appendChild(cursorEl);
    }
  }

  function removeBlinkCursor() {
    if (cursorEl && cursorEl.parentElement) {
      cursorEl.remove();
    }
  }

  function updateWordStats(text) {
    const trimmed = (text || '').trim();
    const chars = trimmed.length;
    const words = trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
    statsLabel.textContent = `${words} слів | ${chars} симв.`;
  }

  /**
   * Visualizer wave animation based on RMS
   */
  function updateWaveform(normalizedRms) {
    const baseHeight = 4;
    const maxBarHeight = 16;
    waveBars.forEach((bar, idx) => {
      const multiplier = 0.6 + 0.4 * Math.sin(idx * 1.2 + Date.now() / 150);
      const h = Math.min(maxBarHeight, Math.max(baseHeight, Math.round((normalizedRms / 100) * maxBarHeight * multiplier)));
      bar.style.height = `${h}px`;
    });
  }

  function resetWaveform() {
    waveBars.forEach(bar => {
      bar.style.height = '4px';
    });
  }

  /**
   * Directly paste transcript into active external window (Discord, Telegram, Word, etc.)
   */
  async function pasteToActiveWindow(text) {
    let textToPaste = (text || currentFullText || (transcriptBox && transcriptBox.innerText) || '').trim();
    if (!textToPaste) return;

    if (typeof filterLanguageLock === 'function') {
      textToPaste = filterLanguageLock(textToPaste, config.spokenLanguage || 'uk');
    }
    if (config.mode === 'smart_polish' && typeof cleanSmartPolish === 'function') {
      textToPaste = cleanSmartPolish(textToPaste, config.spokenLanguage || 'uk');
    }

    if (window.electronAPI && window.electronAPI.pasteToActiveWindow) {
      try {
        await window.electronAPI.pasteToActiveWindow(textToPaste);
        showToast('Вставлено в активне вікно!', 2500);
        setStatus('success', 'Вставлено!');

        // Reset session base and box text so the next phrase starts fresh
        sessionBaseText = '';
        rawCheckpoint = '';
        currentFullText = '';
        if (transcriptBox) transcriptBox.innerText = '';
        updatePlaceholderVisibility();
        updateWordStats('');

        setTimeout(() => {
          if (!isRecording) {
            setStatus('idle', 'Очікування');
          }
        }, 1800);
      } catch (err) {
        console.warn('Failed to paste to active window:', err);
      }
    }
  }

  /**
   * Copy current transcript to clipboard
   */
  async function copyTranscript(showFeedback = true) {
    let textToCopy = (currentFullText || transcriptBox.innerText || '').trim();
    if (!textToCopy) return;

    if (typeof filterLanguageLock === 'function') {
      textToCopy = filterLanguageLock(textToCopy, config.spokenLanguage || 'uk');
    }
    if (config.mode === 'smart_polish' && typeof cleanSmartPolish === 'function') {
      textToCopy = cleanSmartPolish(textToCopy, config.spokenLanguage || 'uk');
    }

    try {
      if (window.electronAPI) {
        await window.electronAPI.copyToClipboard(textToCopy);
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(textToCopy);
      }

      if (showFeedback) {
        btnCopy.classList.add('copied');
        if (copyIconWrap) {
          copyIconWrap.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
        }
        if (copyBtnLabel) {
          copyBtnLabel.textContent = 'Скопійовано!';
        }
        showToast('Скопійовано в буфер обміну');
        setStatus('success', 'Скопійовано!');

        setTimeout(() => {
          btnCopy.classList.remove('copied');
          if (copyIconWrap) {
            copyIconWrap.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
          }
          if (copyBtnLabel) {
            copyBtnLabel.textContent = 'Копія';
          }
          if (!isRecording) {
            setStatus('idle', 'Очікування');
          }
        }, 1800);
      }
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  }

  /**
   * Clear transcript
   * @param {boolean} [silent=false]
   */
  function clearTranscript(silent = false) {
    currentClearEpoch++;
    sessionBaseText = '';
    rawCheckpoint = '';
    currentFullText = '';
    originalTextBeforeTranslate = null;
    isShowingTranslation = false;
    if (translateBtnLabel) translateBtnLabel.textContent = 'Переклад';
    if (btnTranslateText) btnTranslateText.classList.remove('active-translated', 'loading');
    lastCommittedUtterances = [];
    if (liveClient) {
      liveClient.clearTranscript();
      if (!isRecording) {
        liveClient.disconnect();
        liveClient = null;
      } else {
        liveClient.resetSession();
      }
    }
    if (audioRecorder) {
      audioRecorder.preBuffer = [];
      audioRecorder.hasDetectedSpeech = false;
      audioRecorder.isSilentSuppressed = true;
    }
    removeBlinkCursor();
    transcriptBox.innerText = '';
    updatePlaceholderVisibility();
    updateWordStats('');
    if (!silent) {
      showToast('Текст очищено');
    }
  }

  /**
   * Fast, on-demand full transcript translation
   * Uses Gemini REST API generateContent (gemini-3.5-flash-lite) via fast-translator.js
   * Consumes only 1 API call per click, preserving user minute limits!
   */
  async function handleOnDemandTranslate() {
    if (isShowingTranslation && originalTextBeforeTranslate) {
      // Toggle back to original transcript
      currentFullText = originalTextBeforeTranslate;
      renderTranscript(currentFullText);
      updateWordStats(currentFullText);
      isShowingTranslation = false;
      originalTextBeforeTranslate = null;
      if (translateBtnLabel) translateBtnLabel.textContent = 'Переклад';
      if (btnTranslateText) btnTranslateText.classList.remove('active-translated', 'loading');
      showToast('Повернуто оригінальний текст', 2000);
      return;
    }

    const currentText = (currentFullText || (transcriptBox && transcriptBox.innerText) || '').trim();
    if (!currentText) {
      showToast('Немає тексту для перекладу', 2500);
      return;
    }

    if (!config.apiKey || !config.apiKey.trim()) {
      openSettings();
      inputApiKey.focus();
      showToast('Вкажіть Gemini API ключ у налаштуваннях', 3500);
      return;
    }

    if (btnTranslateText) {
      btnTranslateText.classList.add('loading');
    }
    if (translateBtnLabel) {
      translateBtnLabel.textContent = 'Перекладаю...';
    }

    try {
      const targetLang = config.targetLanguage || 'English';
      const translated = await translateText(currentText, targetLang, config.apiKey);
      if (translated && translated !== currentText) {
        originalTextBeforeTranslate = currentText;
        isShowingTranslation = true;
        currentFullText = translated;
        renderTranscript(translated);
        updateWordStats(translated);

        if (translateBtnLabel) translateBtnLabel.textContent = 'Оригінал';
        if (btnTranslateText) {
          btnTranslateText.classList.remove('loading');
          btnTranslateText.classList.add('active-translated');
        }

        if (config.autoCopy) {
          copyTranscript(false);
          showToast(`Перекладено на ${targetLang} та скопійовано!`, 3000);
        } else {
          showToast(`Перекладено на ${targetLang}! (Клікніть «Оригінал», щоб повернути)`, 3500);
        }
      } else {
        showToast('Текст уже цією мовою', 2500);
        if (translateBtnLabel) translateBtnLabel.textContent = 'Переклад';
        if (btnTranslateText) btnTranslateText.classList.remove('loading');
      }
    } catch (err) {
      console.error('On-demand translation error:', err);
      showToast(`Помилка перекладу: ${err.message || 'Спробуйте пізніше'}`, 3500);
      if (translateBtnLabel) translateBtnLabel.textContent = 'Переклад';
      if (btnTranslateText) btnTranslateText.classList.remove('loading');
    }
  }

  /**
   * Status badge helper
   */
  function setStatus(type, text) {
    statusBadge.className = `status-badge ${type}`;
    statusText.textContent = text;
  }

  /**
   * Show toast notification
   */
  function showToast(message, duration = 2000) {
    if (toastTimer) clearTimeout(toastTimer);
    toastNotice.textContent = message;
    toastNotice.classList.add('show');
    toastTimer = setTimeout(() => {
      toastNotice.classList.remove('show');
    }, duration);
  }
});
