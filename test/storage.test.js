const { describe, it } = require('node:test');
const assert = require('node:assert');
const { DEFAULT_CONFIG, ConfigManager } = require('../src/storage.js');

describe('Storage and Configuration Tests', () => {
  it('DEFAULT_CONFIG should include all required user settings', () => {
    assert.strictEqual(typeof DEFAULT_CONFIG.apiKey, 'string');
    assert.strictEqual(DEFAULT_CONFIG.mode, 'smart_polish');
    assert.strictEqual(DEFAULT_CONFIG.targetLanguage, 'English');
    assert.strictEqual(DEFAULT_CONFIG.model, 'gemini-3.5-transcribe-live');
    assert.strictEqual(DEFAULT_CONFIG.recordingBehavior, 'toggle');
    assert.strictEqual(DEFAULT_CONFIG.autoCopy, true);
    assert.strictEqual(DEFAULT_CONFIG.alwaysOnTop, true);
    assert.strictEqual(DEFAULT_CONFIG.globalHotkey, 'Alt+Space');
    assert.strictEqual(typeof DEFAULT_CONFIG.vadThreshold, 'number');
    assert.strictEqual(typeof DEFAULT_CONFIG.silenceTimeoutMs, 'number');
  });

  it('ConfigManager.load should return default config when no storage exists', () => {
    const config = ConfigManager.load();
    assert.strictEqual(config.mode, 'smart_polish');
    assert.strictEqual(config.model, 'gemini-3.5-transcribe-live');
    assert.strictEqual(config.configVersion, 2);
  });

  it('ConfigManager should preserve deliberate user selection of models', () => {
    // Mock localStorage
    const mockStore = {};
    global.localStorage = {
      getItem: (key) => mockStore[key] || null,
      setItem: (key, val) => { mockStore[key] = String(val); },
      removeItem: (key) => { delete mockStore[key]; }
    };

    // User saves custom model
    ConfigManager.save({ model: 'models/custom-tuned-model', configVersion: 2 });
    const loadedCustom = ConfigManager.load();
    assert.strictEqual(loadedCustom.model, 'models/custom-tuned-model', 'Preserves user custom model');

    // Obsolete mode gets sanitized
    ConfigManager.save({ mode: 'dev_mode', configVersion: 2 });
    const loadedSanitized = ConfigManager.load();
    assert.strictEqual(loadedSanitized.mode, 'smart_polish', 'Sanitizes obsolete dev_mode to smart_polish');

    // Clean up
    delete global.localStorage;
  });

  it('ConfigManager should migrate legacy v1 config and deprecated 2.x models', () => {
    // Mock legacy v1 storage without configVersion
    const mockStore = {
      gemini_live_overlay_config_v1: JSON.stringify({
        model: 'gemini-2.0-flash-exp',
        mode: 'verbatim'
      })
    };
    global.localStorage = {
      getItem: (key) => mockStore[key] || null,
      setItem: (key, val) => { mockStore[key] = String(val); },
      removeItem: (key) => { delete mockStore[key]; }
    };

    const migrated = ConfigManager.load();
    assert.strictEqual(migrated.model, 'gemini-3.5-transcribe-live', 'Migrated legacy default to 3.5 transcribe live');
    assert.strictEqual(migrated.mode, 'verbatim', 'Preserved verbatim mode');
    assert.strictEqual(migrated.configVersion, 2);

    // Test deprecated 2.x and non-existent models
    const deprecatedModels = [
      'gemini-2.0-flash-realtime-exp',
      'gemini-2.0-flash-exp',
      'gemini-2.0-flash',
      'gemini-2.5-flash-preview',
      'gemini-3.5-live-translate',
      'models/gemini-2.0-flash',
      'gemini-2.0-flash-lite',
      'models/gemini-2.0-flash-realtime-exp',
      '',
      '   '
    ];
    for (const depModel of deprecatedModels) {
      ConfigManager.save({ model: depModel, configVersion: 2 });
      const loadedDep = ConfigManager.load();
      assert.strictEqual(loadedDep.model, 'gemini-3.5-transcribe-live', `Migrated deprecated model "${depModel}"`);
    }

    delete global.localStorage;
  });
});
