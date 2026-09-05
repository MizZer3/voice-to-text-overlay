/**
 * Fast Translation Utility for Live Translate Mode
 * Uses Gemini REST API generateContent (gemini-2.5-flash with gemini-2.0-flash fallback)
 * Fast execution (~150-250ms), highly accurate simultaneous speech translation.
 */

/**
 * Translate spoken text into target language using Google Gemini REST API
 * @param {string} text - Spoken text to translate
 * @param {string} targetLanguage - Target language (e.g. 'English', 'Ukrainian', 'Polish')
 * @param {string} apiKey - Google AI Studio API key
 * @param {Function} [customFetch] - Optional custom fetch function for testing
 * @returns {Promise<string>} Translated text
 */
async function translateText(text, targetLanguage = 'English', apiKey = '', customFetch = null) {
  const trimmed = (text || '').trim();
  if (!trimmed || !apiKey || !apiKey.trim()) {
    return trimmed;
  }

  const fetchFn = customFetch || (typeof fetch !== 'undefined' ? fetch : (typeof globalThis !== 'undefined' ? globalThis.fetch : null));
  if (!fetchFn) {
    return trimmed;
  }

  const prompt = `You are a professional simultaneous interpreter.
Translate the following spoken text accurately and naturally into ${targetLanguage}.
Rules:
1. Output ONLY the raw translated text.
2. Do NOT add quotes, explanations, markdown formatting, or conversational remarks.
3. Preserve the speaker's tone, emphasis, and intent.

Text to translate:
${trimmed}`;

  const requestBody = {
    contents: [
      {
        parts: [{ text: prompt }]
      }
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 1024
    }
  };

  const modelsToTry = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];

  for (const model of modelsToTry) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey.trim())}`;
      const response = await fetchFn(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (response && response.ok) {
        const data = await response.json();
        const candidate = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (candidate && candidate.trim()) {
          const cleaned = candidate.trim().replace(/^["'«»„“]+|["'«»„“]+$/g, '').trim();
          return cleaned || candidate.trim();
        }
      }
    } catch (err) {
      // Continue to next model on error
    }
  }

  // Graceful fallback to original text if translation service is unreachable
  return trimmed;
}

if (typeof window !== 'undefined') {
  window.translateText = translateText;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    translateText
  };
}
