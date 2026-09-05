/**
 * Intelligent text cleaner and polisher for Smart Polish mode
 * Cleans speech fillers, vocal pauses, word stutters, and normalizes punctuation/capitalization.
 */

/**
 * Clean and polish transcription text for smart_polish mode
 * @param {string} text - Raw speech-to-text transcription
 * @returns {string} Polished text
 */
function cleanSmartPolish(text) {
  if (!text || typeof text !== 'string') return '';

  let cleaned = text;

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
    stripTailOverlap
  };
}
