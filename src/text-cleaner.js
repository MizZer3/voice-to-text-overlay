/**
 * Intelligent text cleaner and polisher for Smart Polish mode
 * Cleans speech fillers, vocal pauses, word stutters, and normalizes punctuation/capitalization.
 */

/**
 * Detect if text contains distinct Polish characters, Cyrillic phonetic Polish transliterations,
 * or typical Polish vocabulary.
 * @param {string} text
 * @returns {boolean}
 */
function hasPolishIndicators(text) {
  if (!text || typeof text !== 'string') return false;
  // Distinctive Polish Latin letters
  if (/[ąćęłńśźżĄĆĘŁŃŚŹŻ]/.test(text)) return true;
  // Distinctive Polish words (Latin and Cyrillic transliterations)
  const polishIndicatorsRegex = /(?<!\p{L})(?:dzień|dobry|dobrze|proszę|prosze|dziękuję|dziekuje|bardzo|przepraszam|oczywiście|oczywiscie|nie\s+wiem|jak\s+się\s+masz|jak\s+sie\s+masz|co\s+tam\s+słychać|jestem|jesteś|jestes|chcę|chce|chciałbym|będzie|bedzie|będziemy|będą|człowiek|ludzie|dlaczego|kiedy|teraz|wszystko|to\s+jest|nie\s+rozumiem|słucham|mówię|pamiętam|naprawdę|życie|szczęście|dziecko|dzieci|pieniądze|бардзо|дзєнь|дзень|пшепрашам|перепрашам|проше|дзєкую|дзенкую|цо\s+то|цось|людзє|єстем|панство)(?!\p{L})/iu;
  return polishIndicatorsRegex.test(text);
}

/**
 * Filter and convert accidental Polish/foreign hallucinations into proper Ukrainian
 * when the Ukrainian language lock is active.
 * @param {string} text
 * @param {string} [spokenLanguage='uk']
 * @returns {string}
 */
function filterLanguageLock(text, spokenLanguage = 'uk') {
  if (!text || typeof text !== 'string') return '';
  if (spokenLanguage !== 'uk') return text;

  let filtered = text;

  // 1. Common Polish multi-word expressions -> Ukrainian
  const polishMultiWordMap = [
    [/(?<!\p{L})(?:dzień\s+dobry|dzien\s+dobry|дзєнь\s+добри|дзень\s+добри)(?!\p{L})/giu, 'добрий день'],
    [/(?<!\p{L})(?:dobry\s+wieczór|dobry\s+wieczor|добри\s+вечор)(?!\p{L})/giu, 'добрий вечір'],
    [/(?<!\p{L})(?:jak\s+się\s+masz|jak\s+sie\s+masz|co\s+tam\s+słychać|co\s+tam\s+slychac|як\s+сє\s+маш|як\s+се\s+маш)(?!\p{L})/giu, 'як справи'],
    [/(?<!\p{L})(?:nie\s+wiem|нє\s+вєм|не\s+вєм)(?!\p{L})/giu, 'не знаю'],
    [/(?<!\p{L})(?:nie\s+rozumiem)(?!\p{L})/giu, 'не розумію'],
    [/(?<!\p{L})(?:to\s+jest|то\s+єст)(?!\p{L})/giu, 'це'],
    [/(?<!\p{L})(?:wszystko\s+w\s+porządku|wszystko\s+w\s+porzadku)(?!\p{L})/giu, 'все гаразд'],
    [/(?<!\p{L})(?:цо\s+то\s+єст|цо\s+то\s+є)(?!\p{L})/giu, 'що це'],
    [/(?<!\p{L})(?:проше\s+бардзо)(?!\p{L})/giu, 'будь ласка'],
    [/(?<!\p{L})(?:може\s+биць)(?!\p{L})/giu, 'може бути'],
    [/(?<!\p{L})(?:bardzo\s+dobrze|бардзо\s+добже|бардзо\s+добре)(?!\p{L})/giu, 'дуже добре'],
    [/(?<!\p{L})(?:dziękuję\s+bardzo|dziekuje\s+bardzo|бардзо\s+дзєкую)(?!\p{L})/giu, 'дякую дуже'],
    [/(?<!\p{L})(?:za\s+pomoc|za\s+pomocą)(?!\p{L})/giu, 'за допомогу']
  ];

  for (const [regex, replacement] of polishMultiWordMap) {
    filtered = filtered.replace(regex, replacement);
  }

  // 2. Cyrillic phonetic Polish transliterations -> standard Ukrainian
  const cyrillicPolishMap = [
    [/(?<!\p{L})бардзо(?!\p{L})/giu, 'дуже'],
    [/(?<!\p{L})пшепрашам(?!\p{L})/giu, 'вибачте'],
    [/(?<!\p{L})перепрашам(?!\p{L})/giu, 'перепрошую'],
    [/(?<!\p{L})проше(?!\p{L})/giu, 'прошу'],
    [/(?<!\p{L})дзєкую(?!\p{L})/giu, 'дякую'],
    [/(?<!\p{L})дзенкую(?!\p{L})/giu, 'дякую'],
    [/(?<!\p{L})цось(?!\p{L})/giu, 'щось'],
    [/(?<!\p{L})цо(?!\p{L})/giu, 'що'],
    [/(?<!\p{L})гдзє(?!\p{L})/giu, 'де'],
    [/(?<!\p{L})хце(?!\p{L})/giu, 'хочу'],
    [/(?<!\p{L})встистко(?!\p{L})/giu, 'все'],
    [/(?<!\p{L})вшистко(?!\p{L})/giu, 'все'],
    [/(?<!\p{L})ніц(?!\p{L})/giu, 'нічого'],
    [/(?<!\p{L})єстем(?!\p{L})/giu, 'я є'],
    [/(?<!\p{L})людзє(?!\p{L})/giu, 'люди'],
    [/(?<!\p{L})дзєцько(?!\p{L})/giu, 'дитина'],
    [/(?<!\p{L})дзєци(?!\p{L})/giu, 'діти'],
    [/(?<!\p{L})панство(?!\p{L})/giu, 'панове']
  ];

  for (const [regex, replacement] of cyrillicPolishMap) {
    filtered = filtered.replace(regex, replacement);
  }

  // 3. Single Polish words with Polish diacritics or distinctive vocabulary -> Ukrainian
  const polishSingleWordMap = [
    [/(?<!\p{L})(?:proszę|prosze)(?!\p{L})/giu, 'будь ласка'],
    [/(?<!\p{L})(?:dziękuję|dziekuje)(?!\p{L})/giu, 'дякую'],
    [/(?<!\p{L})(?:dobrze)(?!\p{L})/giu, 'добре'],
    [/(?<!\p{L})(?:bardzo)(?!\p{L})/giu, 'дуже'],
    [/(?<!\p{L})(?:przepraszam)(?!\p{L})/giu, 'вибачте'],
    [/(?<!\p{L})(?:oczywiście|oczywiscie)(?!\p{L})/giu, 'звісно'],
    [/(?<!\p{L})(?:jestem)(?!\p{L})/giu, 'я є'],
    [/(?<!\p{L})(?:jesteś|jestes)(?!\p{L})/giu, 'ти є'],
    [/(?<!\p{L})(?:chcę|chce)(?!\p{L})/giu, 'хочу'],
    [/(?<!\p{L})(?:chciałbym|chcialbym)(?!\p{L})/giu, 'я хотів би'],
    [/(?<!\p{L})(?:będzie|bedzie)(?!\p{L})/giu, 'буде'],
    [/(?<!\p{L})(?:będziemy|bedziemy)(?!\p{L})/giu, 'будемо'],
    [/(?<!\p{L})(?:będą|beda)(?!\p{L})/giu, 'будуть'],
    [/(?<!\p{L})(?:mamy)(?!\p{L})/giu, 'маємо'],
    [/(?<!\p{L})(?:macie)(?!\p{L})/giu, 'маєте'],
    [/(?<!\p{L})(?:masz)(?!\p{L})/giu, 'маєш'],
    [/(?<!\p{L})(?:człowiek|czlowiek)(?!\p{L})/giu, 'людина'],
    [/(?<!\p{L})(?:ludzie)(?!\p{L})/giu, 'люди'],
    [/(?<!\p{L})(?:dlaczego)(?!\p{L})/giu, 'чому'],
    [/(?<!\p{L})(?:kiedy)(?!\p{L})/giu, 'коли'],
    [/(?<!\p{L})(?:gdzie)(?!\p{L})/giu, 'де'],
    [/(?<!\p{L})(?:teraz)(?!\p{L})/giu, 'зараз'],
    [/(?<!\p{L})(?:wszystko)(?!\p{L})/giu, 'все'],
    [/(?<!\p{L})(?:słucham|slucham)(?!\p{L})/giu, 'слухаю'],
    [/(?<!\p{L})(?:mówię|mowie)(?!\p{L})/giu, 'говорю'],
    [/(?<!\p{L})(?:widzę|widze)(?!\p{L})/giu, 'бачу'],
    [/(?<!\p{L})(?:wiem)(?!\p{L})/giu, 'знаю'],
    [/(?<!\p{L})(?:pamiętam|pamietam)(?!\p{L})/giu, 'пам\'ятаю'],
    [/(?<!\p{L})(?:naprawdę|naprawde)(?!\p{L})/giu, 'справді'],
    [/(?<!\p{L})(?:życie|zycie)(?!\p{L})/giu, 'життя'],
    [/(?<!\p{L})(?:szczęście|szczescie)(?!\p{L})/giu, 'щастя'],
    [/(?<!\p{L})(?:dziecko)(?!\p{L})/giu, 'дитина'],
    [/(?<!\p{L})(?:dzieci)(?!\p{L})/giu, 'діти'],
    [/(?<!\p{L})(?:pieniądze|pieniadze)(?!\p{L})/giu, 'гроші'],
    [/(?<!\p{L})(?:pięć|piec)(?!\p{L})/giu, 'п\'ять'],
    [/(?<!\p{L})(?:sześć|szesc)(?!\p{L})/giu, 'шість']
  ];

  for (const [regex, replacement] of polishSingleWordMap) {
    filtered = filtered.replace(regex, replacement);
  }

  // 4. If text contains Polish context, convert common particles
  if (/[ąćęłńśźżĄĆĘŁŃŚŹŻ]/.test(text) || /(?<!\p{L})(?:się|sie|jest|dla|ale|oraz|tylko|przez|może|moze)(?!\p{L})/iu.test(text)) {
    filtered = filtered.replace(/(?<!\p{L})(?:się|sie)(?!\p{L})/giu, '');
    filtered = filtered.replace(/(?<!\p{L})jest(?!\p{L})/giu, 'є');
    filtered = filtered.replace(/(?<!\p{L})co(?!\p{L})/giu, 'що');
    filtered = filtered.replace(/(?<!\p{L})jak(?!\p{L})/giu, 'як');
    filtered = filtered.replace(/(?<!\p{L})ale(?!\p{L})/giu, 'але');
    filtered = filtered.replace(/(?<!\p{L})dla(?!\p{L})/giu, 'для');
    filtered = filtered.replace(/(?<!\p{L})przez(?!\p{L})/giu, 'через');
    filtered = filtered.replace(/(?<!\p{L})tylko(?!\p{L})/giu, 'лише');
    filtered = filtered.replace(/(?<!\p{L})może(?!\p{L})/giu, 'може');
    filtered = filtered.replace(/(?<!\p{L})tak(?!\p{L})/giu, 'так');
    filtered = filtered.replace(/(?<!\p{L})nie(?!\p{L})/giu, 'ні');
  }

  // 5. Clean up any remaining isolated Polish letters that shouldn't exist in Ukrainian
  filtered = filtered.replace(/[ąćęłńśźżĄĆĘŁŃŚŹŻ]/g, '');

  return filtered.replace(/[ \t]+/g, ' ').trim();
}

/**
 * Clean and polish transcription text for smart_polish mode
 * @param {string} text - Raw speech-to-text transcription
 * @param {string} [spokenLanguage='uk'] - Active spoken language configuration
 * @returns {string} Polished text
 */
function cleanSmartPolish(text, spokenLanguage = 'uk') {
  if (!text || typeof text !== 'string') return '';

  let cleaned = filterLanguageLock(text, spokenLanguage);

  // 1. Remove vocal pauses and vocalizations (Ukrainian, Russian, English)
  // E.g.: "е-е-е", "е-е", "еее", "ее", "є-є", "єєє", "єє", "а-а", "ааа", "ммм", "мм", "гм", "хм", "um", "uh", "er", "erm", "hmm"
  // Using Unicode-aware word boundaries (?<!\p{L}) and (?!\p{L})
  const vocalPausesRegex = /(?<!\p{L})(?:[еeє][\-–—][еeє](?:[\-–—][еeє])?|[еeє]{2,}|[аa]{2,}|[мm]{2,}|гм|хм|uhm?|um|er|erm|ah{1,2}|hmm?)(?!\p{L})/giu;
  cleaned = cleaned.replace(vocalPausesRegex, '');

  // Standalone single-letter vocal pause "е" (Ukrainian/Russian filler, not a word)
  cleaned = cleaned.replace(/(?<!\p{L})[еe](?!\p{L})/giu, '');

  // 2. Remove multi-word filler phrases
  // E.g.: "короче кажучи", "коротше кажучи", "як би", "так би мовити", "you know", "sort of", "kind of"
  const fillerPhrases = [
    /(?<!\p{L})(?:короче\s+кажучи|коротше\s+кажучи|як\s+би|так\s+би\s+мовити|you\s+know|sort\s+of|kind\s+of)(?!\p{L})/giu
  ];
  for (const phraseRegex of fillerPhrases) {
    cleaned = cleaned.replace(phraseRegex, '');
  }

  // English filler "like" (parenthetical or conversational hesitation: "like, ", ", like,", ", like ")
  cleaned = cleaned.replace(/(^|[.!?]\s*)like\s*,\s*/giu, '$1');
  cleaned = cleaned.replace(/,\s*like\s*(?=,|[.!?]|\s)/giu, '');
  cleaned = cleaned.replace(/\s+like\s*,\s*/giu, ' ');

  // 3. Remove single-word conversational fillers when used as hesitation markers
  // Ukrainian: "ну", "типу", "короче", "коротше", "значить"
  cleaned = cleaned.replace(/(?<!\p{L})(?:ну|типу|короче|коротше|значить)(?!\p{L})/giu, '');

  // Standalone introductory "от" at beginning of phrase/sentence: "от я думаю" -> "я думаю"
  cleaned = cleaned.replace(/(^|[.!?]\s*)(?<!\p{L})от\s+/giu, '$1');

  // 4. Remove accidental word stutters and immediate repetitions
  // E.g. "я я пішов" -> "я пішов", "ми, ми" -> "ми", "the the" -> "the"
  cleaned = cleaned.replace(/(?<!\p{L})(\p{L}+)(?:[\s,]+\1(?!\p{L}))+/giu, '$1');

  // Stuttering with hyphens: "п-пішов" -> "пішов", "я-я" -> "я"
  cleaned = cleaned.replace(/(?<!\p{L})(\p{L})[\-–—](\p{L}+)(?!\p{L})/giu, (match, p1, p2) => {
    if (p2.toLowerCase().startsWith(p1.toLowerCase())) {
      return p2;
    }
    return match;
  });

  // Deduplicate identical consecutive sentences or clauses (e.g. "Привіт, як справи? Привіт, як справи?")
  cleaned = cleaned.replace(/([^.!?]+[.!?]+)\s*(?:\1\s*)+/giu, '$1 ');

  // Deduplicate repeated multi-word phrases (e.g. "У мене У мене" -> "У мене", "добре. Добре." -> "Добре.")
  const words = cleaned.trim().split(/\s+/);
  if (words.length >= 2) {
    const outWords = [];
    for (let i = 0; i < words.length; ) {
      let foundRepeat = false;
      for (let len = Math.min(6, Math.floor((words.length - i) / 2)); len >= 1; len--) {
        const phrase1 = words.slice(i, i + len).join(' ').toLowerCase().replace(/[.,!?:;]+$/, '');
        const phrase2 = words.slice(i + len, i + 2 * len).join(' ').toLowerCase().replace(/[.,!?:;]+$/, '');
        if (phrase1 && phrase1 === phrase2) {
          i += len;
          foundRepeat = true;
          break;
        }
      }
      if (!foundRepeat) {
        outWords.push(words[i]);
        i++;
      }
    }
    cleaned = outWords.join(' ');
  }

  // 5. Punctuation and spacing cleanup
  // Remove dangling leading punctuation like commas or semicolons
  cleaned = cleaned.replace(/^[,\s;:–—\-]+/, '');

  // Collapse dangling commas before sentence terminators
  cleaned = cleaned.replace(/,\s*([.!?])/g, '$1');
  // Collapse consecutive commas
  cleaned = cleaned.replace(/,\s*,+/g, ',');
  // Remove space before punctuation marks
  cleaned = cleaned.replace(/\s+([.,!?:;])/g, '$1');
  // Ensure space after punctuation if immediately followed by a Unicode letter
  cleaned = cleaned.replace(/([.,!?:;])(?=[\p{L}])/gu, '$1 ');

  // Collapse duplicate whitespace
  cleaned = cleaned.replace(/[ \t]+/g, ' ').trim();

  // 6. Capitalize first letter of each sentence
  cleaned = cleaned.replace(/(^|[.!?]\s+)([\p{L}])/gu, (match, prefix, letter) => {
    return prefix + letter.toUpperCase();
  });

  return cleaned.trim();
}

/**
 * Extract newly spoken speech from Google's raw audio stream relative to a checkpoint.
 * Ensures manual edits made by the user in transcriptBox are not corrupted by previous audio transcripts.
 * @param {string} rawStream - Current cumulative transcript from Gemini Live
 * @param {string} rawCheckpoint - Raw transcript recorded at the moment of user edit
 * @returns {string} Only the new speech words spoken after checkpoint
 */
function extractNewSpeech(rawStream, rawCheckpoint) {
  const raw = (rawStream || '').trim();
  const checkpoint = (rawCheckpoint || '').trim();
  if (!checkpoint) return raw;
  if (!raw) return '';

  // 1. Direct prefix match (fast path)
  if (raw.toLowerCase().startsWith(checkpoint.toLowerCase())) {
    const after = raw.slice(checkpoint.length);
    if (!after || /^\s/.test(after)) {
      return after.trim();
    }
  }

  const checkWords = checkpoint.toLowerCase().split(/\s+/).filter(Boolean);
  const rawWords = raw.split(/\s+/).filter(Boolean);
  const rawWordsLower = raw.toLowerCase().split(/\s+/).filter(Boolean);

  // 2. Word-by-word prefix alignment
  let matchCount = 0;
  const maxCheck = Math.min(checkWords.length, rawWords.length);

  for (let i = 0; i < maxCheck; i++) {
    const wCheck = checkWords[i].replace(/[.,!?:;«»"'\-]+/g, '');
    const wRaw = rawWordsLower[i].replace(/[.,!?:;«»"'\-]+/g, '');
    if (wCheck === wRaw || (i === maxCheck - 1 && wRaw.startsWith(wCheck))) {
      matchCount = i + 1;
    } else {
      break;
    }
  }

  // If matched all words of checkpoint (or all up to current raw length)
  if (matchCount >= checkWords.length) {
    return rawWords.slice(matchCount).join(' ');
  }

  // 3. Fallback: if model slightly revised words in the middle, find the best suffix match
  if (checkWords.length > 0 && rawWords.length >= checkWords.length) {
    const lastCheckWord = checkWords[checkWords.length - 1].replace(/[.,!?:;«»"'\-]+/g, '');
    for (let offset = -2; offset <= 2; offset++) {
      const idx = checkWords.length - 1 + offset;
      if (idx >= 0 && idx < rawWordsLower.length) {
        const target = rawWordsLower[idx].replace(/[.,!?:;«»"'\-]+/g, '');
        if (target === lastCheckWord || target.startsWith(lastCheckWord)) {
          return rawWords.slice(idx + 1).join(' ');
        }
      }
    }
  }

  // 4. If partial prefix matched, return the remainder
  if (matchCount > 0) {
    return rawWords.slice(matchCount).join(' ');
  }

  // 5. If raw stream is shorter than or equal to checkpoint, no new words have arrived
  if (rawWords.length <= checkWords.length) {
    return '';
  }

  // 6. Safe fallback: strip checkpoint word count
  return rawWords.slice(checkWords.length).join(' ');
}

/**
 * Strip accidental overlap between end of base text and start of new speech (1 to 4 words)
 * @param {string} baseText
 * @param {string} newSpeech
 * @returns {string}
 */
function stripTailOverlap(baseText, newSpeech) {
  const base = (baseText || '').trim();
  const speech = (newSpeech || '').trim();
  if (!base || !speech) return speech;

  const baseWords = base.split(/\s+/).filter(Boolean);
  const speechWords = speech.split(/\s+/).filter(Boolean);
  const maxOverlap = Math.min(4, Math.min(baseWords.length, speechWords.length));

  for (let len = maxOverlap; len >= 1; len--) {
    const baseSuffix = baseWords.slice(baseWords.length - len)
      .map(w => w.toLowerCase().replace(/[.,!?:;«»"'\-]+/g, '')).join(' ');
    const speechPrefix = speechWords.slice(0, len)
      .map(w => w.toLowerCase().replace(/[.,!?:;«»"'\-]+/g, '')).join(' ');

    if (baseSuffix && speechPrefix && baseSuffix === speechPrefix) {
      return speechWords.slice(len).join(' ');
    }
  }

  return speech;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    cleanSmartPolish,
    extractNewSpeech,
    stripTailOverlap,
    hasPolishIndicators,
    filterLanguageLock
  };
}

if (typeof window !== 'undefined') {
  window.cleanSmartPolish = cleanSmartPolish;
  window.extractNewSpeech = extractNewSpeech;
  window.stripTailOverlap = stripTailOverlap;
  window.hasPolishIndicators = hasPolishIndicators;
  window.filterLanguageLock = filterLanguageLock;
}

