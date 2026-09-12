/**
 * Configuration storage and defaults for Gemini Live Overlay
 */

const DEFAULT_CONFIG = {
  apiKey: '',
  mode: 'smart_polish',
  targetLanguage: 'English',
  model: 'gemini-3.5-transcribe-live',
  recordingBehavior: 'toggle', // 'toggle' | 'push_to_talk'
  vadThreshold: 0.018,
  silenceTimeoutMs: 1800,
  autoCopy: true,
  directPaste: false,
  alwaysOnTop: true,
  globalHotkey: 'Alt+Space',
  recordHotkey: 'CommandOrControl+Shift+R',
  windowOpacity: 98,
  compactMode: false,
  deviceId: '',
  fontSize: 'medium', // 'small' | 'medium' | 'large'
  spokenLanguage: 'uk', // 'uk' | 'en' | 'pl' | 'de' | 'es' | 'auto'
  customInstructions: '',
  configVersion: 2
};

const STORAGE_KEY = 'gemini_live_overlay_config_v1';

class ConfigManager {
  /**
   * Load configuration from localStorage or defaults
   * @returns {Object}
   */
  static load() {
    let loaded = {};
    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          loaded = JSON.parse(raw);
        }
      } catch (err) {
        console.error('Failed to parse saved config from localStorage:', err);
      }
    }
    const merged = { ...DEFAULT_CONFIG, ...loaded };
    const allowedModes = ['smart_polish', 'verbatim'];
    if (!allowedModes.includes(merged.mode)) {
      merged.mode = 'smart_polish';
    }
    const allowedSpokenLangs = ['uk', 'en', 'pl', 'de', 'es', 'auto'];
    if (!allowedSpokenLangs.includes(merged.spokenLanguage)) {
      merged.spokenLanguage = 'uk';
    }
    // Migrate legacy default config, non-existent gemini-3.5-live-translate (missing -preview), and deprecated 2.x models
    const DEPRECATED_MODELS = [
      'gemini-2.0-flash-realtime-exp',
      'gemini-2.0-flash-exp',
      'gemini-2.0-flash',
      'gemini-2.5-flash-preview',
      'gemini-3.5-live-translate'
    ];
    const cleanModel = (merged.model || '').replace(/^models\//, '').trim();
    if (!cleanModel || DEPRECATED_MODELS.includes(cleanModel) || cleanModel.startsWith('gemini-2.')) {
      merged.model = 'gemini-3.5-transcribe-live';
    }
    merged.configVersion = 2;
    return merged;
  }

  /**
   * Save configuration to localStorage
   * @param {Object} config
   * @returns {Object}
   */
  static save(config) {
    const merged = { ...DEFAULT_CONFIG, ...config };
    const cleanModel = (merged.model || '').replace(/^models\//, '').trim();
    if (!cleanModel || cleanModel === 'gemini-3.5-live-translate' || cleanModel.startsWith('gemini-2.')) {
      config.model = 'gemini-3.5-transcribe-live';
      merged.model = 'gemini-3.5-transcribe-live';
    }
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      } catch (err) {
        console.error('Failed to save config to localStorage:', err);
      }
    }
    return merged;
  }

  /**
   * Reset configuration to default values
   * @returns {Object}
   */
  static reset() {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (err) {}
    }
    return { ...DEFAULT_CONFIG };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DEFAULT_CONFIG,
    STORAGE_KEY,
    ConfigManager
  };
}
