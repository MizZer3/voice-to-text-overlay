using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace VoxFlow.Core
{
    public class ParsedServerMessage
    {
        public string Type { get; set; } = "unknown"; // "setup_complete" | "error" | "server_content" | "other" | "parse_error"
        public string? ErrorMessage { get; set; }
        public int? ErrorCode { get; set; }
        public string? InterimText { get; set; }
        public string? InputText { get; set; }
        public string? ModelTurnText { get; set; }
        public string? OutputTranscriptionText { get; set; }
        public string? VoiceActivity { get; set; }
        public bool TurnComplete { get; set; }
        public bool GenerationComplete { get; set; }
        public bool Interrupted { get; set; }
        public List<string> TextDeltas { get; set; } = new();
    }

    public class GeminiLiveClient : IDisposable
    {
        public string ApiKey { get; set; }
        public string Model { get; set; }
        public string SystemPrompt { get; set; }
        public string ApiVersion { get; set; } = "v1beta";

        private ClientWebSocket? _ws;
        private CancellationTokenSource? _receiveCts;
        private readonly SemaphoreSlim _sendLock = new(1, 1);
        private TaskCompletionSource<bool>? _setupTcs;

        public bool IsConnected { get; private set; }
        public bool IsSetupComplete { get; private set; }
        public string Status { get; private set; } = "disconnected";

        private readonly ConcurrentQueue<string> _pendingChunks = new();
        private readonly List<string> _committedUtterances = new();

        public string CommittedText { get; private set; } = "";
        public string CurrentUtteranceText { get; private set; } = "";
        public bool CurrentUtteranceIsFinal { get; private set; }
        public bool CurrentUtteranceIsTranslated { get; private set; }
        public string AccumulatedText { get; private set; } = "";

        public event Action<string, string>? OnStatusChange; // (status, details)
        public event Action<string, string, string>? OnDelta; // (deltaText, currentUtterance, fullText)
        public event Action<string, int, bool>? OnTurnComplete; // (turnText, index, wasTranslated)
        public event Action<Exception>? OnError;
        public event Action<string>? OnClose;

        public GeminiLiveClient(string apiKey = "", string model = "gemini-3.5-transcribe-live", string systemPrompt = "")
        {
            ApiKey = apiKey ?? "";
            Model = string.IsNullOrWhiteSpace(model) ? "gemini-3.5-transcribe-live" : model.Trim();
            SystemPrompt = systemPrompt ?? "";
        }

        public static string FormatModelName(string? model)
        {
            string trimmed = (model ?? "").Trim().TrimStart('/');
            if (string.IsNullOrEmpty(trimmed))
                return "models/gemini-3.5-transcribe-live";
            if (trimmed.StartsWith("models/", StringComparison.OrdinalIgnoreCase) ||
                trimmed.StartsWith("tunedModels/", StringComparison.OrdinalIgnoreCase) ||
                trimmed.StartsWith("projects/", StringComparison.OrdinalIgnoreCase))
            {
                return trimmed;
            }
            return $"models/{trimmed}";
        }

        public static string CreateSetupMessageJson(string model, string systemPrompt = "")
        {
            string formattedModel = FormatModelName(model);
            if (!string.IsNullOrWhiteSpace(systemPrompt))
            {
                var msg = new
                {
                    setup = new
                    {
                        model = formattedModel,
                        generationConfig = new
                        {
                            responseModalities = new[] { "TEXT" }
                        },
                        systemInstruction = new
                        {
                            parts = new[]
                            {
                                new { text = systemPrompt.Trim() }
                            }
                        }
                    }
                };
                return JsonSerializer.Serialize(msg);
            }
            else
            {
                var msg = new
                {
                    setup = new
                    {
                        model = formattedModel,
                        generationConfig = new
                        {
                            responseModalities = new[] { "TEXT" }
                        }
                    }
                };
                return JsonSerializer.Serialize(msg);
            }
        }

        public static string CreateAudioChunkMessageJson(string base64Pcm)
        {
            var msg = new
            {
                realtimeInput = new
                {
                    mediaChunks = new[]
                    {
                        new
                        {
                            mimeType = "audio/pcm;rate=16000",
                            data = base64Pcm
                        }
                    }
                }
            };
            return JsonSerializer.Serialize(msg);
        }

        public static ParsedServerMessage ParseServerMessage(string rawJson)
        {
            if (string.IsNullOrWhiteSpace(rawJson))
                return new ParsedServerMessage { Type = "unknown" };

            JsonDocument doc;
            try
            {
                doc = JsonDocument.Parse(rawJson);
            }
            catch (Exception ex)
            {
                return new ParsedServerMessage { Type = "parse_error", ErrorMessage = ex.Message };
            }

            using (doc)
            {
                var root = doc.RootElement;
                if (root.ValueKind != JsonValueKind.Object)
                    return new ParsedServerMessage { Type = "unknown" };

                if (root.TryGetProperty("setupComplete", out _))
                {
                    return new ParsedServerMessage { Type = "setup_complete" };
                }

                if (root.TryGetProperty("error", out var errEl))
                {
                    string msg = errEl.ValueKind == JsonValueKind.Object && errEl.TryGetProperty("message", out var m)
                        ? (m.GetString() ?? errEl.GetRawText())
                        : errEl.GetRawText();
                    int? code = errEl.ValueKind == JsonValueKind.Object && errEl.TryGetProperty("code", out var c) && c.TryGetInt32(out int ci)
                        ? ci
                        : null;
                    return new ParsedServerMessage
                    {
                        Type = "error",
                        ErrorMessage = msg,
                        ErrorCode = code
                    };
                }

                var result = new ParsedServerMessage { Type = "server_content" };

                // Check voiceActivity at top level or inside serverContent
                if (root.TryGetProperty("voiceActivity", out var vaTop) && vaTop.ValueKind == JsonValueKind.Object &&
                    vaTop.TryGetProperty("type", out var vaTypeTop))
                {
                    result.VoiceActivity = vaTypeTop.GetString();
                }

                JsonElement serverContent = default;
                bool hasServerContent = false;

                if (root.TryGetProperty("serverContent", out var sc) && sc.ValueKind == JsonValueKind.Object)
                {
                    serverContent = sc;
                    hasServerContent = true;
                }
                else if (root.TryGetProperty("inputTranscription", out _) ||
                         root.TryGetProperty("interimInputTranscription", out _) ||
                         root.TryGetProperty("modelTurn", out _))
                {
                    serverContent = root;
                    hasServerContent = true;
                }

                if (hasServerContent)
                {
                    if (serverContent.TryGetProperty("voiceActivity", out var vaInner) && vaInner.ValueKind == JsonValueKind.Object &&
                        vaInner.TryGetProperty("type", out var vaTypeInner))
                    {
                        result.VoiceActivity = vaTypeInner.GetString();
                    }

                    if (serverContent.TryGetProperty("interrupted", out var intr) && intr.ValueKind == JsonValueKind.True)
                        result.Interrupted = true;
                    if (serverContent.TryGetProperty("turnComplete", out var tc) && tc.ValueKind == JsonValueKind.True)
                        result.TurnComplete = true;
                    if (serverContent.TryGetProperty("generationComplete", out var gc) && gc.ValueKind == JsonValueKind.True)
                        result.GenerationComplete = true;

                    // 1. inputTranscription
                    if (serverContent.TryGetProperty("inputTranscription", out var it))
                    {
                        string text = ExtractEnvelopeText(it);
                        if (!string.IsNullOrEmpty(text))
                        {
                            result.InputText = text;
                            result.TextDeltas.Add(text);
                        }
                    }

                    // 2. interimInputTranscription
                    if (serverContent.TryGetProperty("interimInputTranscription", out var iit))
                    {
                        string text = ExtractEnvelopeText(iit);
                        if (!string.IsNullOrEmpty(text))
                        {
                            result.InterimText = text;
                            if (string.IsNullOrEmpty(result.InputText))
                                result.TextDeltas.Add(text);
                        }
                    }

                    // 3. modelTurn.parts
                    if (serverContent.TryGetProperty("modelTurn", out var mt) &&
                        mt.ValueKind == JsonValueKind.Object &&
                        mt.TryGetProperty("parts", out var parts) &&
                        parts.ValueKind == JsonValueKind.Array)
                    {
                        var sb = new StringBuilder();
                        foreach (var part in parts.EnumerateArray())
                        {
                            if (part.ValueKind == JsonValueKind.Object &&
                                part.TryGetProperty("text", out var pt) &&
                                pt.ValueKind == JsonValueKind.String)
                            {
                                string s = pt.GetString() ?? "";
                                if (!string.IsNullOrEmpty(s))
                                {
                                    sb.Append(s);
                                    if (string.IsNullOrEmpty(result.InputText))
                                        result.TextDeltas.Add(s);
                                }
                            }
                        }
                        if (sb.Length > 0)
                            result.ModelTurnText = sb.ToString();
                    }

                    // 4. outputTranscription
                    if (serverContent.TryGetProperty("outputTranscription", out var ot))
                    {
                        string text = ExtractEnvelopeText(ot);
                        if (!string.IsNullOrEmpty(text))
                        {
                            result.OutputTranscriptionText = text;
                            result.TextDeltas.Add(text);
                        }
                    }

                    return result;
                }

                if (!string.IsNullOrEmpty(result.VoiceActivity))
                    return result;

                return new ParsedServerMessage { Type = "other" };
            }
        }

        private static string ExtractEnvelopeText(JsonElement el)
        {
            if (el.ValueKind == JsonValueKind.String)
                return el.GetString() ?? "";
            if (el.ValueKind == JsonValueKind.Object)
            {
                if (el.TryGetProperty("text", out var t) && t.ValueKind == JsonValueKind.String)
                    return t.GetString() ?? "";
                if (el.TryGetProperty("parts", out var parts) && parts.ValueKind == JsonValueKind.Array)
                {
                    var sb = new StringBuilder();
                    foreach (var p in parts.EnumerateArray())
                    {
                        if (p.ValueKind == JsonValueKind.Object && p.TryGetProperty("text", out var pt) && pt.ValueKind == JsonValueKind.String)
                            sb.Append(pt.GetString());
                    }
                    return sb.ToString();
                }
            }
            return "";
        }

        public async Task ConnectAsync(CancellationToken cancellationToken = default)
        {
            if (_ws != null && (_ws.State == WebSocketState.Open || _ws.State == WebSocketState.Connecting))
                return;

            if (string.IsNullOrWhiteSpace(ApiKey))
            {
                var ex = new InvalidOperationException("Вкажіть ваш Gemini API Key у Налаштуваннях (⚙️).");
                HandleError(ex);
                throw ex;
            }

            SetStatus("connecting", "З'єднання з Gemini Live...");
            CurrentUtteranceText = "";
            CurrentUtteranceIsFinal = false;
            IsSetupComplete = false;
            while (_pendingChunks.TryDequeue(out _)) { }

            string url = $"wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.{ApiVersion}.GenerativeService.BidiGenerateContent?key={Uri.EscapeDataString(ApiKey.Trim())}";

            _ws?.Dispose();
            _ws = new ClientWebSocket();
            _ws.Options.KeepAliveInterval = TimeSpan.FromSeconds(15);

            _receiveCts?.Cancel();
            _receiveCts = new CancellationTokenSource();

            _setupTcs = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);

            try
            {
                using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                timeoutCts.CancelAfter(TimeSpan.FromSeconds(10));

                await _ws.ConnectAsync(new Uri(url), timeoutCts.Token);
                IsConnected = true;
                SetStatus("setup", "Ініціалізація сесії...");

                // Start background receive loop
                _ = Task.Run(() => ReceiveLoopAsync(_ws, _receiveCts.Token));

                // Send setup frame
                string setupJson = CreateSetupMessageJson(Model, SystemPrompt);
                await SendRawAsync(setupJson);

                // Wait for setupComplete
                using var reg = timeoutCts.Token.Register(() =>
                    _setupTcs.TrySetException(new TimeoutException("Тайм-аут ініціалізації Gemini Live (10с). Перевірте інтернет або API ключ.")));

                await _setupTcs.Task;
            }
            catch (Exception ex)
            {
                HandleError(ex);
                await DisconnectAsync();
                throw;
            }
        }

        public void SendAudioChunk(string base64Pcm)
        {
            if (string.IsNullOrEmpty(base64Pcm)) return;

            if (!IsConnected || _ws == null || _ws.State != WebSocketState.Open || !IsSetupComplete)
            {
                if (_pendingChunks.Count < 80)
                    _pendingChunks.Enqueue(base64Pcm);
                return;
            }

            string json = CreateAudioChunkMessageJson(base64Pcm);
            _ = SendRawAsync(json);
        }

        public string CommitUtterance()
        {
            string trimmed = (CurrentUtteranceText ?? "").Trim();
            bool wasTranslated = CurrentUtteranceIsTranslated;
            if (!string.IsNullOrEmpty(trimmed))
            {
                string merged = GetFullText();
                int index = _committedUtterances.Count;
                _committedUtterances.Add(trimmed);
                CommittedText = merged;
                CurrentUtteranceText = "";
                CurrentUtteranceIsFinal = false;
                CurrentUtteranceIsTranslated = false;
                AccumulatedText = CommittedText;

                OnTurnComplete?.Invoke(trimmed, index, wasTranslated);
                return trimmed;
            }

            CurrentUtteranceIsFinal = false;
            CurrentUtteranceIsTranslated = false;
            return "";
        }

        public void SendClientTurnComplete()
        {
            CommitUtterance();
            if (!IsConnected || _ws == null || _ws.State != WebSocketState.Open) return;
            const string msg = "{\"clientContent\":{\"turnComplete\":true}}";
            _ = SendRawAsync(msg);
        }

        public string GetFullText()
        {
            string committed = (CommittedText ?? "").Trim();
            string current = (CurrentUtteranceText ?? "").Trim();
            if (string.IsNullOrEmpty(committed)) return current;
            if (string.IsNullOrEmpty(current)) return committed;

            if (current.StartsWith(committed, StringComparison.OrdinalIgnoreCase))
                return current;

            return $"{committed} {current}";
        }

        public void ClearTranscript()
        {
            _committedUtterances.Clear();
            CommittedText = "";
            CurrentUtteranceText = "";
            CurrentUtteranceIsFinal = false;
            CurrentUtteranceIsTranslated = false;
            AccumulatedText = "";
            while (_pendingChunks.TryDequeue(out _)) { }
        }

        public async Task DisconnectAsync()
        {
            IsConnected = false;
            IsSetupComplete = false;
            while (_pendingChunks.TryDequeue(out _)) { }

            _receiveCts?.Cancel();

            var ws = _ws;
            _ws = null;
            if (ws != null)
            {
                try
                {
                    if (ws.State == WebSocketState.Open || ws.State == WebSocketState.CloseReceived)
                    {
                        using var cts = new CancellationTokenSource(TimeSpan.FromMilliseconds(500));
                        await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "Session stopped", cts.Token);
                    }
                }
                catch { }
                finally
                {
                    ws.Dispose();
                }
            }

            SetStatus("disconnected", "З'єднання завершено.");
        }

        private async Task SendRawAsync(string json)
        {
            var ws = _ws;
            if (ws == null || ws.State != WebSocketState.Open) return;

            byte[] bytes = Encoding.UTF8.GetBytes(json);
            await _sendLock.WaitAsync();
            try
            {
                if (ws.State == WebSocketState.Open)
                {
                    await ws.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, CancellationToken.None);
                }
            }
            catch
            {
                // Ignore send errors on closing socket
            }
            finally
            {
                _sendLock.Release();
            }
        }

        private void FlushPendingChunks()
        {
            while (IsConnected && IsSetupComplete && _pendingChunks.TryDequeue(out string? chunk))
            {
                SendAudioChunk(chunk);
            }
        }

        private async Task ReceiveLoopAsync(ClientWebSocket ws, CancellationToken token)
        {
            byte[] buffer = new byte[16384];
            using var ms = new MemoryStream();

            try
            {
                while (!token.IsCancellationRequested && ws.State == WebSocketState.Open)
                {
                    ms.SetLength(0);
                    WebSocketReceiveResult result;
                    do
                    {
                        result = await ws.ReceiveAsync(new ArraySegment<byte>(buffer), token);
                        if (result.MessageType == WebSocketMessageType.Close)
                        {
                            string closeReason = result.CloseStatusDescription ?? $"Code: {result.CloseStatus}";
                            IsConnected = false;
                            IsSetupComplete = false;
                            _setupTcs?.TrySetException(new Exception($"Сервер закрив з'єднання ({closeReason})"));
                            SetStatus("disconnected", $"З'єднання закрито ({closeReason})");
                            OnClose?.Invoke(closeReason);
                            return;
                        }
                        ms.Write(buffer, 0, result.Count);
                    }
                    while (!result.EndOfMessage);

                    string rawJson = Encoding.UTF8.GetString(ms.GetBuffer(), 0, (int)ms.Length);
                    HandleServerJson(rawJson);
                }
            }
            catch (OperationCanceledException)
            {
                // Normal cancellation
            }
            catch (Exception ex)
            {
                if (IsConnected)
                {
                    IsConnected = false;
                    IsSetupComplete = false;
                    _setupTcs?.TrySetException(ex);
                    HandleError(ex);
                    OnClose?.Invoke(ex.Message);
                }
            }
        }

        public void HandleServerJson(string rawJson)
        {
            var parsed = ParseServerMessage(rawJson);

            if (parsed.Type == "setup_complete")
            {
                IsSetupComplete = true;
                SetStatus("ready", "Готовий до запису.");
                FlushPendingChunks();
                _setupTcs?.TrySetResult(true);
                return;
            }

            if (parsed.Type == "error")
            {
                var ex = new Exception(parsed.ErrorMessage ?? "Помилка сервера Gemini Live");
                _setupTcs?.TrySetException(ex);
                HandleError(ex);
                return;
            }

            if (parsed.Type == "server_content")
            {
                if (!string.IsNullOrEmpty(parsed.InterimText))
                {
                    CurrentUtteranceText = parsed.InterimText;
                    CurrentUtteranceIsFinal = false;
                    AccumulatedText = GetFullText();
                    OnDelta?.Invoke(parsed.InterimText, CurrentUtteranceText, AccumulatedText);
                }

                if (!string.IsNullOrEmpty(parsed.OutputTranscriptionText))
                {
                    CurrentUtteranceText = parsed.OutputTranscriptionText;
                    CurrentUtteranceIsFinal = true;
                    CurrentUtteranceIsTranslated = true;
                    AccumulatedText = GetFullText();
                    OnDelta?.Invoke(parsed.OutputTranscriptionText, CurrentUtteranceText, AccumulatedText);
                }
                else if (!string.IsNullOrEmpty(parsed.InputText))
                {
                    CurrentUtteranceText = parsed.InputText;
                    CurrentUtteranceIsFinal = true;
                    AccumulatedText = GetFullText();
                    OnDelta?.Invoke(parsed.InputText, CurrentUtteranceText, AccumulatedText);
                }
                else if (!string.IsNullOrEmpty(parsed.ModelTurnText))
                {
                    CurrentUtteranceText = (CurrentUtteranceText ?? "") + parsed.ModelTurnText;
                    CurrentUtteranceIsFinal = true;
                    AccumulatedText = GetFullText();
                    OnDelta?.Invoke(parsed.ModelTurnText, CurrentUtteranceText, AccumulatedText);
                }
                else if (parsed.InterimText == null && parsed.InputText == null && parsed.OutputTranscriptionText == null && parsed.TextDeltas.Count > 0)
                {
                    foreach (string delta in parsed.TextDeltas)
                    {
                        CurrentUtteranceText = (CurrentUtteranceText ?? "") + delta;
                        CurrentUtteranceIsFinal = true;
                        AccumulatedText = GetFullText();
                        OnDelta?.Invoke(delta, CurrentUtteranceText, AccumulatedText);
                    }
                }

                bool shouldCommit = parsed.GenerationComplete ||
                                    parsed.TurnComplete ||
                                    (parsed.VoiceActivity == "ACTIVITY_END" && CurrentUtteranceIsFinal);

                if (shouldCommit)
                {
                    CommitUtterance();
                }
            }
        }

        private void SetStatus(string status, string details)
        {
            Status = status;
            OnStatusChange?.Invoke(status, details);
        }

        private void HandleError(Exception ex)
        {
            SetStatus("error", ex.Message);
            OnError?.Invoke(ex);
        }

        public void Dispose()
        {
            _receiveCts?.Cancel();
            _ws?.Dispose();
            _sendLock.Dispose();
        }
    }
}
