/**
 * System prompts and mode configurations for Gemini Live transcription
 */

const MODES = {
  smart_polish: {
    id: 'smart_polish',
    name: 'Чистовик (Smart Polish)',
    shortName: 'Чистовик',
    icon: '✨',
    description: 'Очищення від слів-паразитів, виправлення пунктуації та збереження змісту.',
    defaultModel: 'gemini-3.5-transcribe-live',
    systemPrompt: `You are an elite real-time speech polish and transcription engine.
Your job is to transcribe the spoken audio cleanly into polished, clear, written text while strictly preserving the speaker's original meaning, intent, and vocabulary.
Rules:
1. Remove speech fillers, hesitations, and stutters (e.g., in Ukrainian: 'е-е', 'ну', 'типу', 'як би', 'короче', 'значить', 'от'; in English: 'um', 'uh', 'like', 'you know', 'sort of').
2. Fix broken sentence fragments into coherent, grammatical sentences.
3. Apply accurate punctuation, capitalization, and logical paragraphs.
4. Do NOT answer questions or engage in conversation.
5. Output ONLY the polished transcription. Never prepend prefixes like 'Transcript:' or 'Here is...'.
6. Language Preservation: Output strictly in the configured language. Never translate unless in translation mode.
7. If there is silence, background noise, or no clear speech, output absolutely NOTHING.`
  },

  verbatim: {
    id: 'verbatim',
    name: 'Дослівна стенограма (Verbatim)',
    shortName: 'Стенограма',
    icon: '📝',
    description: 'Точна транскрипція слово в слово без жодних змін чи пропусків.',
    defaultModel: 'gemini-3.5-transcribe-live',
    systemPrompt: `You are an ultra-accurate real-time speech-to-text transcription engine.
Your single job is to transcribe the user's spoken audio verbatim, word for word.
Strict Rules:
1. Do NOT answer questions, do NOT converse, do NOT add filler words or remarks.
2. Output ONLY the transcribed words spoken by the user.
3. Transcribe in the exact language configured. Never translate or switch to another language.
4. Add basic capitalization and standard punctuation where pauses occur, but do NOT alter or rephrase any words.
5. If there is background noise, silence, or non-speech sounds, output absolutely NOTHING.`
  },

  live_translate: {
    id: 'live_translate',
    name: 'Переклад наживо (Live Translate)',
    shortName: 'Переклад',
    icon: '🌐',
    description: 'Миттєвий переклад вимовного мовлення на обрану мову (за замовчуванням — англійська).',
    defaultModel: 'gemini-3.5-transcribe-live',
    systemPrompt: (targetLang = 'English') => `You are a professional real-time simultaneous speech interpreter.
Your job is to listen to the user's speech and translate it immediately and accurately into ${targetLang}.
Rules:
1. Translate the spoken thoughts directly into high quality, fluent ${targetLang}.
2. Preserve the speaker's tone, emphasis, and intent.
3. Do NOT engage in conversation, do NOT explain translations.
4. Output ONLY the translated text in ${targetLang}.
5. If there is silence or only background noise, output absolutely NOTHING.`
  }
};

const DEFAULT_MODELS = [
  { id: 'gemini-3.5-transcribe-live', name: 'Gemini 3.5 Transcribe Live (ШІ Транскрипція та Переклад)', recommendedFor: ['smart_polish', 'verbatim', 'live_translate'] },
  { id: 'gemini-3.5-live-translate-preview', name: 'Gemini 3.5 Live Translate (Аудіо-перекладач)', recommendedFor: ['live_translate'] }
];

const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English (Англійська)' },
  { code: 'uk', name: 'Ukrainian (Українська)' },
  { code: 'pl', name: 'Polish (Польська)' },
  { code: 'de', name: 'German (Німецька)' },
  { code: 'fr', name: 'French (Французька)' },
  { code: 'es', name: 'Spanish (Іспанська)' },
  { code: 'it', name: 'Italian (Італійська)' },
  { code: 'pt', name: 'Portuguese (Португальська)' },
  { code: 'ja', name: 'Japanese (Японська)' },
  { code: 'zh', name: 'Chinese (Китайська)' }
];

const SUPPORTED_SPOKEN_LANGUAGES = [
  { code: 'uk', name: '🇺🇦 Тільки Українська (Жорстке блокування інших мов)', flag: '🇺🇦' },
  { code: 'en', name: '🇬🇧 Only English (Strict lock)', flag: '🇬🇧' },
  { code: 'pl', name: '🇵🇱 Tylko Polski (Strict lock)', flag: '🇵🇱' },
  { code: 'de', name: '🇩🇪 Nur Deutsch (Strict lock)', flag: '🇩🇪' },
  { code: 'es', name: '🇪🇸 Sólo Español (Strict lock)', flag: '🇪🇸' },
  { code: 'auto', name: '🌐 Автовизначення (Auto-detect)', flag: '🌐' }
];

const SPOKEN_LANG_DIRECTIVES = {
  uk: `MANDATORY SINGLE-LANGUAGE LOCK: UKRAINIAN (УКРАЇНСЬКА МОВА) ONLY.
YOU ARE CONFIGURED EXCLUSIVELY AS A UKRAINIAN SPEECH TRANSCRIBER.
THE SPEAKER IS SPEAKING UKRAINIAN.
CRITICAL ENFORCEMENT RULES:
1. ZERO-TOLERANCE FOR POLISH OR RUSSIAN: Under NO circumstances should you ever output Polish (język polski), Russian, or any other language.
2. POLISH IS STRICTLY FORBIDDEN: Never output Polish words (such as "tak", "dobrze", "dzień", "co", "jest", "bardzo", "proszę", "nie", "się", "dla", "chcę", "może", "kiedy", "gdzie") or Polish Latin diacritics (ą, ć, ę, ł, ń, ó, ś, ź, ż).
3. If any spoken word, syllable, or sound phonetically resembles Polish or Russian, you MUST FORCEFULLY interpret and transcribe it as the corresponding Ukrainian word in Ukrainian Cyrillic (e.g. "так", "добре", "день", "що", "є", "дуже", "прошу", "ні", "для", "хочу", "може", "коли", "де").
4. ALL output text MUST be written 100% in the Ukrainian Cyrillic alphabet (а-я, і, ї, є, ґ). Only widely recognized international brand or tech names (e.g., Discord, Google, Windows) may appear in Latin.
5. DO NOT ATTEMPT TO AUTO-DETECT OR SWITCH LANGUAGES. The user is speaking Ukrainian. Transcribe strictly in Ukrainian.
6. If the audio is unclear, output NOTHING. Never guess in Polish or another language.`,
  en: `MANDATORY SINGLE-LANGUAGE LOCK: ENGLISH ONLY.
YOU ARE CONFIGURED EXCLUSIVELY AS AN ENGLISH SPEECH TRANSCRIBER.
THE SPEAKER IS SPEAKING ENGLISH.
Transcribe and process all spoken audio strictly in English using standard English spelling.`,
  pl: `MANDATORY SINGLE-LANGUAGE LOCK: POLISH (JĘZYK POLSKI) ONLY.
YOU ARE CONFIGURED EXCLUSIVELY AS A POLISH SPEECH TRANSCRIBER.
THE SPEAKER IS SPEAKING POLISH.
Transcribe and process all spoken audio strictly in Polish with proper Polish diacritics (ą, ć, ę, ł, ń, ó, ś, ź, ż).`,
  de: `MANDATORY SINGLE-LANGUAGE LOCK: GERMAN (DEUTSCH) ONLY.
YOU ARE CONFIGURED EXCLUSIVELY AS A GERMAN SPEECH TRANSCRIBER.
THE SPEAKER IS SPEAKING GERMAN.
Transcribe and process all spoken audio strictly in German with proper umlauts and capitalization.`,
  es: `MANDATORY SINGLE-LANGUAGE LOCK: SPANISH (ESPAÑOL) ONLY.
YOU ARE CONFIGURED EXCLUSIVELY AS A SPANISH SPEECH TRANSCRIBER.
THE SPEAKER IS SPEAKING SPANISH.
Transcribe and process all spoken audio strictly in Spanish.`,
  auto: `SPOKEN LANGUAGE DIRECTIVE:
- Detect the spoken language automatically.
- Output text in the exact language spoken by the user without translating.`
};

/**
 * Get system prompt for a given mode and options
 * @param {string} modeId
 * @param {Object} [options]
 * @returns {string}
 */
function getSystemPrompt(modeId, options = {}) {
  const mode = MODES[modeId] || MODES.smart_polish;
  let basePrompt = '';
  if (typeof mode.systemPrompt === 'function') {
    basePrompt = mode.systemPrompt(options.targetLanguage || 'English');
  } else {
    basePrompt = mode.systemPrompt;
  }

  let prompt = '';
  // Prepend spoken language lock as the top priority directive for transcription modes
  if (modeId === 'smart_polish' || modeId === 'verbatim') {
    const lang = options.spokenLanguage || 'uk';
    const directive = SPOKEN_LANG_DIRECTIVES[lang] || SPOKEN_LANG_DIRECTIVES.uk;
    if (directive) {
      prompt = `${directive}\n\n${basePrompt}`;
    } else {
      prompt = basePrompt;
    }
  } else {
    prompt = basePrompt;
  }

  if (options.customInstructions && options.customInstructions.trim()) {
    prompt += `\n\nUser Custom Instructions:\n${options.customInstructions.trim()}`;
  }
  return prompt;
}

if (typeof module !== 'undefined' && module.exports) {
  let cleanSmartPolish;
  try {
    cleanSmartPolish = require('./text-cleaner.js').cleanSmartPolish;
  } catch (e) {}
  module.exports = {
    MODES,
    DEFAULT_MODELS,
    SUPPORTED_LANGUAGES,
    SUPPORTED_SPOKEN_LANGUAGES,
    SPOKEN_LANG_DIRECTIVES,
    getSystemPrompt,
    cleanSmartPolish
  };
}
