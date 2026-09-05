const { describe, it } = require('node:test');
const assert = require('node:assert');
const { GeminiLiveClient } = require('../src/gemini-live-client.js');

describe('Gemini Live Client Protocol Tests', () => {
  it('formatModelName should prefix models/ if missing and preserve tunedModels/ or existing prefix', () => {
    assert.strictEqual(GeminiLiveClient.formatModelName('gemini-3.5-transcribe-live'), 'models/gemini-3.5-transcribe-live');
    assert.strictEqual(GeminiLiveClient.formatModelName('models/gemini-3.5-transcribe-live'), 'models/gemini-3.5-transcribe-live');
    assert.strictEqual(GeminiLiveClient.formatModelName('/models/gemini-3.5-transcribe-live'), 'models/gemini-3.5-transcribe-live');
    assert.strictEqual(GeminiLiveClient.formatModelName(''), 'models/gemini-3.5-transcribe-live');
    assert.strictEqual(GeminiLiveClient.formatModelName('gemini-custom-model'), 'models/gemini-custom-model');
    assert.strictEqual(GeminiLiveClient.formatModelName('tunedModels/custom-model-id'), 'tunedModels/custom-model-id');
    assert.strictEqual(GeminiLiveClient.formatModelName('projects/my-project/models/custom'), 'projects/my-project/models/custom');
    assert.strictEqual(GeminiLiveClient.formatModelName('my-custom-model'), 'models/my-custom-model');
  });

  it('client should default apiVersion to v1beta and default model to gemini-3.5-transcribe-live', () => {
    const clientDefault = new GeminiLiveClient({ apiKey: 'test' });
    assert.strictEqual(clientDefault.apiVersion, 'v1beta');
    assert.strictEqual(clientDefault.model, 'gemini-3.5-transcribe-live');

    const clientWhitespace = new GeminiLiveClient({ apiKey: 'test', model: '   ' });
    assert.strictEqual(clientWhitespace.model, 'gemini-3.5-transcribe-live');

    const clientCustom = new GeminiLiveClient({ apiKey: 'test', apiVersion: 'v1alpha', model: 'my-custom-model' });
    assert.strictEqual(clientCustom.apiVersion, 'v1alpha');
    assert.strictEqual(clientCustom.model, 'my-custom-model');
  });

  it('createSetupMessage should format setup configuration properly with TEXT modality', () => {
    const msg = GeminiLiveClient.createSetupMessage('gemini-3.5-transcribe-live', 'Test instruction');
    assert.ok(msg.setup);
    assert.strictEqual(msg.setup.model, 'models/gemini-3.5-transcribe-live');
    assert.deepStrictEqual(msg.setup.generationConfig.responseModalities, ['TEXT']);
    assert.strictEqual(msg.setup.systemInstruction.parts[0].text, 'Test instruction');
  });

  it('createAudioChunkMessage should format realtimeInput PCM 16kHz mediaChunk', () => {
    const chunk = GeminiLiveClient.createAudioChunkMessage('QUJDRA==');
    assert.ok(chunk.realtimeInput);
    assert.ok(Array.isArray(chunk.realtimeInput.mediaChunks));
    assert.strictEqual(chunk.realtimeInput.mediaChunks[0].mimeType, 'audio/pcm;rate=16000');
    assert.strictEqual(chunk.realtimeInput.mediaChunks[0].data, 'QUJDRA==');
  });

  it('parseServerMessage should handle setupComplete from string, Buffer, and Uint8Array', () => {
    const parsedStr = GeminiLiveClient.parseServerMessage('{"setupComplete":{}}');
    assert.strictEqual(parsedStr.type, 'setup_complete');

    const buf = Buffer.from('{"setupComplete":{}}');
    const parsedBuf = GeminiLiveClient.parseServerMessage(buf);
    assert.strictEqual(parsedBuf.type, 'setup_complete');

    const uint8 = new Uint8Array(Buffer.from('{"setupComplete":{}}'));
    const parsedUint8 = GeminiLiveClient.parseServerMessage(uint8);
    assert.strictEqual(parsedUint8.type, 'setup_complete');
  });

  it('parseServerMessage should extract text deltas from dedicated inputTranscription envelope', () => {
    const sttPayload = {
      serverContent: {
        inputTranscription: {
          text: 'Стенограма мовлення наживо'
        }
      }
    };
    const parsed = GeminiLiveClient.parseServerMessage(sttPayload);
    assert.strictEqual(parsed.type, 'server_content');
    assert.deepStrictEqual(parsed.textDeltas, ['Стенограма мовлення наживо']);
  });

  it('parseServerMessage should extract text deltas from interimInputTranscription and outputTranscription', () => {
    const interimPayload = {
      serverContent: {
        interimInputTranscription: { text: 'Тимчасовий текст...' }
      }
    };
    const parsedInterim = GeminiLiveClient.parseServerMessage(interimPayload);
    assert.deepStrictEqual(parsedInterim.textDeltas, ['Тимчасовий текст...']);

    const outputPayload = {
      serverContent: {
        outputTranscription: { text: 'Переклад...' }
      }
    };
    const parsedOutput = GeminiLiveClient.parseServerMessage(outputPayload);
    assert.deepStrictEqual(parsedOutput.textDeltas, ['Переклад...']);
  });

  it('parseServerMessage should prioritize inputTranscription over modelTurn to avoid duplication', () => {
    const payload = {
      serverContent: {
        inputTranscription: { text: 'Основна стенограма' },
        modelTurn: { parts: [{ text: 'Дубльований текст' }] }
      }
    };
    const parsed = GeminiLiveClient.parseServerMessage(payload);
    assert.deepStrictEqual(parsed.textDeltas, ['Основна стенограма']);
  });

  it('parseServerMessage should extract text deltas from modelTurn parts', () => {
    const serverPayload = {
      serverContent: {
        modelTurn: {
          parts: [
            { text: 'Привіт, ' },
            { text: 'світ!' }
          ]
        }
      }
    };

    const parsed = GeminiLiveClient.parseServerMessage(JSON.stringify(serverPayload));
    assert.strictEqual(parsed.type, 'server_content');
    assert.deepStrictEqual(parsed.textDeltas, ['Привіт, ', 'світ!']);
  });

  it('parseServerMessage should handle turnComplete and interrupted flags', () => {
    const turnCompletePayload = {
      serverContent: {
        modelTurn: { parts: [{ text: 'Done.' }] },
        turnComplete: true
      }
    };
    const parsedComplete = GeminiLiveClient.parseServerMessage(turnCompletePayload);
    assert.strictEqual(parsedComplete.turnComplete, true);
    assert.deepStrictEqual(parsedComplete.textDeltas, ['Done.']);

    const interruptedPayload = {
      serverContent: {
        interrupted: true
      }
    };
    const parsedInterrupted = GeminiLiveClient.parseServerMessage(interruptedPayload);
    assert.strictEqual(parsedInterrupted.interrupted, true);
  });

  it('parseServerMessage should handle server error messages', () => {
    const errorPayload = {
      error: {
        code: 400,
        message: 'Invalid API key',
        status: 'INVALID_ARGUMENT'
      }
    };
    const parsed = GeminiLiveClient.parseServerMessage(errorPayload);
    assert.strictEqual(parsed.type, 'error');
    assert.strictEqual(parsed.code, 400);
    assert.strictEqual(parsed.error, 'Invalid API key');
  });

  it('client should buffer audio chunks until isSetupComplete is true', () => {
    const client = new GeminiLiveClient({ apiKey: 'test' });
    client.isConnected = true;
    client.isSetupComplete = false;

    client.sendAudioChunk('AAAA');
    client.sendAudioChunk('BBBB');

    assert.strictEqual(client.pendingChunks.length, 2);
    assert.strictEqual(client.pendingChunks[0], 'AAAA');
    assert.strictEqual(client.pendingChunks[1], 'BBBB');
  });

  it('client should cleanly separate multiple turns with whitespace', () => {
    const client = new GeminiLiveClient({ apiKey: 'test' });
    client.isSetupComplete = true;

    // Turn 1
    client._handleMessage(JSON.stringify({
      serverContent: {
        modelTurn: { parts: [{ text: 'Перше речення.' }] },
        turnComplete: true
      }
    }));

    assert.strictEqual(client.accumulatedText, 'Перше речення.');

    // Turn 2
    client._handleMessage(JSON.stringify({
      serverContent: {
        modelTurn: { parts: [{ text: 'Друге речення.' }] },
        turnComplete: true
      }
    }));

    // Must have space separator!
    assert.strictEqual(client.accumulatedText, 'Перше речення. Друге речення.');

    // Clear transcript
    client.clearTranscript();
    assert.strictEqual(client.accumulatedText, '');
    assert.strictEqual(client.currentTurnText, '');
    assert.strictEqual(client.committedText, '');
    assert.strictEqual(client.committedUtterances.length, 0);

    // Turn 3 after clear: must NOT restore Turn 1 or Turn 2!
    client._handleMessage(JSON.stringify({
      serverContent: {
        modelTurn: { parts: [{ text: 'Третє речення.' }] },
        turnComplete: true
      }
    }));
    assert.strictEqual(client.accumulatedText, 'Третє речення.');
    assert.strictEqual(client.committedText, 'Третє речення.');
    assert.strictEqual(client.committedUtterances.length, 1);
  });

  it('client should replace intermediate hypotheses without triple repetition of words', () => {
    const client = new GeminiLiveClient({ apiKey: 'test' });
    client.isSetupComplete = true;

    // Simulate real streaming ASR from gemini-3.5-transcribe-live
    // Chunk 1: "Можешь"
    client._handleMessage(JSON.stringify({
      serverContent: {
        inputTranscription: { text: 'Можешь' }
      }
    }));
    assert.strictEqual(client.accumulatedText, 'Можешь');
    assert.strictEqual(client.currentTurnText, 'Можешь');

    // Chunk 2: "Можеш" (spelling correction in hypothesis)
    client._handleMessage(JSON.stringify({
      serverContent: {
        inputTranscription: { text: 'Можеш' }
      }
    }));
    assert.strictEqual(client.accumulatedText, 'Можеш');
    assert.strictEqual(client.currentTurnText, 'Можеш');

    // Chunk 3: "Можеш допомогти з" (extended hypothesis)
    client._handleMessage(JSON.stringify({
      serverContent: {
        inputTranscription: { text: 'Можеш допомогти з' }
      }
    }));
    assert.strictEqual(client.accumulatedText, 'Можеш допомогти з');
    assert.strictEqual(client.currentTurnText, 'Можеш допомогти з');

    // Chunk 4: "Можеш допомогти з дизайном?" with turnComplete
    client._handleMessage(JSON.stringify({
      serverContent: {
        inputTranscription: { text: 'Можеш допомогти з дизайном?' },
        turnComplete: true
      }
    }));

    // Must be exactly the final phrase, without triple repeats ("МожешьМожешМожеш...")
    assert.strictEqual(client.accumulatedText, 'Можеш допомогти з дизайном?');
    assert.strictEqual(client.committedText, 'Можеш допомогти з дизайном?');
    assert.strictEqual(client.currentTurnText, '');
  });

  it('client should handle voiceActivity lifecycle and commit on ACTIVITY_END or generationComplete', () => {
    const client = new GeminiLiveClient({ apiKey: 'test' });
    client.isSetupComplete = true;

    // 1. Voice activity start
    client._handleMessage(JSON.stringify({
      voiceActivity: { type: 'ACTIVITY_START' }
    }));
    assert.strictEqual(client.accumulatedText, '');

    // 2. Interim streaming transcriptions
    client._handleMessage(JSON.stringify({
      serverContent: {
        interimInputTranscription: { text: 'Привіт' }
      }
    }));
    assert.strictEqual(client.accumulatedText, 'Привіт');
    assert.strictEqual(client.currentUtteranceText, 'Привіт');

    client._handleMessage(JSON.stringify({
      serverContent: {
        interimInputTranscription: { text: 'Привіт, як справи?' }
      }
    }));
    assert.strictEqual(client.accumulatedText, 'Привіт, як справи?');

    // 3. Final input transcription + generationComplete
    client._handleMessage(JSON.stringify({
      serverContent: {
        inputTranscription: { text: 'Привіт, як справи?' },
        generationComplete: true
      }
    }));

    // Utterance committed!
    assert.strictEqual(client.accumulatedText, 'Привіт, як справи?');
    assert.strictEqual(client.committedText, 'Привіт, як справи?');
    assert.strictEqual(client.currentUtteranceText, '');

    // 4. Server sends voiceActivity: ACTIVITY_END (must not duplicate or re-commit)
    client._handleMessage(JSON.stringify({
      voiceActivity: { type: 'ACTIVITY_END' }
    }));
    assert.strictEqual(client.accumulatedText, 'Привіт, як справи?');
    assert.strictEqual(client.committedText, 'Привіт, як справи?');
  });

  it('client should prevent duplicated phrase bugs when user pauses and speaks new phrases', () => {
    const client = new GeminiLiveClient({ apiKey: 'test' });
    client.isSetupComplete = true;

    // Utterance 1: "Hello, how are you?"
    client._handleMessage(JSON.stringify({
      voiceActivity: { type: 'ACTIVITY_START' }
    }));
    client._handleMessage(JSON.stringify({
      serverContent: {
        interimInputTranscription: { text: 'Hello' }
      }
    }));
    client._handleMessage(JSON.stringify({
      serverContent: {
        interimInputTranscription: { text: 'Hello, how are you?' }
      }
    }));
    client._handleMessage(JSON.stringify({
      serverContent: {
        inputTranscription: { text: 'Hello, how are you?' },
        generationComplete: true
      }
    }));
    client._handleMessage(JSON.stringify({
      voiceActivity: { type: 'ACTIVITY_END' }
    }));

    assert.strictEqual(client.accumulatedText, 'Hello, how are you?');

    // Utterance 2: "Hello. Hello."
    client._handleMessage(JSON.stringify({
      voiceActivity: { type: 'ACTIVITY_START' }
    }));
    client._handleMessage(JSON.stringify({
      serverContent: {
        interimInputTranscription: { text: 'Hello.' }
      }
    }));
    client._handleMessage(JSON.stringify({
      serverContent: {
        interimInputTranscription: { text: 'Hello. Hello.' }
      }
    }));
    client._handleMessage(JSON.stringify({
      serverContent: {
        inputTranscription: { text: 'Hello. Hello.' },
        generationComplete: true
      }
    }));
    client._handleMessage(JSON.stringify({
      voiceActivity: { type: 'ACTIVITY_END' }
    }));

    // Must strictly be the two utterances separated by space, NOT duplicated repeats!
    assert.strictEqual(client.accumulatedText, 'Hello, how are you? Hello. Hello.');
    assert.strictEqual(client.committedText, 'Hello, how are you? Hello. Hello.');
    assert.strictEqual(client.committedUtterances.length, 2);
    assert.strictEqual(client.committedUtterances[0], 'Hello, how are you?');
    assert.strictEqual(client.committedUtterances[1], 'Hello. Hello.');
  });

  it('updateUtterance should allow live translation replacement of completed utterances', () => {
    const client = new GeminiLiveClient({ apiKey: 'test' });
    client.isSetupComplete = true;

    // Utterance 1 in Ukrainian
    client._handleMessage(JSON.stringify({
      serverContent: {
        inputTranscription: { text: 'Привіт, як справи?' },
        generationComplete: true
      }
    }));

    assert.strictEqual(client.accumulatedText, 'Привіт, як справи?');

    // Simulate fast translation replacing utterance 0
    client.updateUtterance(0, 'Hello, how are you?');
    assert.strictEqual(client.accumulatedText, 'Hello, how are you?');
    assert.strictEqual(client.committedText, 'Hello, how are you?');

    // Utterance 2 while speaking
    client._handleMessage(JSON.stringify({
      serverContent: {
        interimInputTranscription: { text: 'Все добре' }
      }
    }));
    assert.strictEqual(client.accumulatedText, 'Hello, how are you? Все добре');

    // Utterance 2 complete
    client._handleMessage(JSON.stringify({
      serverContent: {
        inputTranscription: { text: 'Все добре' },
        generationComplete: true
      }
    }));
    assert.strictEqual(client.accumulatedText, 'Hello, how are you? Все добре');

    // Utterance 2 translated
    client.updateUtterance(1, 'All is good');
    assert.strictEqual(client.accumulatedText, 'Hello, how are you? All is good');
    assert.strictEqual(client.committedUtterances.length, 2);
  });

  it('client should NOT commit interim transcription prematurely when ACTIVITY_END arrives before inputTranscription', () => {
    const client = new GeminiLiveClient({ apiKey: 'test' });
    client.isSetupComplete = true;

    // 1. Interim hypothesis arrives while speaking
    client._handleMessage(JSON.stringify({
      serverContent: {
        interimInputTranscription: { text: 'Hello, how are' }
      }
    }));
    assert.strictEqual(client.currentUtteranceText, 'Hello, how are');
    assert.strictEqual(client.committedText, '');

    // 2. User stops speaking: server sends ACTIVITY_END before ASR finalizes
    client._handleMessage(JSON.stringify({
      voiceActivity: { type: 'ACTIVITY_END' }
    }));

    // Must NOT commit unfinalized interim transcription on ACTIVITY_END!
    assert.strictEqual(client.committedText, '', 'Interim text must not be committed prematurely on ACTIVITY_END');
    assert.strictEqual(client.currentUtteranceText, 'Hello, how are');

    // 3. Server ASR decoding completes: sends finalized inputTranscription + generationComplete
    client._handleMessage(JSON.stringify({
      serverContent: {
        inputTranscription: { text: 'Hello, how are you?' },
        generationComplete: true
      }
    }));

    // Final phrase committed exactly once without repetition!
    assert.strictEqual(client.committedText, 'Hello, how are you?');
    assert.strictEqual(client.accumulatedText, 'Hello, how are you?');
    assert.strictEqual(client.committedUtterances.length, 1);
    assert.strictEqual(client.committedUtterances[0], 'Hello, how are you?');
  });

  it('client should ignore modelTurnText when inputTranscription is present to prevent phrase doubling', () => {
    const client = new GeminiLiveClient({ apiKey: 'test' });
    client.isSetupComplete = true;

    // Server sends payload containing both inputTranscription and modelTurn
    client._handleMessage(JSON.stringify({
      serverContent: {
        inputTranscription: { text: 'Hello world' },
        modelTurn: { parts: [{ text: 'Hello world' }] },
        generationComplete: true
      }
    }));

    assert.strictEqual(client.accumulatedText, 'Hello world');
    assert.strictEqual(client.committedText, 'Hello world');
    assert.strictEqual(client.committedUtterances.length, 1);
  });

  it('client should handle user saying "Hello, how are you?" followed by "Hello, hello" multiple times cleanly', () => {
    const client = new GeminiLiveClient({ apiKey: 'test' });
    client.isSetupComplete = true;

    // Turn 1: "Hello, how are you?"
    client._handleMessage(JSON.stringify({
      serverContent: { interimInputTranscription: { text: 'Hello' } }
    }));
    client._handleMessage(JSON.stringify({
      serverContent: { interimInputTranscription: { text: 'Hello, how are you?' } }
    }));
    client._handleMessage(JSON.stringify({
      serverContent: {
        inputTranscription: { text: 'Hello, how are you?' },
        generationComplete: true
      }
    }));

    // Turn 2: "Hello, hello"
    client._handleMessage(JSON.stringify({
      serverContent: { interimInputTranscription: { text: 'Hello' } }
    }));
    client._handleMessage(JSON.stringify({
      serverContent: { interimInputTranscription: { text: 'Hello, hello' } }
    }));
    client._handleMessage(JSON.stringify({
      serverContent: {
        inputTranscription: { text: 'Hello, hello' },
        generationComplete: true
      }
    }));

    // Turn 3: "Hello, hello"
    client._handleMessage(JSON.stringify({
      serverContent: { interimInputTranscription: { text: 'Hello' } }
    }));
    client._handleMessage(JSON.stringify({
      serverContent: { interimInputTranscription: { text: 'Hello, hello' } }
    }));
    client._handleMessage(JSON.stringify({
      serverContent: {
        inputTranscription: { text: 'Hello, hello' },
        generationComplete: true
      }
    }));

    assert.strictEqual(client.committedUtterances.length, 3);
    assert.strictEqual(client.committedUtterances[0], 'Hello, how are you?');
    assert.strictEqual(client.committedUtterances[1], 'Hello, hello');
    assert.strictEqual(client.committedUtterances[2], 'Hello, hello');
    assert.strictEqual(client.accumulatedText, 'Hello, how are you? Hello, hello Hello, hello');
  });

  it('commitUtterance should commit active in-flight speech when stopping session', () => {
    const client = new GeminiLiveClient({ apiKey: 'test' });
    client.isSetupComplete = true;

    // In-flight speech received
    client._handleMessage(JSON.stringify({
      serverContent: { interimInputTranscription: { text: 'Привіт' } }
    }));
    assert.strictEqual(client.currentUtteranceText, 'Привіт');
    assert.strictEqual(client.committedText, '');

    // User stops recording: app commits in-flight utterance
    let turnCompleted = '';
    let turnIndex = -1;
    client.onTurnComplete = (text, idx) => {
      turnCompleted = text;
      turnIndex = idx;
    };

    client.commitUtterance();
    assert.strictEqual(turnCompleted, 'Привіт');
    assert.strictEqual(turnIndex, 0);
    assert.strictEqual(client.committedText, 'Привіт');
    assert.strictEqual(client.currentUtteranceText, '');

    // Translation arrives and updates in-place
    client.updateUtterance(0, 'Hello');
    assert.strictEqual(client.committedText, 'Hello');
    assert.strictEqual(client.accumulatedText, 'Hello');
  });

  it('lastDeltaTime should update whenever streaming text deltas arrive from server', () => {
    const client = new GeminiLiveClient({ apiKey: 'test' });
    client.isSetupComplete = true;
    assert.strictEqual(client.lastDeltaTime, 0);

    const before = Date.now();
    client._handleMessage(JSON.stringify({
      serverContent: {
        inputTranscription: { text: 'Слово' }
      }
    }));
    assert.ok(client.lastDeltaTime >= before);
  });

  it('updateUtterance should cleanly handle multiple identical turns without corrupting indices', () => {
    const client = new GeminiLiveClient({ apiKey: 'test' });
    client.isSetupComplete = true;

    // Turn 0: "Так"
    client.currentUtteranceText = 'Так';
    client.commitUtterance();

    // Turn 1: "Так"
    client.currentUtteranceText = 'Так';
    client.commitUtterance();

    assert.strictEqual(client.committedUtterances.length, 2);
    assert.strictEqual(client.committedUtterances[0], 'Так');
    assert.strictEqual(client.committedUtterances[1], 'Так');

    // Translate Turn 1 first to "Yes"
    client.updateUtterance(1, 'Yes');
    assert.strictEqual(client.committedUtterances[0], 'Так');
    assert.strictEqual(client.committedUtterances[1], 'Yes');
    assert.strictEqual(client.accumulatedText, 'Так Yes');

    // Translate Turn 0 next to "Indeed"
    client.updateUtterance(0, 'Indeed');
    assert.strictEqual(client.committedUtterances[0], 'Indeed');
    assert.strictEqual(client.committedUtterances[1], 'Yes');
    assert.strictEqual(client.accumulatedText, 'Indeed Yes');
  });

  it('resetSession should clear transcript and cleanly disconnect before reconnecting', async () => {
    const client = new GeminiLiveClient({ apiKey: 'test' });
    client.committedText = 'Старий текст';
    client.committedUtterances = ['Старий текст'];

    let disconnectCalled = false;
    let connectCalled = false;

    client.disconnect = () => {
      disconnectCalled = true;
    };
    client.connect = async () => {
      connectCalled = true;
    };

    await client.resetSession();

    assert.strictEqual(client.committedText, '');
    assert.strictEqual(client.committedUtterances.length, 0);
    assert.strictEqual(disconnectCalled, true);
    assert.strictEqual(connectCalled, true);
  });

  it('parseServerMessage should extract outputTranscriptionText and prioritize it over inputTranscription in _handleMessage', () => {
    const payload = {
      serverContent: {
        inputTranscription: { text: 'Привіт як справи' },
        outputTranscription: { text: 'Hello how are you' }
      }
    };

    const parsed = GeminiLiveClient.parseServerMessage(payload);
    assert.strictEqual(parsed.type, 'server_content');
    assert.strictEqual(parsed.inputText, 'Привіт як справи');
    assert.strictEqual(parsed.outputTranscriptionText, 'Hello how are you');

    const client = new GeminiLiveClient({ apiKey: 'test' });
    let deltaReceived = '';
    let turnReceived = '';
    let wasTranslatedFlag = false;

    client.onDelta = (delta, turnText) => {
      deltaReceived = delta;
      turnReceived = turnText;
    };

    client.onTurnComplete = (turnText, idx, wasTranslated) => {
      wasTranslatedFlag = wasTranslated;
    };

    client._handleMessage(JSON.stringify(payload));
    assert.strictEqual(deltaReceived, 'Hello how are you');
    assert.strictEqual(turnReceived, 'Hello how are you');
    assert.strictEqual(client.currentUtteranceIsTranslated, true);

    client.commitUtterance();
    assert.strictEqual(wasTranslatedFlag, true);
    assert.strictEqual(client.committedUtterances[0], 'Hello how are you');
    assert.strictEqual(client.currentUtteranceIsTranslated, false);
  });
});

