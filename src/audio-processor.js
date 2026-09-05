/**
 * Audio Capture, Downsampling, PCM 16-bit encoding, and VAD (Voice Activity Detection)
 */

/**
 * Downsample Float32 audio buffer from inputSampleRate to targetSampleRate (e.g. 16000Hz)
 * Using linear interpolation for high fidelity and zero external dependencies.
 * @param {Float32Array} buffer - Source audio samples
 * @param {number} inputRate - Source sample rate (e.g. 44100, 48000)
 * @param {number} outputRate - Target sample rate (e.g. 16000)
 * @returns {Float32Array}
 */
function downsampleBuffer(buffer, inputRate, outputRate = 16000) {
  if (!buffer || buffer.length === 0) {
    return new Float32Array(0);
  }
  if (inputRate === outputRate) {
    return buffer;
  }
  if (inputRate < outputRate) {
    // If input is lower than output, return buffer as-is
    return buffer;
  }

  const sampleRateRatio = inputRate / outputRate;
  const newLength = Math.round(buffer.length / sampleRateRatio);
  const result = new Float32Array(newLength);

  let offsetResult = 0;
  let offsetBuffer = 0;

  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
      accum += buffer[i];
      count++;
    }
    result[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }

  return result;
}

/**
 * Convert Float32Array [-1.0, 1.0] to 16-bit linear PCM (Int16Array)
 * @param {Float32Array} float32Array
 * @returns {Int16Array}
 */
function floatTo16BitPCM(float32Array) {
  if (!float32Array) return new Int16Array(0);
  const pcm16 = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return pcm16;
}

/**
 * Convert Int16Array to base64 string
 * Compatible with both Node.js (Buffer) and browser (Uint8Array + btoa)
 * @param {Int16Array} pcm16Array
 * @returns {string}
 */
function pcm16ToBase64(pcm16Array) {
  if (!pcm16Array || pcm16Array.length === 0) return '';
  const buffer = pcm16Array.buffer;
  const uint8 = new Uint8Array(buffer, pcm16Array.byteOffset, pcm16Array.byteLength);

  if (typeof Buffer !== 'undefined') {
    return Buffer.from(uint8).toString('base64');
  }

  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < uint8.length; i += chunkSize) {
    const chunk = uint8.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}

/**
 * Calculate Root Mean Square (RMS) of audio buffer to determine volume
 * @param {Float32Array} buffer
 * @returns {number} RMS in range [0, 1]
 */
function calculateRMS(buffer) {
  if (!buffer || buffer.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) {
    sum += buffer[i] * buffer[i];
  }
  return Math.sqrt(sum / buffer.length);
}

/**
 * AudioRecorder class managing MediaStream, Web Audio API processing, downsampling, and VAD
 */
class AudioRecorder {
  /**
   * @param {Object} options
   * @param {number} [options.targetSampleRate=16000] - Sample rate for Gemini Live
   * @param {number} [options.vadThreshold=0.018] - RMS threshold to detect voice activity
   * @param {number} [options.silenceTimeoutMs=1800] - Silence duration before triggering silence event
   * @param {string} [options.deviceId] - Specific audioinput device ID
   */
  constructor(options = {}) {
    this.targetSampleRate = options.targetSampleRate || 16000;
    this.vadThreshold = options.vadThreshold !== undefined ? options.vadThreshold : 0.018;
    this.silenceTimeoutMs = options.silenceTimeoutMs !== undefined ? options.silenceTimeoutMs : 1800;
    this.hangoverDurationMs = options.hangoverDurationMs !== undefined ? options.hangoverDurationMs : 700;
    this.deviceId = options.deviceId || null;

    this.audioContext = null;
    this.mediaStream = null;
    this.sourceNode = null;
    this.processorNode = null;
    this.muteNode = null;
    this.isRecording = false;

    // VAD & Token-saving state
    this.hasDetectedSpeech = false;
    this.isSilentSuppressed = false;
    this.lastSpeechTime = 0;
    this.preBuffer = []; // Circular pre-speech buffer to avoid clipping onset

    // Event callbacks
    this.onAudioChunk = null; // (base64Pcm, rawRms) => void
    this.onRmsUpdate = null; // (rmsNormalized0To100, isSpeaking) => void
    this.onSilenceDetected = null; // () => void
    this.onError = null; // (err) => void
  }

  setVadThreshold(threshold) {
    this.vadThreshold = threshold;
  }

  setSilenceTimeoutMs(ms) {
    this.silenceTimeoutMs = ms;
  }

  setHangoverDurationMs(ms) {
    this.hangoverDurationMs = ms;
  }

  setDeviceId(id) {
    this.deviceId = id;
  }

  /**
   * List available audio input devices
   */
  static async getAudioInputDevices() {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
      return [];
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter(d => d.kind === 'audioinput');
    } catch (err) {
      console.error('Error enumerating audio devices:', err);
      return [];
    }
  }

  /**
   * Start microphone capture
   */
  async start() {
    if (this.isRecording) return;

    try {
      const AudioContextClass = (typeof window !== 'undefined') ? (window.AudioContext || window.webkitAudioContext) : null;
      if (!AudioContextClass) {
        throw new Error('Web Audio API is not supported in this environment');
      }

      const constraints = {
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          ...(this.deviceId ? { deviceId: { exact: this.deviceId } } : {})
        }
      };

      this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);

      // Attempt to initialize AudioContext with targetSampleRate or native
      try {
        this.audioContext = new AudioContextClass({ sampleRate: this.targetSampleRate });
      } catch (e) {
        this.audioContext = new AudioContextClass();
      }

      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);

      // Buffer size 4096 (~85ms chunks at 48kHz, ~256ms at 16kHz)
      const bufferSize = 4096;
      this.processorNode = this.audioContext.createScriptProcessor(bufferSize, 1, 1);

      // Zero-gain mute node to keep ScriptProcessor running without speaker feedback
      this.muteNode = this.audioContext.createGain();
      this.muteNode.gain.value = 0;

      this.hasDetectedSpeech = false;
      this.isSilentSuppressed = true; // Start in suppressed state to prevent sending initial room noise
      this.lastSpeechTime = 0;
      this.hangoverDurationMs = this.hangoverDurationMs !== undefined ? this.hangoverDurationMs : 700;
      this.preBuffer = [];
      this.isRecording = true;

      this.processorNode.onaudioprocess = (event) => {
        if (!this.isRecording) return;

        // Ensure output buffer is zeroed out to prevent microphone speaker bleed
        const outputBuffer = event.outputBuffer.getChannelData(0);
        outputBuffer.fill(0);

        const inputBuffer = event.inputBuffer.getChannelData(0);
        const inputSampleRate = this.audioContext.sampleRate;

        // Calculate RMS for VAD
        const rms = calculateRMS(inputBuffer);
        const normalizedRms = Math.min(100, Math.round(rms * 100 * 4));
        const isVoiceActive = rms >= this.vadThreshold;
        const now = Date.now();

        // Downsample to 16kHz PCM
        const downsampled = downsampleBuffer(inputBuffer, inputSampleRate, this.targetSampleRate);
        const pcm16 = floatTo16BitPCM(downsampled);
        const base64 = pcm16ToBase64(pcm16);

        if (isVoiceActive) {
          // If we were suppressing chunks due to silence, resume and flush pre-buffer
          if (this.isSilentSuppressed) {
            this.isSilentSuppressed = false;
            while (this.preBuffer.length > 0) {
              const bufferedChunk = this.preBuffer.shift();
              if (this.onAudioChunk) {
                this.onAudioChunk(bufferedChunk, this.vadThreshold);
              }
            }
          }
          this.hasDetectedSpeech = true;
          this.lastSpeechTime = now;
        }

        // Emit RMS update for visualizer waveform
        if (this.onRmsUpdate) {
          this.onRmsUpdate(normalizedRms, isVoiceActive);
        }

        // Silence check when user stops speaking
        if (this.hasDetectedSpeech && !isVoiceActive) {
          const silentDuration = now - this.lastSpeechTime;

          // Activate silence suppression after short hangover to prevent sending room noise/hiss
          if (silentDuration > this.hangoverDurationMs && !this.isSilentSuppressed) {
            this.isSilentSuppressed = true;
          }

          // Trigger silence detection event on timeout (signals turn completion)
          if (silentDuration >= this.silenceTimeoutMs) {
            this.hasDetectedSpeech = false;
            this.isSilentSuppressed = true;
            if (this.onSilenceDetected) {
              this.onSilenceDetected();
            }
          }
        }

        // Token saving & hallucination protection:
        // When silence suppression is active, do NOT send audio to server
        if (this.isSilentSuppressed) {
          // Keep small pre-buffer of last 2 chunks (~170ms) to capture first syllable when speech resumes
          if (base64) {
            if (this.preBuffer.length >= 2) this.preBuffer.shift();
            this.preBuffer.push(base64);
          }
          return;
        }

        if (this.onAudioChunk && base64) {
          this.onAudioChunk(base64, rms);
        }
      };

      this.sourceNode.connect(this.processorNode);
      this.processorNode.connect(this.muteNode);
      this.muteNode.connect(this.audioContext.destination);

    } catch (err) {
      this.stop();
      if (this.onError) {
        this.onError(err);
      }
      throw err;
    }
  }

  /**
   * Stop audio capture and release resources
   */
  stop() {
    this.isRecording = false;
    this.hasDetectedSpeech = false;
    this.isSilentSuppressed = false;
    this.preBuffer = [];

    if (this.processorNode) {
      try {
        this.processorNode.disconnect();
        this.processorNode.onaudioprocess = null;
      } catch (e) {}
      this.processorNode = null;
    }

    if (this.muteNode) {
      try {
        this.muteNode.disconnect();
      } catch (e) {}
      this.muteNode = null;
    }

    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch (e) {}
      this.sourceNode = null;
    }

    if (this.mediaStream) {
      try {
        this.mediaStream.getTracks().forEach(track => track.stop());
      } catch (e) {}
      this.mediaStream = null;
    }

    if (this.audioContext) {
      try {
        this.audioContext.close();
      } catch (e) {}
      this.audioContext = null;
    }

    if (this.onRmsUpdate) {
      this.onRmsUpdate(0, false);
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    downsampleBuffer,
    floatTo16BitPCM,
    pcm16ToBase64,
    calculateRMS,
    AudioRecorder
  };
}
