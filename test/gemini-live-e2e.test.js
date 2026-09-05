const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { WebSocketServer } = require('ws');
const { GeminiLiveClient } = require('../src/gemini-live-client.js');

describe('Gemini Live WebSocket Client E2E Simulation', () => {
  let server;
  let wss;
  let port;

  before((t, done) => {
    server = http.createServer();
    wss = new WebSocketServer({ server });

    wss.on('connection', (ws, req) => {
      let activeModel = '';

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());

          // If setup received, respond with setupComplete
          if (msg.setup) {
            activeModel = msg.setup.model || '';
            ws.send(JSON.stringify({ setupComplete: {} }));
          }

          // If audio chunk received, simulate speech response
          if (msg.realtimeInput && msg.realtimeInput.mediaChunks) {
            if (activeModel.includes('input-transcription-test')) {
              // Simulate dedicated inputTranscription envelope from Gemini 3.5 Transcribe Live
              ws.send(JSON.stringify({
                serverContent: {
                  inputTranscription: { text: 'Дослівна транскрипція 3.5' },
                  turnComplete: true
                }
              }));
            } else {
              ws.send(JSON.stringify({
                serverContent: {
                  modelTurn: {
                    parts: [{ text: 'Тестова ' }]
                  }
                }
              }));

              ws.send(JSON.stringify({
                serverContent: {
                  modelTurn: {
                    parts: [{ text: 'транскрипція.' }]
                  },
                  turnComplete: true
                }
              }));
            }
          }
        } catch (e) {}
      });
    });

    server.listen(0, '127.0.0.1', () => {
      port = server.address().port;
      done();
    });
  });

  after((t, done) => {
    for (const ws of wss.clients) {
      try { ws.terminate(); } catch (e) {}
    }
    wss.close(() => {
      server.close(done);
    });
  });

  it('should connect to mock server via real connect(), perform setup handshake, send audio, and receive streaming text deltas via modelTurn', async () => {
    const client = new GeminiLiveClient({
      apiKey: 'test-key',
      model: 'gemini-3.5-transcribe-live',
      endpointUrl: `ws://127.0.0.1:${port}`
    });

    const deltas = [];
    let turnCompletedText = '';

    client.onDelta = (delta, turn, full) => {
      deltas.push(delta);
    };

    client.onTurnComplete = (turnText) => {
      turnCompletedText = turnText;
    };

    // Real connect executes handshake and setupComplete confirmation
    await client.connect();

    assert.strictEqual(client.isConnected, true);
    assert.strictEqual(client.isSetupComplete, true);

    // Send a sample audio chunk
    client.sendAudioChunk('QUJDRA==');

    // Wait for response propagation
    await new Promise(r => setTimeout(r, 100));

    assert.ok(deltas.length >= 2, `Expected at least 2 deltas, got ${deltas.length}`);
    assert.strictEqual(deltas.join(''), 'Тестова транскрипція.');
    assert.strictEqual(turnCompletedText, 'Тестова транскрипція.');

    client.disconnect();
    assert.strictEqual(client.isConnected, false);
  });

  it('should receive and accumulate transcription deltas from dedicated inputTranscription envelope', async () => {
    const client = new GeminiLiveClient({
      apiKey: 'test-key',
      model: 'models/input-transcription-test',
      endpointUrl: `ws://127.0.0.1:${port}`
    });

    const deltas = [];
    let turnCompletedText = '';

    client.onDelta = (delta, turn, full) => {
      deltas.push(delta);
    };

    client.onTurnComplete = (turnText) => {
      turnCompletedText = turnText;
    };

    await client.connect();
    client.sendAudioChunk('QUJDRA==');

    await new Promise(r => setTimeout(r, 100));

    assert.strictEqual(deltas.length, 1);
    assert.strictEqual(deltas[0], 'Дослівна транскрипція 3.5');
    assert.strictEqual(turnCompletedText, 'Дослівна транскрипція 3.5');
    assert.strictEqual(client.accumulatedText, 'Дослівна транскрипція 3.5');

    client.disconnect();
  });
});
