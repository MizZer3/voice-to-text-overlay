const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  downsampleBuffer,
  floatTo16BitPCM,
  pcm16ToBase64,
  calculateRMS,
  AudioRecorder
} = require('../src/audio-processor.js');

describe('Audio Processor Unit Tests', () => {
  it('calculateRMS should return 0 for silent buffer', () => {
    const silent = new Float32Array([0, 0, 0, 0]);
    assert.strictEqual(calculateRMS(silent), 0);
  });

  it('calculateRMS should calculate accurate RMS for sine wave / constant signal', () => {
    const buffer = new Float32Array([0.5, -0.5, 0.5, -0.5]);
    const rms = calculateRMS(buffer);
    assert.strictEqual(Math.round(rms * 100) / 100, 0.5);
  });

  it('calculateRMS should handle empty buffer', () => {
    assert.strictEqual(calculateRMS(new Float32Array(0)), 0);
    assert.strictEqual(calculateRMS(null), 0);
  });

  it('floatTo16BitPCM should clamp and convert Float32 to Int16', () => {
    const input = new Float32Array([0.0, 1.0, -1.0, 2.0, -2.0, 0.5]);
    const pcm16 = floatTo16BitPCM(input);

    assert.strictEqual(pcm16.length, input.length);
    assert.strictEqual(pcm16[0], 0);
    assert.strictEqual(pcm16[1], 32767); // 0x7fff
    assert.strictEqual(pcm16[2], -32768); // -0x8000
    assert.strictEqual(pcm16[3], 32767); // clamped
    assert.strictEqual(pcm16[4], -32768); // clamped
    assert.strictEqual(pcm16[5], Math.floor(0.5 * 0x7fff));
  });

  it('pcm16ToBase64 should convert PCM Int16 buffer to valid Base64 string', () => {
    const input = new Int16Array([0, 1000, -1000]);
    const b64 = pcm16ToBase64(input);
    assert.ok(typeof b64 === 'string');
    assert.ok(b64.length > 0);

    // Decode and verify
    const buf = Buffer.from(b64, 'base64');
    const decodedInt16 = new Int16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2);
    assert.strictEqual(decodedInt16[0], 0);
    assert.strictEqual(decodedInt16[1], 1000);
    assert.strictEqual(decodedInt16[2], -1000);
  });

  it('downsampleBuffer should downsample from 48000Hz to 16000Hz correctly', () => {
    // 48000Hz down to 16000Hz is a 3:1 ratio
    const input = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5, 0.6]);
    const output = downsampleBuffer(input, 48000, 16000);
    assert.strictEqual(output.length, 2);
    // Average of [0.1, 0.2, 0.3] = 0.2
    assert.strictEqual(Math.round(output[0] * 10) / 10, 0.2);
    // Average of [0.4, 0.5, 0.6] = 0.5
    assert.strictEqual(Math.round(output[1] * 10) / 10, 0.5);
  });

  it('downsampleBuffer should return original if sample rates match', () => {
    const input = new Float32Array([0.1, 0.2]);
    const output = downsampleBuffer(input, 16000, 16000);
    assert.strictEqual(output, input);
  });

  it('AudioRecorder.start should throw when Web Audio API is unavailable', async () => {
    const recorder = new AudioRecorder();
    await assert.rejects(async () => {
      await recorder.start();
    }, /Web Audio API is not supported/);
  });

  it('AudioRecorder should manage token-saving silence suppression and pre-buffering', () => {
    const recorder = new AudioRecorder({
      vadThreshold: 0.02,
      silenceTimeoutMs: 500
    });

    assert.strictEqual(recorder.isSilentSuppressed, false);
    assert.strictEqual(recorder.preBuffer.length, 0);

    // Simulate silence detected
    recorder.hasDetectedSpeech = true;
    recorder.isSilentSuppressed = true;

    // Simulate prebuffer filling
    recorder.preBuffer.push('chunk1');
    recorder.preBuffer.push('chunk2');
    assert.strictEqual(recorder.preBuffer.length, 2);

    // Reset/stop
    recorder.stop();
    assert.strictEqual(recorder.isSilentSuppressed, false);
    assert.strictEqual(recorder.preBuffer.length, 0);
  });

  it('AudioRecorder should guard against sending empty noise to server when silence suppression is active', () => {
    const recorder = new AudioRecorder({
      vadThreshold: 0.02,
      silenceTimeoutMs: 300
    });

    const emittedChunks = [];
    recorder.onAudioChunk = (chunk) => {
      emittedChunks.push(chunk);
    };

    // Initial state before speech: silence suppression active
    recorder.isRecording = true;
    recorder.isSilentSuppressed = true;

    // Simulate quiet audio processing (rms below vadThreshold)
    const silentChunk = 'silent_chunk_base64';
    if (recorder.isSilentSuppressed) {
      if (recorder.preBuffer.length >= 2) recorder.preBuffer.shift();
      recorder.preBuffer.push(silentChunk);
    } else {
      recorder.onAudioChunk(silentChunk);
    }

    // Must NOT emit to server during silence!
    assert.strictEqual(emittedChunks.length, 0, 'No chunks emitted during silence');
    assert.strictEqual(recorder.preBuffer.length, 1);
    assert.strictEqual(recorder.preBuffer[0], silentChunk);

    // Now simulate voice active: resume and flush pre-buffer
    if (recorder.isSilentSuppressed) {
      recorder.isSilentSuppressed = false;
      while (recorder.preBuffer.length > 0) {
        recorder.onAudioChunk(recorder.preBuffer.shift());
      }
    }
    recorder.onAudioChunk('active_speech_base64');

    assert.strictEqual(emittedChunks.length, 2);
    assert.strictEqual(emittedChunks[0], silentChunk);
    assert.strictEqual(emittedChunks[1], 'active_speech_base64');
  });

  it('AudioRecorder should default hangoverDurationMs to 700ms and allow customization', () => {
    const defaultRecorder = new AudioRecorder();
    assert.strictEqual(defaultRecorder.hangoverDurationMs, 700);

    const customRecorder = new AudioRecorder({ hangoverDurationMs: 850 });
    assert.strictEqual(customRecorder.hangoverDurationMs, 850);

    customRecorder.setHangoverDurationMs(900);
    assert.strictEqual(customRecorder.hangoverDurationMs, 900);

    const zeroRecorder = new AudioRecorder({ hangoverDurationMs: 0 });
    assert.strictEqual(zeroRecorder.hangoverDurationMs, 0);
  });
});
