const { describe, it } = require('node:test');
const assert = require('node:assert');
const { cleanSmartPolish, extractNewSpeech, stripTailOverlap, hasPolishIndicators, filterLanguageLock } = require('../src/text-cleaner.js');

describe('Smart Polish Text Cleaner Unit Tests', () => {
  it('should handle empty or non-string inputs safely', () => {
    assert.strictEqual(cleanSmartPolish(''), '');
    assert.strictEqual(cleanSmartPolish(null), '');
    assert.strictEqual(cleanSmartPolish(undefined), '');
  });

  it('should remove Ukrainian vocal pauses and filler words', () => {
    // "е-е", "еее", "ну", "типу", "короче"
    const input1 = 'еее ми ну пішли в кіно';
    assert.strictEqual(cleanSmartPolish(input1), 'Ми пішли в кіно');

    const input2 = 'е-е-е привіт. Ну як справи?';
    assert.strictEqual(cleanSmartPolish(input2), 'Привіт. Як справи?');

    const input3 = 'короче, ми типу вирішили поїхати';
    assert.strictEqual(cleanSmartPolish(input3), 'Ми вирішили поїхати');

    const input4 = 'це значить, що як би все готово';
    assert.strictEqual(cleanSmartPolish(input4), 'Це, що все готово');

    const input5 = 'от я думаю, що треба зробити';
    assert.strictEqual(cleanSmartPolish(input5), 'Я думаю, що треба зробити');
  });

  it('should remove English vocal pauses and fillers', () => {
    const input1 = 'um uh we should start now';
    assert.strictEqual(cleanSmartPolish(input1), 'We should start now');

    const input2 = 'you know, this is sort of cool';
    assert.strictEqual(cleanSmartPolish(input2), 'This is cool');

    const input3 = 'er, I think, hmm, we are done';
    assert.strictEqual(cleanSmartPolish(input3), 'I think, we are done');

    const input4 = 'Um, like, you know, I was sort of thinking';
    assert.strictEqual(cleanSmartPolish(input4), 'I was thinking');

    const input5 = 'Like, we should really go';
    assert.strictEqual(cleanSmartPolish(input5), 'We should really go');

    const input6 = 'I like this design, it is good';
    assert.strictEqual(cleanSmartPolish(input6), 'I like this design, it is good');
  });

  it('should remove Ukrainian multi-word filler phrases', () => {
    const input1 = 'короче кажучи, це чудовий план';
    assert.strictEqual(cleanSmartPolish(input1), 'Це чудовий план');

    const input2 = 'коротше кажучи, все вийшло';
    assert.strictEqual(cleanSmartPolish(input2), 'Все вийшло');
  });

  it('should remove accidental stutters and immediate word repetitions', () => {
    const input1 = 'я я пішов додому';
    assert.strictEqual(cleanSmartPolish(input1), 'Я пішов додому');

    const input2 = 'ми, ми це зробили!';
    assert.strictEqual(cleanSmartPolish(input2), 'Ми це зробили!');

    const input3 = 'п-пішов і я-я прийшов';
    assert.strictEqual(cleanSmartPolish(input3), 'Пішов і я прийшов');

    const input4 = 'чи Чи це було можливо?';
    assert.strictEqual(cleanSmartPolish(input4), 'Чи це було можливо?');
  });

  it('should apply sentence capitalization correctly', () => {
    const input = 'привіт. це перше речення! як твої справи? супер.';
    assert.strictEqual(cleanSmartPolish(input), 'Привіт. Це перше речення! Як твої справи? Супер.');
  });

  it('should normalize punctuation and duplicate spacing', () => {
    const input = 'тест  ,   з  пробілами   .   і крапкою';
    assert.strictEqual(cleanSmartPolish(input), 'Тест, з пробілами. І крапкою');
  });

  it('should preserve valid Ukrainian words that contain syllables similar to fillers', () => {
    // "струну", "нуль", "типовий", "короткий", "мене"
    const input = 'налаштуй шосту струну на гітарі';
    assert.strictEqual(cleanSmartPolish(input), 'Налаштуй шосту струну на гітарі');

    const input2 = 'температура впала нижче нуля';
    assert.strictEqual(cleanSmartPolish(input2), 'Температура впала нижче нуля');

    const input3 = 'це типовий випадок для короткого тексту';
    assert.strictEqual(cleanSmartPolish(input3), 'Це типовий випадок для короткого тексту');
  });

  it('should cleanly deduplicate repeated sentences, questions, and multi-word phrases', () => {
    const input = 'Привіт, як у тебе справи? Привіт, як у тебе справи? У мене У мене добре. Добре.';
    assert.strictEqual(cleanSmartPolish(input), 'Привіт, як у тебе справи? У мене добре.');

    const input2 = 'How are you? How are you? Everything is good good.';
    assert.strictEqual(cleanSmartPolish(input2), 'How are you? Everything is good.');
  });

  describe('extractNewSpeech Unit Tests', () => {
    it('should return raw stream untouched if checkpoint is empty', () => {
      assert.strictEqual(extractNewSpeech('Привіт як справи', ''), 'Привіт як справи');
      assert.strictEqual(extractNewSpeech('Привіт як справи', null), 'Привіт як справи');
      assert.strictEqual(extractNewSpeech('', 'Привіт'), '');
    });

    it('should extract newly spoken text when exact prefix matches', () => {
      const raw = 'Привіт як справи У мене все добре';
      const checkpoint = 'Привіт як справи';
      assert.strictEqual(extractNewSpeech(raw, checkpoint), 'У мене все добре');
    });

    it('should handle checkpoint with punctuation difference', () => {
      const raw = 'привіт як справи у мене все добре';
      const checkpoint = 'привіт, як справи.';
      assert.strictEqual(extractNewSpeech(raw, checkpoint), 'у мене все добре');
    });

    it('should handle partial words at the moment of checkpoint capture', () => {
      const raw = 'привіт як справи у мене все добре';
      const checkpoint = 'привіт як справ';
      assert.strictEqual(extractNewSpeech(raw, checkpoint), 'у мене все добре');
    });

    it('should return empty string when no new words have been spoken', () => {
      assert.strictEqual(extractNewSpeech('привіт як справи', 'привіт як справи'), '');
      assert.strictEqual(extractNewSpeech('привіт', 'привіт як справи'), '');
    });

    it('should handle minor word modifications in checkpoint region', () => {
      const raw = 'привіт як справи у мене все добре';
      const checkpoint = 'привіт ну як справи';
      assert.strictEqual(extractNewSpeech(raw, checkpoint), 'у мене все добре');
    });
  });

  describe('stripTailOverlap Unit Tests', () => {
    it('should strip overlapping multi-word phrases at boundary', () => {
      const base = 'Привіт, як справи?';
      const speech = 'Як справи? У мене все добре.';
      assert.strictEqual(stripTailOverlap(base, speech), 'У мене все добре.');
    });

    it('should strip single word overlap across hesitation pause', () => {
      const base = 'Привіт, як справи?';
      const speech = 'справи? У мене все добре.';
      assert.strictEqual(stripTailOverlap(base, speech), 'У мене все добре.');
    });

    it('should preserve speech when there is no overlap', () => {
      const base = 'Привіт, як справи?';
      const speech = 'У мене все добре.';
      assert.strictEqual(stripTailOverlap(base, speech), 'У мене все добре.');
    });

    it('should handle empty base safely', () => {
      assert.strictEqual(stripTailOverlap('', 'Hello world'), 'Hello world');
    });
  });

  describe('Manual Edit Preservation Integration Tests', () => {
    it('should preserve manual edits and cleanly append subsequent speech without repetition', () => {
      const initialRaw = 'привіт як справи';
      const initialClean = cleanSmartPolish(initialRaw);
      assert.strictEqual(initialClean, 'Привіт як справи');

      // User manually edits in transcript box
      const editedUserText = 'Привіт! Як у тебе справи?';
      const rawCheckpoint = initialRaw; // 'привіт як справи'

      // Subsequent speech arrives in ongoing session
      const subsequentRaw = 'привіт як справи у мене все добре';
      const newSpeechRaw = extractNewSpeech(subsequentRaw, rawCheckpoint);
      assert.strictEqual(newSpeechRaw, 'у мене все добре');

      let newSpeechClean = cleanSmartPolish(newSpeechRaw);
      if (editedUserText) {
        newSpeechClean = stripTailOverlap(editedUserText, newSpeechClean);
      }

      const combined = `${editedUserText} ${newSpeechClean}`;
      assert.strictEqual(combined, 'Привіт! Як у тебе справи? У мене все добре');
    });

    it('should handle multiple consecutive manual edits while recording remains active', () => {
      let sessionBaseText = '';
      let rawCheckpoint = '';
      let currentRaw = 'сьогодні гарна погода';

      let speech = extractNewSpeech(currentRaw, rawCheckpoint);
      sessionBaseText = cleanSmartPolish(speech);
      assert.strictEqual(sessionBaseText, 'Сьогодні гарна погода');

      // Edit 1: User changes text
      sessionBaseText = 'Сьогодні чудова погода!';
      rawCheckpoint = currentRaw;

      // Turn 2: User continues speaking
      currentRaw = 'сьогодні гарна погода і сонце світить';
      speech = extractNewSpeech(currentRaw, rawCheckpoint);
      assert.strictEqual(speech, 'і сонце світить');
      let polished = cleanSmartPolish(speech);
      sessionBaseText = `${sessionBaseText} ${polished}`;
      assert.strictEqual(sessionBaseText, 'Сьогодні чудова погода! І сонце світить');

      // Edit 2: User changes text again
      sessionBaseText = 'Сьогодні чудова сонячна погода';
      rawCheckpoint = currentRaw;

      // Turn 3: User speaks again
      currentRaw = 'сьогодні гарна погода і сонце світить ми йдемо гуляти';
      speech = extractNewSpeech(currentRaw, rawCheckpoint);
      assert.strictEqual(speech, 'ми йдемо гуляти');
      polished = cleanSmartPolish(speech);
      sessionBaseText = `${sessionBaseText} ${polished}`;
      assert.strictEqual(sessionBaseText, 'Сьогодні чудова сонячна погода Ми йдемо гуляти');
    });

    it('should handle multi-session recording (Stop -> Edit -> Start) without duplicating', () => {
      let sessionBaseText = '';
      let rawSession1 = 'перше речення';
      sessionBaseText = cleanSmartPolish(rawSession1);
      assert.strictEqual(sessionBaseText, 'Перше речення');

      // User stops and edits text
      let rawCheckpoint = '';
      sessionBaseText = 'Перше виправлене речення.';

      // Session 2 starts (fresh WebSocket)
      rawCheckpoint = '';
      let rawSession2 = 'друге речення';
      let newSpeech = extractNewSpeech(rawSession2, rawCheckpoint);
      let polished = cleanSmartPolish(newSpeech);
      const combined = `${sessionBaseText} ${polished}`;

      assert.strictEqual(combined, 'Перше виправлене речення. Друге речення');
    });
  });

  describe('Language Lock & Polish Filter Tests', () => {
    it('hasPolishIndicators should correctly detect Polish Latin diacritics and vocabulary', () => {
      assert.strictEqual(hasPolishIndicators('Dzień dobry, jak się masz?'), true);
      assert.strictEqual(hasPolishIndicators('Dziękuję bardzo'), true);
      assert.strictEqual(hasPolishIndicators('Proszę pana'), true);
      assert.strictEqual(hasPolishIndicators('дзєнь добри, бардзо дякую'), true);
      assert.strictEqual(hasPolishIndicators('пшепрашам, цо то єст?'), true);

      // Ukrainian and English text should not trigger
      assert.strictEqual(hasPolishIndicators('Доброго дня, як ваші справи?'), false);
      assert.strictEqual(hasPolishIndicators('Hello world, everything is fine.'), false);
      assert.strictEqual(hasPolishIndicators('Я хочу перевірити роботу мікрофона.'), false);
    });

    it('filterLanguageLock should convert Polish phrases and words to Ukrainian when uk is locked', () => {
      assert.strictEqual(filterLanguageLock('Dzień dobry!'), 'добрий день!');
      assert.strictEqual(filterLanguageLock('Dziękuję bardzo za pomoc'), 'дякую дуже за допомогу');
      assert.strictEqual(filterLanguageLock('Proszę, to jest bardzo dobrze'), 'будь ласка, це дуже добре');
      assert.strictEqual(filterLanguageLock('дзєнь добри, бардзо дякую!'), 'добрий день, дуже дякую!');
      assert.strictEqual(filterLanguageLock('пшепрашам, я не знаю цо то єст'), 'вибачте, я не знаю що це');
    });

    it('filterLanguageLock should not alter non-uk languages when another lock is active', () => {
      const polishText = 'Dzień dobry, jak się masz?';
      assert.strictEqual(filterLanguageLock(polishText, 'pl'), polishText);
      assert.strictEqual(filterLanguageLock(polishText, 'en'), polishText);
    });

    it('cleanSmartPolish should automatically apply language lock and filter Polish hallucinations', () => {
      const input = 'ну е-е-е дзєнь добри, бардзо дякую';
      const output = cleanSmartPolish(input, 'uk');
      assert.strictEqual(output, 'Добрий день, дуже дякую');

      const input2 = 'Dzień dobry! Як ваші справи?';
      const output2 = cleanSmartPolish(input2, 'uk');
      assert.strictEqual(output2, 'Добрий день! Як ваші справи?');
    });
  });
});



