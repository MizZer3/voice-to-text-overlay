const { describe, it } = require('node:test');
const assert = require('node:assert');
const { translateText } = require('../src/fast-translator.js');

describe('Fast Translator Unit Tests', () => {
  it('should return empty or non-string input safely without calling API', async () => {
    let fetchCalled = false;
    const mockFetch = async () => {
      fetchCalled = true;
    };

    assert.strictEqual(await translateText('', 'English', 'fake-key', mockFetch), '');
    assert.strictEqual(await translateText('   ', 'English', 'fake-key', mockFetch), '');
    assert.strictEqual(await translateText(null, 'English', 'fake-key', mockFetch), '');
    assert.strictEqual(fetchCalled, false);
  });

  it('should return original text if API key is missing', async () => {
    let fetchCalled = false;
    const mockFetch = async () => {
      fetchCalled = true;
    };

    assert.strictEqual(await translateText('Привіт', 'English', '', mockFetch), 'Привіт');
    assert.strictEqual(await translateText('Привіт', 'English', '   ', mockFetch), 'Привіт');
    assert.strictEqual(fetchCalled, false);
  });

  it('should translate successfully using primary model (gemini-3.5-flash-lite)', async () => {
    const urlsCalled = [];
    const mockFetch = async (url, options) => {
      urlsCalled.push(url);
      return {
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: 'Hello, how are you?' }]
              }
            }
          ]
        })
      };
    };

    const result = await translateText('Привіт, як справи?', 'English', 'test-api-key', mockFetch);
    assert.strictEqual(result, 'Hello, how are you?');
    assert.strictEqual(urlsCalled.length, 1);
    assert.ok(urlsCalled[0].includes('gemini-3.5-flash-lite'));
    assert.ok(urlsCalled[0].includes('key=test-api-key'));
  });

  it('should fallback to secondary model (gemini-3.1-flash-lite) if primary model fails', async () => {
    const urlsCalled = [];
    const mockFetch = async (url, options) => {
      urlsCalled.push(url);
      if (url.includes('gemini-3.5-flash-lite')) {
        return {
          ok: false,
          status: 404
        };
      }
      return {
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: 'Good morning' }]
              }
            }
          ]
        })
      };
    };

    const result = await translateText('Доброго ранку', 'English', 'test-api-key', mockFetch);
    assert.strictEqual(result, 'Good morning');
    assert.strictEqual(urlsCalled.length, 2);
    assert.ok(urlsCalled[0].includes('gemini-3.5-flash-lite'));
    assert.ok(urlsCalled[1].includes('gemini-3.1-flash-lite'));
  });

  it('should return original text gracefully if all models or network fail', async () => {
    const mockFetch = async () => {
      throw new Error('Network offline');
    };

    const original = 'Текст для перекладу';
    const result = await translateText(original, 'English', 'test-api-key', mockFetch);
    assert.strictEqual(result, original);
  });

  it('should strip surrounding quotes from translated candidate', async () => {
    const mockFetch = async () => ({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: '"Hello, how are you?"' }]
            }
          }
        ]
      })
    });

    const result = await translateText('Як справи?', 'English', 'test-key', mockFetch);
    assert.strictEqual(result, 'Hello, how are you?');
  });

  it('should return original text if all models in queue fail', async () => {
    const urlsCalled = [];
    const mockFetch = async (url) => {
      urlsCalled.push(url);
      return { ok: false, status: 503 };
    };

    const result = await translateText('Добрий вечір', 'English', 'test-key', mockFetch);
    assert.strictEqual(result, 'Добрий вечір');
    assert.strictEqual(urlsCalled.length, 2);
    assert.ok(urlsCalled[0].includes('gemini-3.5-flash-lite'));
    assert.ok(urlsCalled[1].includes('gemini-3.1-flash-lite'));
  });
});
