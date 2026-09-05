/**
 * Gemini Multimodal Live API WebSocket Client
 * Protocol: BidiGenerateContent over WebSocket
 * Features Native Utterance Tracking and Instant Translation Support
 */

let fastTranslateText;
try {
  fastTranslateText = require('./fast-translator.js').translateText;
} catch (e) {
  if (typeof window !== 'undefined' && window.translateText) {
    fastTranslateText = window.translateText;
  }
}

class GeminiLiveClient {
  /**
   * @param {Object} options
   * @param {string} options.apiKey - Google AI Studio API Key
   * @param {string} [options.model='gemini-3.5-transcribe-live'] - Target Gemini model
   * @param {string} [options.systemPrompt=''] - System instruction for the session
   * @param {string} [options.apiVersion='v1beta'] - API version ('v1alpha' or 'v1beta')
   * @param {string} [options.endpointUrl] - Custom WebSocket endpoint URL
   */
  constructor(options = {}) {
    this.apiKey = options.apiKey || '';
    this.model = (options.model && typeof options.model === 'string' && options.model.trim()) ? options.model.trim() : 'gemini-3.5-transcribe-live';
    this.systemPrompt = options.systemPrompt || '';
    this.apiVersion = options.apiVersion || 'v1beta';
    this.endpointUrl = options.endpointUrl || null;

    this.ws = null;
    this.isConnected = false;
    this.isSetupComplete = false;
    this.status = 'disconnected'; // 'disconnected' | 'connecting' | 'setup' | 'ready' | 'error'

    this.pendingChunks = [];
    this.committedUtterances = [];
    this.committedText = '';
    this.currentUtteranceText = '';
    this.currentUtteranceIsFinal = false;
    this.currentUtteranceIsTranslated = false;
    this.accumulatedText = '';

    this._setupResolve = null;
    this._setupReject = null;
    this.lastDeltaTime = 0;

    // Event callbacks
    this.onStatusChange = null; // (status, details) => void
    this.onDelta = null; // (deltaText, currentUtteranceText, fullText) => void
    this.onTurnComplete = null; // (turnText, utteranceIndex) => void
    this.onInterrupted = null; // () => void
    this.onError = null; // (error) => void
    this.onClose = null; // (event) => void
  }

  get currentTurnText() {
    return this.currentUtteranceText;
  }

  set currentTurnText(val) {
    this.currentUtteranceText = val || '';
    this.accumulatedText = this.getFullText();
  }

  /**
   * Format model name ensuring 'models/' prefix for standard/custom models
   * Preserves existing 'models/', 'tunedModels/', or 'projects/' prefixes
   */
  static formatModelName(model) {
    let trimmed = (model || '').trim().replace(/^\/+/, '');
    if (!trimmed) return 'models/gemini-3.5-transcribe-live';
    if (trimmed.startsWith('models/') || trimmed.startsWith('tunedModels/') || trimmed.startsWith('projects/')) {
      return trimmed;
    }
    return `models/${trimmed}`;
  }

  /**
   * Build initial setup configuration message
   * @param {string} model
   * @param {string} systemPrompt
   * @returns {Object}
   */
  static createSetupMessage(model, systemPrompt = '') {
    const formattedModel = GeminiLiveClient.formatModelName(model);
    const setupMsg = {
      setup: {
        model: formattedModel,
        generationConfig: {
          responseModalities: ['TEXT']
        }
      }
    };

    if (systemPrompt && systemPrompt.trim()) {
      setupMsg.setup.systemInstruction = {
        parts: [
          {
            text: systemPrompt.trim()
          }
        ]
      };
    }

    return setupMsg;
  }

  /**
   * Build realtime audio chunk message
   * @param {string} base64Pcm - 16-bit PCM 16kHz base64 encoded audio
   * @returns {Object}
   */
  static createAudioChunkMessage(base64Pcm) {
    return {
      realtimeInput: {
        mediaChunks: [
          {
            mimeType: 'audio/pcm;rate=16000',
            data: base64Pcm
          }
        ]
      }
    };
  }

  /**
   * Parse incoming server message and extract structured representations
   * Handles string, Buffer, ArrayBuffer, and Uint8Array representations.
   * Supports dedicated transcription envelopes (inputTranscription / interimInputTranscription),
   * voice activity lifecycle events (voiceActivity: ACTIVITY_START / ACTIVITY_END),
   * generationComplete / turnComplete flags, and standard modelTurn.parts.
   * @param {string|Buffer|ArrayBuffer|Uint8Array|Object} rawData
   * @returns {Object} parsed representation
   */
  static parseServerMessage(rawData) {
    let data;

    if (typeof rawData === 'string') {
      try {
        data = JSON.parse(rawData);
      } catch (err) {
        return { type: 'parse_error', error: err };
      }
    } else if (typeof Buffer !== 'undefined' && Buffer.isBuffer(rawData)) {
      try {
        data = JSON.parse(rawData.toString('utf-8'));
      } catch (err) {
        return { type: 'parse_error', error: err };
      }
    } else if (rawData instanceof Uint8Array || (typeof ArrayBuffer !== 'undefined' && rawData instanceof ArrayBuffer)) {
      try {
        const text = new TextDecoder().decode(rawData);
        data = JSON.parse(text);
      } catch (err) {
        return { type: 'parse_error', error: err };
      }
    } else if (rawData && typeof rawData === 'object') {
      data = rawData;
    } else {
      return { type: 'unknown' };
    }

    if (!data) return { type: 'unknown' };

    // Setup complete acknowledgment from Gemini Live server
    if (data.setupComplete) {
      return { type: 'setup_complete' };
    }

    // Error from server
    if (data.error) {
      return {
        type: 'error',
        error: data.error.message || JSON.stringify(data.error),
        code: data.error.code,
        status: data.error.status
      };
    }

    const result = {
      type: 'server_content',
      interimText: null,
      inputText: null,
      modelTurnText: null,
      outputTranscriptionText: null,
      voiceActivity: null,
      turnComplete: false,
      generationComplete: false,
      interrupted: false,
      textDeltas: []
    };

    // Voice activity detection (Google Live native VAD)
    const voiceActivity = data.voiceActivity || (data.serverContent && data.serverContent.voiceActivity);
    if (voiceActivity && voiceActivity.type) {
      result.voiceActivity = voiceActivity.type;
    }

    const serverContent = data.serverContent || (data.inputTranscription || data.interimInputTranscription || data.modelTurn ? data : null);

    if (serverContent) {
      if (serverContent.interrupted) {
        result.interrupted = true;
      }
      if (serverContent.turnComplete) {
        result.turnComplete = true;
      }
      if (serverContent.generationComplete) {
        result.generationComplete = true;
      }

      // 1. inputTranscription (dedicated finalized STT envelope from gemini-3.5-transcribe-live)
      if (serverContent.inputTranscription) {
        const it = serverContent.inputTranscription;
        let text = '';
        if (typeof it === 'string' && it.trim()) {
          text = it;
        } else if (it && typeof it.text === 'string') {
          text = it.text;
        } else if (it && Array.isArray(it.parts)) {
          text = it.parts.map(p => (p && p.text) || '').join('');
        }
        if (text) {
          result.inputText = text;
          result.textDeltas.push(text);
        }
      }

      // 2. interimInputTranscription (real-time unfinalized live speech preview)
      if (serverContent.interimInputTranscription) {
        const iit = serverContent.interimInputTranscription;
        let text = '';
        if (typeof iit === 'string' && iit.trim()) {
          text = iit;
        } else if (iit && typeof iit.text === 'string') {
          text = iit.text;
        } else if (iit && Array.isArray(iit.parts)) {
          text = iit.parts.map(p => (p && p.text) || '').join('');
        }
        if (text) {
          result.interimText = text;
          if (!result.inputText) {
            result.textDeltas.push(text);
          }
        }
      }

      // 3. modelTurn.parts (standard conversational or custom live format)
      if (serverContent.modelTurn && Array.isArray(serverContent.modelTurn.parts)) {
        const partsTextList = [];
        for (const part of serverContent.modelTurn.parts) {
          if (part && typeof part.text === 'string' && part.text) {
            partsTextList.push(part.text);
            if (!result.inputText) {
              result.textDeltas.push(part.text);
            }
          }
        }
        if (partsTextList.length > 0) {
          result.modelTurnText = partsTextList.join('');
        }
      }

      // 4. outputTranscription (dedicated translation envelope from gemini-3.5-live-translate-preview)
      if (serverContent.outputTranscription) {
        const ot = serverContent.outputTranscription;
        let text = '';
        if (typeof ot === 'string' && ot.trim()) {
          text = ot;
        } else if (ot && typeof ot.text === 'string') {
          text = ot.text;
        } else if (ot && Array.isArray(ot.parts)) {
          text = ot.parts.map(p => (p && p.text) || '').join('');
        }
        if (text) {
          result.outputTranscriptionText = text;
          result.textDeltas.push(text);
        }
      }

      return result;
    }

    if (result.voiceActivity) {
      return result;
    }

    return { type: 'other', raw: data };
  }

  /**
   * Connect to Gemini Live WebSocket and wait for setupComplete
   */
  async connect() {
    if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 1)) {
      return;
    }

    if (!this.apiKey || !this.apiKey.trim()) {
      const err = new Error('Gemini API key is required. Please set it in Settings.');
      this._handleError(err);
      throw err;
    }

    this._setStatus('connecting', 'Встановлення з’єднання з Gemini Live API...');
    this.currentUtteranceText = '';
    this.currentUtteranceIsFinal = false;
    this.isSetupComplete = false;
    this.pendingChunks = [];

    const WebSocketClass = (typeof WebSocket !== 'undefined') ? WebSocket : (typeof require !== 'undefined' ? require('ws') : null);
    if (!WebSocketClass) {
      const err = new Error('WebSocket implementation not found');
      this._handleError(err);
      throw err;
    }

    const host = 'generativelanguage.googleapis.com';
    const path = `/ws/google.ai.generativelanguage.${this.apiVersion}.GenerativeService.BidiGenerateContent`;
    const url = this.endpointUrl || `wss://${host}${path}?key=${encodeURIComponent(this.apiKey.trim())}`;

    return new Promise((resolve, reject) => {
      let isResolved = false;

      // 10s setup timeout guard
      const setupTimeout = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          this._setupResolve = null;
          this._setupReject = null;
          const err = new Error('Тайм-аут ініціалізації сесії Gemini Live (10с)');
          this._handleError(err);
          this.disconnect();
          reject(err);
        }
      }, 10000);

      this._setupResolve = () => {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(setupTimeout);
          this._setupResolve = null;
          this._setupReject = null;
          resolve();
        }
      };

      this._setupReject = (err) => {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(setupTimeout);
          this._setupResolve = null;
          this._setupReject = null;
          reject(err);
        }
      };

      try {
        this.ws = new WebSocketClass(url);
      } catch (err) {
        clearTimeout(setupTimeout);
        this._handleError(err);
        return reject(err);
      }

      this.ws.onopen = () => {
        this.isConnected = true;
        this._setStatus('setup', 'Відправка налаштувань сесії...');

        // Send Setup message as first frame
        const setupMsg = GeminiLiveClient.createSetupMessage(this.model, this.systemPrompt);
        this._sendRaw(JSON.stringify(setupMsg));
      };

      this.ws.onmessage = (event) => {
        this._handleMessage(event.data);
      };

      this.ws.onerror = (err) => {
        const message = (err && err.message) || 'Помилка підключення до Gemini Live WebSocket';
        const errorObj = new Error(message);
        this._handleError(errorObj);
        if (this._setupReject) {
          this._setupReject(errorObj);
        }
      };

      this.ws.onclose = (event) => {
        this.isConnected = false;
        this.isSetupComplete = false;
        const details = event.reason || `Код: ${event.code}`;
        this._setStatus('disconnected', `З’єднання закрито (${details})`);

        if (this._setupReject) {
          this._setupReject(new Error(`З’єднання з Gemini Live закрито сервером (${details})`));
        }

        if (this.onClose) {
          this.onClose(event);
        }
      };
    });
  }

  /**
   * Send audio chunk (PCM 16-bit 16kHz base64)
   * Only transmits if setup is complete, otherwise buffers chunk
   * @param {string} base64Pcm
   */
  sendAudioChunk(base64Pcm) {
    if (!base64Pcm) return;

    if (!this.isConnected || !this.ws || this.ws.readyState !== 1 || !this.isSetupComplete) {
      // Buffer chunks briefly while connecting/setting up
      if (this.pendingChunks.length < 100) {
        this.pendingChunks.push(base64Pcm);
      }
      return;
    }

    const message = GeminiLiveClient.createAudioChunkMessage(base64Pcm);
    this._sendRaw(JSON.stringify(message));
  }

  /**
   * Commit active utterance into committedText and committedUtterances array.
   * Emits onTurnComplete with the finalized utterance and its index.
   * @returns {string} The committed utterance text
   */
  commitUtterance() {
    const trimmed = (this.currentUtteranceText || '').trim();
    const wasTranslated = Boolean(this.currentUtteranceIsTranslated);
    if (trimmed) {
      const merged = this.getFullText();
      const index = this.committedUtterances.length;
      this.committedUtterances.push(trimmed);
      this.committedText = merged;
      this.currentUtteranceText = '';
      this.currentUtteranceIsFinal = false;
      this.currentUtteranceIsTranslated = false;
      this.accumulatedText = this.committedText;

      if (this.onTurnComplete) {
        this.onTurnComplete(trimmed, index, wasTranslated);
      }
      return trimmed;
    }
    this.currentUtteranceIsFinal = false;
    this.currentUtteranceIsTranslated = false;
    return '';
  }

  /**
   * Alias for commitUtterance
   */
  commitTurn() {
    return this.commitUtterance();
  }

  /**
   * Signal manual turn complete to server if explicitly required
   */
  sendClientTurnComplete() {
    this.commitUtterance();
    if (!this.isConnected || !this.ws || this.ws.readyState !== 1) return;
    const msg = {
      clientContent: {
        turnComplete: true
      }
    };
    this._sendRaw(JSON.stringify(msg));
  }

  /**
   * Update an utterance by index (used for fast translation replacement)
   * @param {number} index
   * @param {string} newText
   */
  updateUtterance(index, newText) {
    if (typeof index === 'number' && index >= 0 && index < this.committedUtterances.length) {
      this.committedUtterances[index] = (newText || '').trim();
      this.committedText = this.committedUtterances.filter(Boolean).join(' ');
      this.accumulatedText = this.getFullText();
      if (this.onDelta) {
        this.onDelta('', this.currentUtteranceText, this.accumulatedText);
      }
    }
  }

  /**
   * Calculate full text combining committedText and current active utterance
   * Prevents phrase duplication when server sends cumulative or overlapping streams
   */
  getFullText() {
    const committed = (this.committedText || '').trim();
    const current = (this.currentUtteranceText || '').trim();
    if (!committed) return current;
    if (!current) return committed;

    // If current utterance already starts with committed (cumulative stream from server)
    if (current.toLowerCase().startsWith(committed.toLowerCase())) {
      return current;
    }

    return `${committed} ${current}`;
  }

  /**
   * Clear accumulated, committed, and current utterance transcriptions
   */
  clearTranscript() {
    this.committedUtterances = [];
    this.committedText = '';
    this.currentUtteranceText = '';
    this.currentUtteranceIsFinal = false;
    this.currentUtteranceIsTranslated = false;
    this.accumulatedText = '';
    this.pendingChunks = [];
  }

  /**
   * Disconnect the WebSocket session
   */
  disconnect() {
    this.isConnected = false;
    this.isSetupComplete = false;
    this.pendingChunks = [];
    this._setupResolve = null;
    this._setupReject = null;

    if (this.ws) {
      try {
        this.ws.onopen = null;
        this.ws.onmessage = null;
        this.ws.onerror = null;
        this.ws.onclose = null;
        this.ws.close(1000, 'User stopped session');
      } catch (e) {}
      this.ws = null;
    }
    this._setStatus('disconnected', 'З’єднання завершено.');
  }

  /**
   * Cleanly reset WebSocket session to discard server-side memory & in-flight frames
   */
  async resetSession() {
    this.clearTranscript();
    this.disconnect();
    return this.connect();
  }

  _sendRaw(str) {
    if (this.ws && this.ws.readyState === 1) {
      try {
        this.ws.send(str);
      } catch (err) {
        console.error('Error sending WS message:', err);
      }
    }
  }

  _flushPendingChunks() {
    if (this.pendingChunks.length > 0 && this.isConnected && this.isSetupComplete) {
      while (this.pendingChunks.length > 0) {
        const chunk = this.pendingChunks.shift();
        this.sendAudioChunk(chunk);
      }
    }
  }

  _handleMessage(rawData) {
    // If Blob received in browser, decode asynchronously
    if (typeof Blob !== 'undefined' && rawData instanceof Blob) {
      rawData.text().then(text => {
        this._handleMessage(text);
      }).catch(err => {
        this._handleError(err);
      });
      return;
    }

    const parsed = GeminiLiveClient.parseServerMessage(rawData);

    if (parsed.type === 'setup_complete') {
      this.isSetupComplete = true;
      this._setStatus('ready', 'Сесію успішно підтверджено. Готовий до запису.');
      this._flushPendingChunks();
      if (this._setupResolve) {
        this._setupResolve();
      }
      return;
    }

    if (parsed.type === 'error') {
      const err = new Error(parsed.error || 'Server error');
      err.code = parsed.code;
      err.status = parsed.status;
      this._handleError(err);
      if (this._setupReject) {
        this._setupReject(err);
      }
      return;
    }

    if (parsed.type === 'server_content') {
      this.lastDeltaTime = Date.now();

      if (parsed.interrupted) {
        if (this.onInterrupted) this.onInterrupted();
      }

      // Voice activity state tracking (does not prematurely split cumulative speech streams)

      // 1. Handle interim transcription: real-time streaming preview of active phrase
      if (parsed.interimText !== null && parsed.interimText !== undefined) {
        this.currentUtteranceText = parsed.interimText;
        this.currentUtteranceIsFinal = false;
        this.accumulatedText = this.getFullText();
        if (this.onDelta) {
          this.onDelta(parsed.interimText, this.currentUtteranceText, this.accumulatedText);
        }
      }

      // 2. Handle final output transcription (translation from gemini-3.5-live-translate-preview)
      //    or final input transcription (original speech)
      if (parsed.outputTranscriptionText !== null && parsed.outputTranscriptionText !== undefined) {
        this.currentUtteranceText = parsed.outputTranscriptionText;
        this.currentUtteranceIsFinal = true;
        this.currentUtteranceIsTranslated = true;
        this.accumulatedText = this.getFullText();
        if (this.onDelta) {
          this.onDelta(parsed.outputTranscriptionText, this.currentUtteranceText, this.accumulatedText);
        }
      } else if (parsed.inputText !== null && parsed.inputText !== undefined) {
        this.currentUtteranceText = parsed.inputText;
        this.currentUtteranceIsFinal = true;
        this.accumulatedText = this.getFullText();
        if (this.onDelta) {
          this.onDelta(parsed.inputText, this.currentUtteranceText, this.accumulatedText);
        }
      } else if (parsed.modelTurnText !== null && parsed.modelTurnText !== undefined) {
        // 3. Handle modelTurn deltas (for conversational or modelTurn streaming - only if STT/translate was absent)
        this.currentUtteranceText = (this.currentUtteranceText || '') + parsed.modelTurnText;
        this.currentUtteranceIsFinal = true;
        this.accumulatedText = this.getFullText();
        if (this.onDelta) {
          this.onDelta(parsed.modelTurnText, this.currentUtteranceText, this.accumulatedText);
        }
      } else if (parsed.interimText === null && parsed.inputText === null && parsed.outputTranscriptionText === null && parsed.textDeltas.length > 0) {
        // 4. Fallback for raw textDeltas if neither above was explicitly set
        for (const delta of parsed.textDeltas) {
          this.currentUtteranceText = (this.currentUtteranceText || '') + delta;
          this.currentUtteranceIsFinal = true;
          this.accumulatedText = this.getFullText();
          if (this.onDelta) {
            this.onDelta(delta, this.currentUtteranceText, this.accumulatedText);
          }
        }
      }

      // 5. Utterance completion triggers:
      // - generationComplete or turnComplete: server explicitly finished the generation
      // - voiceActivity: ACTIVITY_END only if the current utterance is finalized (inputTranscription was received)
      const shouldCommit = parsed.generationComplete ||
                           parsed.turnComplete ||
                           (parsed.voiceActivity === 'ACTIVITY_END' && this.currentUtteranceIsFinal);

      if (shouldCommit) {
        this.commitUtterance();
      }
    }
  }

  _setStatus(status, details = '') {
    this.status = status;
    if (this.onStatusChange) {
      this.onStatusChange(status, details);
    }
  }

  _handleError(err) {
    this._setStatus('error', err.message || 'Помилка');
    if (this.onError) {
      this.onError(err);
    }
  }
}

GeminiLiveClient.translateText = fastTranslateText;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    GeminiLiveClient
  };
}
