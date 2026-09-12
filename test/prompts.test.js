const { describe, it } = require('node:test');
const assert = require('node:assert');
const { MODES, SUPPORTED_LANGUAGES, getSystemPrompt } = require('../src/prompts.js');

describe('Prompts and Modes Configuration Tests', () => {
  it('should define exactly the 3 simplified modes and default models', () => {
    assert.ok(MODES.smart_polish, 'Smart polish mode exists');
    assert.ok(MODES.verbatim, 'Verbatim mode exists');
    assert.ok(MODES.live_translate, 'Live translate mode exists');

    // Obsolete modes removed
    assert.strictEqual(MODES.bullets, undefined, 'Bullets mode removed');
    assert.strictEqual(MODES.summary, undefined, 'Summary mode removed');
    assert.strictEqual(MODES.dev_mode, undefined, 'Dev mode removed');
    assert.strictEqual(MODES.assistant, undefined, 'Assistant mode removed');

    assert.strictEqual(Object.keys(MODES).length, 3, 'Only 3 modes configured');

    // Check default models
    assert.strictEqual(MODES.smart_polish.defaultModel, 'gemini-3.5-transcribe-live');
    assert.strictEqual(MODES.verbatim.defaultModel, 'gemini-3.5-transcribe-live');
    assert.strictEqual(MODES.live_translate.defaultModel, 'gemini-3.5-transcribe-live');
  });

  it('getSystemPrompt should return verbatim prompt strictly forbidding conversational replies', () => {
    const prompt = getSystemPrompt('verbatim');
    assert.ok(prompt.includes('verbatim'));
    assert.ok(prompt.includes('ONLY'));
  });

  it('getSystemPrompt should enforce language preservation in transcription modes', () => {
    const polishPrompt = getSystemPrompt('smart_polish');
    assert.ok(polishPrompt.toLowerCase().includes('preserve the exact language') || polishPrompt.includes('language'));

    const verbatimPrompt = getSystemPrompt('verbatim');
    assert.ok(verbatimPrompt.includes('Transcribe in the exact language'));
  });

  it('getSystemPrompt should customize live translate with target language', () => {
    const englishPrompt = getSystemPrompt('live_translate', { targetLanguage: 'English' });
    assert.ok(englishPrompt.includes('English'));

    const polishPrompt = getSystemPrompt('live_translate', { targetLanguage: 'Polish' });
    assert.ok(polishPrompt.includes('Polish'));
  });

  it('getSystemPrompt should append custom user instructions if provided', () => {
    const prompt = getSystemPrompt('smart_polish', { customInstructions: 'Always use formal tone.' });
    assert.ok(prompt.includes('Always use formal tone.'));
  });

  it('SUPPORTED_LANGUAGES should include major international and local languages', () => {
    const codes = SUPPORTED_LANGUAGES.map(l => l.code);
    assert.ok(codes.includes('en'));
    assert.ok(codes.includes('uk'));
    assert.ok(codes.includes('pl'));
    assert.ok(codes.includes('de'));
  });

  it('DEFAULT_MODELS should list Gemini 3.5 Transcribe Live and Gemini 3.5 Live Translate, excluding obsolete 2.x models', () => {
    const { DEFAULT_MODELS } = require('../src/prompts.js');
    assert.ok(Array.isArray(DEFAULT_MODELS));
    assert.strictEqual(DEFAULT_MODELS.length, 2, 'Should contain 2 active presets');
    const modelIds = DEFAULT_MODELS.map(m => m.id);
    assert.ok(modelIds.includes('gemini-3.5-transcribe-live'), 'Includes gemini-3.5-transcribe-live');
    assert.ok(modelIds.includes('gemini-3.5-live-translate-preview'), 'Includes gemini-3.5-live-translate-preview');
    assert.strictEqual(modelIds.includes('gemini-3.5-live-translate'), false, 'gemini-3.5-live-translate without -preview must be excluded');
    assert.strictEqual(modelIds.includes('gemini-2.0-flash-realtime-exp'), false);
    assert.strictEqual(modelIds.includes('gemini-2.0-flash-exp'), false);
    assert.strictEqual(modelIds.includes('gemini-2.0-flash'), false);
    assert.strictEqual(modelIds.includes('gemini-2.5-flash-preview'), false);
    assert.strictEqual(modelIds.some(id => id.startsWith('gemini-2.')), false, 'No 2.x models should be present');
  });

  it('getSystemPrompt should inject strong Ukrainian spoken language directive by default', () => {
    const defaultPrompt = getSystemPrompt('smart_polish');
    assert.ok(defaultPrompt.includes('MANDATORY SINGLE-LANGUAGE LOCK: UKRAINIAN'));
    assert.ok(defaultPrompt.includes('UKRAINIAN'));
    assert.ok(defaultPrompt.includes('POLISH IS STRICTLY FORBIDDEN'));
    assert.ok(defaultPrompt.includes('і, ї, є, ґ'));

    const explicitUkPrompt = getSystemPrompt('verbatim', { spokenLanguage: 'uk' });
    assert.ok(explicitUkPrompt.includes('MANDATORY SINGLE-LANGUAGE LOCK: UKRAINIAN'));
    assert.ok(explicitUkPrompt.includes('UKRAINIAN'));
  });

  it('getSystemPrompt should support English, Polish, German, Spanish and Auto spoken languages', () => {
    const enPrompt = getSystemPrompt('smart_polish', { spokenLanguage: 'en' });
    assert.ok(enPrompt.includes('ENGLISH'));

    const plPrompt = getSystemPrompt('verbatim', { spokenLanguage: 'pl' });
    assert.ok(plPrompt.includes('POLISH'));

    const autoPrompt = getSystemPrompt('smart_polish', { spokenLanguage: 'auto' });
    assert.ok(autoPrompt.includes('Detect the spoken language automatically'));
  });

  it('SUPPORTED_SPOKEN_LANGUAGES should export available spoken language options', () => {
    const { SUPPORTED_SPOKEN_LANGUAGES } = require('../src/prompts.js');
    assert.ok(Array.isArray(SUPPORTED_SPOKEN_LANGUAGES));
    const codes = SUPPORTED_SPOKEN_LANGUAGES.map(l => l.code);
    assert.ok(codes.includes('uk'));
    assert.ok(codes.includes('en'));
    assert.ok(codes.includes('pl'));
    assert.ok(codes.includes('auto'));
  });
});
