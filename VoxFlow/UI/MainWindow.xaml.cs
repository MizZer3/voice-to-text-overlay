using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Threading;
using VoxFlow.Audio;
using VoxFlow.Core;
using VoxFlow.Native;

namespace VoxFlow.UI
{
    public partial class MainWindow : Window
    {
        private AppConfig _config;
        private readonly NativeAudioRecorder _recorder;
        private GeminiLiveClient? _liveClient;
        private WhisperHudWindow? _hudWindow;
        private System.Windows.Forms.NotifyIcon? _trayIcon;

        private readonly DispatcherTimer _foregroundPollTimer;
        private readonly DispatcherTimer _recordingClockTimer;
        private readonly DispatcherTimer _feedbackHideTimer;

        private bool _isRecording;
        private bool _isTestingMic;
        private bool _isStartingOrStopping;
        private bool _isSettingsOpen;
        private bool _isTranslating;
        private bool _isProgrammaticTextUpdate;
        private bool _isApiKeyVisible;
        private bool _isExiting;

        private string? _capturingHotkeyTarget; // "record" | "global" | null
        private string _pendingModifierChord = "";
        private string _tempRecordHotkey = "";
        private string _tempGlobalHotkey = "";

        private double _savedCompactWidth = 455;
        private double _savedCompactHeight = 320;

        // Transcript checkpoint & session paste tracking
        private string _baseTextBeforeSpeech = "";
        private string _rawCheckpoint = "";
        private string _lastRawStream = "";
        private string _sessionStartText = "";
        private int _pastedRawLengthInSession;

        private DateTime _recordStartTime;
        private readonly Border[] _miniBars;

        public MainWindow()
        {
            InitializeComponent();

            _miniBars = new[] { MiniBar0, MiniBar1, MiniBar2, MiniBar3, MiniBar4, MiniBar5 };
            _config = ConfigManager.Load();
            _recorder = new NativeAudioRecorder();

            _recorder.OnAudioChunk += OnRecorderAudioChunk;
            _recorder.OnLevelUpdate += OnRecorderLevelUpdate;
            _recorder.OnSilenceDetected += OnRecorderSilenceDetected;
            _recorder.OnError += OnRecorderError;

            _foregroundPollTimer = new DispatcherTimer
            {
                Interval = TimeSpan.FromMilliseconds(150)
            };
            _foregroundPollTimer.Tick += ForegroundPollTimer_Tick;

            _recordingClockTimer = new DispatcherTimer
            {
                Interval = TimeSpan.FromSeconds(1)
            };
            _recordingClockTimer.Tick += RecordingClockTimer_Tick;

            _feedbackHideTimer = new DispatcherTimer
            {
                Interval = TimeSpan.FromSeconds(2.6)
            };
            _feedbackHideTimer.Tick += (_, _) =>
            {
                FeedbackBar.Visibility = Visibility.Collapsed;
                _feedbackHideTimer.Stop();
            };

            Loaded += MainWindow_Loaded;
            Closing += MainWindow_Closing;
        }

        private void MainWindow_Loaded(object sender, RoutedEventArgs e)
        {
            InitializeTrayAndAppIcon();
            InitializeHudWindow();
            PopulateDropdowns();
            ApplyConfigToUi();

            Win32Helper.ConfigureHotkeys(_config.GlobalHotkey, _config.RecordHotkey);
            Win32Helper.OnToggleOverlayHotkeyPressed += ToggleWindowVisibility;
            Win32Helper.OnRecordHotkeyDown += HandleRecordHotkeyDown;
            Win32Helper.OnRecordHotkeyUp += HandleRecordHotkeyUp;
            Win32Helper.InstallGlobalKeyboardHook();

            _foregroundPollTimer.Start();
        }

        private void InitializeHudWindow()
        {
            _hudWindow = new WhisperHudWindow();
            _hudWindow.OnStopRequested += () =>
            {
                if (_isRecording)
                {
                    _ = StopRecordingAsync();
                }
            };
        }

        private void InitializeTrayAndAppIcon()
        {
            try
            {
                using Bitmap bmp = new(32, 32);
                using (Graphics g = Graphics.FromImage(bmp))
                {
                    g.SmoothingMode = SmoothingMode.AntiAlias;
                    using var bgBrush = new System.Drawing.Drawing2D.LinearGradientBrush(
                        new System.Drawing.Point(0, 0),
                        new System.Drawing.Point(32, 32),
                        System.Drawing.Color.FromArgb(79, 70, 229),
                        System.Drawing.Color.FromArgb(124, 58, 237));

                    using var path = CreateRoundedRectPath(new System.Drawing.Rectangle(2, 2, 28, 28), 8);
                    g.FillPath(bgBrush, path);

                    using var whitePen = new System.Drawing.Pen(System.Drawing.Color.White, 2.2f)
                    {
                        StartCap = LineCap.Round,
                        EndCap = LineCap.Round
                    };
                    using var whiteBrush = new System.Drawing.SolidBrush(System.Drawing.Color.White);

                    // Draw stylized microphone capsule + wave
                    g.FillRectangle(whiteBrush, 13, 8, 6, 10);
                    g.DrawArc(whitePen, 10, 11, 12, 10, 0, 180);
                    g.DrawLine(whitePen, 16, 21, 16, 25);
                    g.DrawLine(whitePen, 12, 25, 20, 25);
                }

                IntPtr hIcon = bmp.GetHicon();
                System.Drawing.Icon drawingIcon = System.Drawing.Icon.FromHandle(hIcon);

                Icon = Imaging.CreateBitmapSourceFromHIcon(
                    hIcon,
                    Int32Rect.Empty,
                    BitmapSizeOptions.FromEmptyOptions());

                _trayIcon = new System.Windows.Forms.NotifyIcon
                {
                    Icon = drawingIcon,
                    Text = $"VoxFlow — Голосове введення ({_config.RecordHotkey})",
                    Visible = true
                };

                var menu = new System.Windows.Forms.ContextMenuStrip();
                menu.Items.Add("Показати / Сховати VoxFlow", null, (_, _) => Dispatcher.Invoke(ToggleWindowVisibility));
                menu.Items.Add("Почати / Зупинити запис", null, (_, _) => Dispatcher.Invoke(() => _ = ToggleRecordingAsync()));
                menu.Items.Add("Налаштування", null, (_, _) => Dispatcher.Invoke(() =>
                {
                    ShowAndActivateWindow();
                    if (!_isSettingsOpen) OpenSettingsView();
                }));
                menu.Items.Add(new System.Windows.Forms.ToolStripSeparator());
                menu.Items.Add("Вихід", null, (_, _) => Dispatcher.Invoke(ExitApplication));

                _trayIcon.ContextMenuStrip = menu;
                _trayIcon.MouseClick += (_, args) =>
                {
                    if (args.Button == System.Windows.Forms.MouseButtons.Left)
                    {
                        Dispatcher.Invoke(ToggleWindowVisibility);
                    }
                };
            }
            catch
            {
                // Ignore tray creation errors in headless environments
            }
        }

        private static GraphicsPath CreateRoundedRectPath(Rectangle bounds, int radius)
        {
            int d = radius * 2;
            var path = new GraphicsPath();
            path.AddArc(bounds.X, bounds.Y, d, d, 180, 90);
            path.AddArc(bounds.Right - d, bounds.Y, d, d, 270, 90);
            path.AddArc(bounds.Right - d, bounds.Bottom - d, d, d, 0, 90);
            path.AddArc(bounds.X, bounds.Bottom - d, d, d, 90, 90);
            path.CloseFigure();
            return path;
        }

        private void PopulateDropdowns()
        {
            var whiteText = new SolidColorBrush(System.Windows.Media.Color.FromRgb(0xF8, 0xFA, 0xFC));

            // 1. Quick Target Language Combo on bottom bar
            QuickTargetLangCombo.Items.Clear();
            foreach (var lang in Prompts.SupportedTargetLanguages)
            {
                var item = new ComboBoxItem
                {
                    Tag = lang.Code,
                    Content = lang.ShortLabel,
                    ToolTip = lang.Name,
                    Foreground = whiteText
                };
                QuickTargetLangCombo.Items.Add(item);
            }

            // 2. Spoken Language Combo in Settings
            SpokenLanguageCombo.Items.Clear();
            foreach (var sl in Prompts.SupportedSpokenLanguages)
            {
                SpokenLanguageCombo.Items.Add(new ComboBoxItem
                {
                    Tag = sl.Code,
                    Content = sl.Name,
                    Foreground = whiteText
                });
            }

            // 3. Model Combo in Settings
            ModelCombo.Items.Clear();
            foreach (var m in Prompts.DefaultModels)
            {
                ModelCombo.Items.Add(new ComboBoxItem
                {
                    Tag = m.Id,
                    Content = m.Name,
                    Foreground = whiteText
                });
            }

            // 4. Microphones
            RefreshMicrophoneList();
        }

        private void RefreshMicrophoneList()
        {
            var whiteText = new SolidColorBrush(System.Windows.Media.Color.FromRgb(0xF8, 0xFA, 0xFC));
            MicDeviceCombo.Items.Clear();
            var devices = NativeAudioRecorder.GetInputDevices();
            foreach (var dev in devices)
            {
                MicDeviceCombo.Items.Add(new ComboBoxItem
                {
                    Tag = dev.DeviceId,
                    Content = dev.Name,
                    Foreground = whiteText
                });
            }

            SelectComboItemByTag(MicDeviceCombo, _config.DeviceId);
            if (MicDeviceCombo.SelectedIndex < 0 && MicDeviceCombo.Items.Count > 0)
            {
                MicDeviceCombo.SelectedIndex = 0;
            }
        }

        private void ApplyConfigToUi()
        {
            Topmost = _config.AlwaysOnTop;
            PinBtn.Foreground = _config.AlwaysOnTop
                ? new SolidColorBrush(System.Windows.Media.Color.FromRgb(0x81, 0x8C, 0xF8))
                : new SolidColorBrush(System.Windows.Media.Color.FromRgb(0x64, 0x74, 0x8B));

            MainWindowBorder.Opacity = Math.Clamp(_config.WindowOpacity / 100.0, 0.45, 1.0);

            TranscriptBox.FontSize = _config.FontSize switch
            {
                "small" => 12.5,
                "large" => 16.0,
                _ => 14.0
            };

            UpdateModeButtonsUi();
            UpdateAutoPasteButtonUi();
            UpdateLanguageLockBadgeUi();
            SelectComboItemByTag(QuickTargetLangCombo, _config.TargetLanguage);

            ApiKeyBanner.Visibility = string.IsNullOrWhiteSpace(_config.ApiKey)
                ? Visibility.Visible
                : Visibility.Collapsed;

            RecordBtn.ToolTip = $"Почати / зупинити запис ({_config.RecordHotkey})";

            // Configure recorder parameters
            _recorder.VadThreshold = _config.VadThreshold;
            _recorder.MicGainPercent = _config.MicGainPercent;
            _recorder.SilenceTimeoutMs = _config.SilenceTimeoutMs;
            _recorder.DeviceId = _config.DeviceId;
            _recorder.VoiceBoost = _config.VoiceBoost;
        }

        private void UpdateModeButtonsUi()
        {
            bool isPolish = _config.Mode == "smart_polish";

            ModeSmartPolishBtn.Background = isPolish
                ? new SolidColorBrush(System.Windows.Media.Color.FromArgb(0x33, 0x63, 0x66, 0xF1))
                : System.Windows.Media.Brushes.Transparent;
            ModeSmartPolishBtn.BorderBrush = isPolish
                ? new SolidColorBrush(System.Windows.Media.Color.FromArgb(0x77, 0x63, 0x66, 0xF1))
                : System.Windows.Media.Brushes.Transparent;
            ModeSmartPolishBtn.Foreground = isPolish
                ? new SolidColorBrush(System.Windows.Media.Color.FromRgb(0xE0, 0xE7, 0xFF))
                : new SolidColorBrush(System.Windows.Media.Color.FromRgb(0x94, 0xA3, 0xB8));

            ModeVerbatimBtn.Background = !isPolish
                ? new SolidColorBrush(System.Windows.Media.Color.FromArgb(0x33, 0x63, 0x66, 0xF1))
                : System.Windows.Media.Brushes.Transparent;
            ModeVerbatimBtn.BorderBrush = !isPolish
                ? new SolidColorBrush(System.Windows.Media.Color.FromArgb(0x77, 0x63, 0x66, 0xF1))
                : System.Windows.Media.Brushes.Transparent;
            ModeVerbatimBtn.Foreground = !isPolish
                ? new SolidColorBrush(System.Windows.Media.Color.FromRgb(0xE0, 0xE7, 0xFF))
                : new SolidColorBrush(System.Windows.Media.Color.FromRgb(0x94, 0xA3, 0xB8));
        }

        private void UpdateAutoPasteButtonUi()
        {
            if (_config.DirectPaste)
            {
                AutoPasteBtn.Background = new SolidColorBrush(System.Windows.Media.Color.FromArgb(0x28, 0x10, 0xB9, 0x81));
                AutoPasteBtn.BorderBrush = new SolidColorBrush(System.Windows.Media.Color.FromArgb(0x88, 0x10, 0xB9, 0x81));
                AutoPasteBtn.Foreground = new SolidColorBrush(System.Windows.Media.Color.FromRgb(0xD1, 0xFA, 0xE5));
                AutoPasteDot.Fill = new SolidColorBrush(System.Windows.Media.Color.FromRgb(0x10, 0xB9, 0x81));
            }
            else
            {
                AutoPasteBtn.Background = new SolidColorBrush(System.Windows.Media.Color.FromRgb(0x1E, 0x22, 0x30));
                AutoPasteBtn.BorderBrush = new SolidColorBrush(System.Windows.Media.Color.FromRgb(0x33, 0x41, 0x55));
                AutoPasteBtn.Foreground = new SolidColorBrush(System.Windows.Media.Color.FromRgb(0x94, 0xA3, 0xB8));
                AutoPasteDot.Fill = new SolidColorBrush(System.Windows.Media.Color.FromRgb(0x64, 0x74, 0x8B));
                TargetAppText.Text = "";
            }
        }

        private void UpdateLanguageLockBadgeUi()
        {
            string label = _config.SpokenLanguage switch
            {
                "uk" => "🇺🇦 УКР",
                "en" => "🇬🇧 ENG",
                "pl" => "🇵🇱 POL",
                "de" => "🇩🇪 DEU",
                "es" => "🇪🇸 ESP",
                _ => "🌐 АВТО"
            };
            LangLockText.Text = label;
        }

        private void ForegroundPollTimer_Tick(object? sender, EventArgs e)
        {
            Win32Helper.PollForegroundWindow();

            if (_config.DirectPaste)
            {
                string extTitle = Win32Helper.LastExternalWindowTitle;
                if (!string.IsNullOrWhiteSpace(extTitle))
                {
                    string shortTitle = extTitle;
                    // Extract app name from end of window title (e.g. "#general - Discord" -> "Discord")
                    int dashIdx = shortTitle.LastIndexOf(" - ", StringComparison.Ordinal);
                    if (dashIdx > 0 && dashIdx + 3 < shortTitle.Length)
                    {
                        shortTitle = shortTitle.Substring(dashIdx + 3).Trim();
                    }
                    if (shortTitle.Length > 18)
                    {
                        shortTitle = shortTitle.Substring(0, 17) + "…";
                    }
                    TargetAppText.Text = $"↳ {shortTitle}";
                }
                else
                {
                    TargetAppText.Text = "↳ Активне вікно";
                }
            }
        }

        // ====================================================================
        // RECORDING & GEMINI LIVE STREAMING
        // ====================================================================

        private void HandleRecordHotkeyDown()
        {
            if (_config.RecordingBehavior == "push_to_talk")
            {
                if (!_isRecording && !_isStartingOrStopping)
                {
                    _ = StartRecordingAsync();
                }
            }
            else
            {
                _ = ToggleRecordingAsync();
            }
        }

        private void HandleRecordHotkeyUp()
        {
            if (_config.RecordingBehavior == "push_to_talk" && _isRecording)
            {
                _ = StopRecordingAsync();
            }
        }

        public async Task ToggleRecordingAsync()
        {
            if (_isStartingOrStopping) return;
            if (_isRecording)
                await StopRecordingAsync();
            else
                await StartRecordingAsync();
        }

        public async Task StartRecordingAsync()
        {
            if (_isRecording || _isStartingOrStopping) return;

            if (string.IsNullOrWhiteSpace(_config.ApiKey))
            {
                ApiKeyBanner.Visibility = Visibility.Visible;
                ShowInlineFeedback("⚠️ Спочатку вкажіть Gemini API Key у налаштуваннях!", isError: true);
                ShowAndActivateWindow();
                OpenSettingsView();
                return;
            }

            _isStartingOrStopping = true;

            try
            {
                // Checkpoint existing text so we append cleanly
                _baseTextBeforeSpeech = TranscriptBox.Text.Trim();
                _sessionStartText = _baseTextBeforeSpeech;
                _rawCheckpoint = "";
                _lastRawStream = "";
                _pastedRawLengthInSession = 0;

                SetStatusBadge("connecting", "Підключення...");

                StopMicTestIfActive();

                // Start microphone immediately so pre-roll buffer captures speech right away
                _recorder.DeviceId = _config.DeviceId;
                _recorder.VadThreshold = _config.VadThreshold;
                _recorder.MicGainPercent = _config.MicGainPercent;
                _recorder.SilenceTimeoutMs = _config.SilenceTimeoutMs;
                _recorder.VoiceBoost = _config.VoiceBoost;
                _recorder.Start();

                _isRecording = true;
                _recordStartTime = DateTime.UtcNow;
                _recordingClockTimer.Start();
                UpdateRecordButtonUi(true);

                if (_config.ShowWhisperHud)
                {
                    _hudWindow?.ShowRecording("Слухаю...");
                }

                string sysPrompt = Prompts.GetSystemPrompt(
                    _config.Mode,
                    _config.SpokenLanguage,
                    _config.TargetLanguage,
                    _config.CustomInstructions);

                _liveClient?.Dispose();
                _liveClient = new GeminiLiveClient(_config.ApiKey, _config.Model, sysPrompt);

                _liveClient.OnStatusChange += (st, details) =>
                {
                    Dispatcher.BeginInvoke(() =>
                    {
                        if (st == "ready" && _isRecording)
                            SetStatusBadge("recording", "Слухаю");
                    });
                };

                _liveClient.OnDelta += (_, _, fullText) =>
                {
                    Dispatcher.BeginInvoke(() => HandleLiveDelta(fullText));
                };

                _liveClient.OnTurnComplete += (turnText, _, _) =>
                {
                    Dispatcher.BeginInvoke(() => HandleTurnCommitted(turnText));
                };

                _liveClient.OnError += ex =>
                {
                    Dispatcher.BeginInvoke(() =>
                    {
                        ShowInlineFeedback($"⚠️ {ex.Message}", isError: true);
                    });
                };

                await _liveClient.ConnectAsync();
                if (_isRecording)
                {
                    SetStatusBadge("recording", "Слухаю");
                }
            }
            catch (Exception ex)
            {
                _recorder.Stop();
                _isRecording = false;
                _recordingClockTimer.Stop();
                UpdateRecordButtonUi(false);
                _hudWindow?.Hide();
                SetStatusBadge("error", "Помилка");
                ShowInlineFeedback($"⚠️ {ex.Message}", isError: true);
            }
            finally
            {
                _isStartingOrStopping = false;
            }
        }

        public async Task StopRecordingAsync()
        {
            if (!_isRecording || _isStartingOrStopping) return;
            _isStartingOrStopping = true;

            try
            {
                // 1. Stop microphone capture
                _recorder.Stop();
                _recordingClockTimer.Stop();
                _isRecording = false;
                UpdateRecordButtonUi(false);
                SetStatusBadge("ready", "Обробка...");

                // 2. Signal turn complete & wait briefly so final syllables from Gemini Live arrive
                if (_liveClient != null && _liveClient.IsConnected)
                {
                    _liveClient.SendClientTurnComplete();
                    await Task.Delay(220);
                    _liveClient.CommitUtterance();
                }

                if (_liveClient != null)
                {
                    await _liveClient.DisconnectAsync();
                }

                SetStatusBadge("ready", "Готовий");

                // 3. Determine final text and perform Auto-Copy & Auto-Paste
                string currentFullText = TranscriptBox.Text.Trim();
                string sessionNewText = ExtractSessionNewText(currentFullText, _sessionStartText);

                if (_config.AutoCopy && !string.IsNullOrWhiteSpace(currentFullText))
                {
                    TryCopyToClipboardSilent(currentFullText);
                }

                if (_config.DirectPaste && !string.IsNullOrWhiteSpace(sessionNewText))
                {
                    // Calculate what portion hasn't been pasted yet during this recording session
                    string textToPaste = sessionNewText;
                    if (_config.PasteOnPause && _pastedRawLengthInSession > 0)
                    {
                        if (_pastedRawLengthInSession < sessionNewText.Length)
                        {
                            textToPaste = sessionNewText.Substring(_pastedRawLengthInSession).Trim();
                        }
                        else
                        {
                            textToPaste = "";
                        }
                    }

                    if (!string.IsNullOrWhiteSpace(textToPaste))
                    {
                        bool pasted = await Win32Helper.PasteToExternalWindowAsync(textToPaste);
                        if (pasted)
                        {
                            _pastedRawLengthInSession = sessionNewText.Length;
                            ShowInlineFeedback("✓ Текст автоматично вставлено в поле вводу!");
                            if (_config.ShowWhisperHud && _hudWindow != null)
                            {
                                _hudWindow.ShowFlashFeedback("✓ Вставлено в поле вводу!");
                                await Task.Delay(900);
                            }
                        }
                    }
                }

                _hudWindow?.Hide();
            }
            finally
            {
                _isStartingOrStopping = false;
            }
        }

        private static string ExtractSessionNewText(string currentFullText, string sessionStartText)
        {
            if (string.IsNullOrWhiteSpace(currentFullText)) return "";
            if (string.IsNullOrWhiteSpace(sessionStartText)) return currentFullText.Trim();

            if (currentFullText.StartsWith(sessionStartText, StringComparison.Ordinal))
            {
                return currentFullText.Substring(sessionStartText.Length).Trim();
            }
            return currentFullText.Trim();
        }

        private void HandleLiveDelta(string rawStreamText)
        {
            _lastRawStream = rawStreamText ?? "";
            string newRawSpeech = TextCleaner.ExtractNewSpeech(_lastRawStream, _rawCheckpoint);

            string processedSpeech = _config.Mode == "smart_polish"
                ? TextCleaner.CleanSmartPolish(newRawSpeech, _config.SpokenLanguage)
                : TextCleaner.FilterLanguageLock(newRawSpeech, _config.SpokenLanguage);

            processedSpeech = TextCleaner.StripTailOverlap(_baseTextBeforeSpeech, processedSpeech);

            string combined;
            if (string.IsNullOrWhiteSpace(_baseTextBeforeSpeech))
            {
                combined = processedSpeech;
            }
            else if (string.IsNullOrWhiteSpace(processedSpeech))
            {
                combined = _baseTextBeforeSpeech;
            }
            else
            {
                combined = $"{_baseTextBeforeSpeech} {processedSpeech}";
            }

            _isProgrammaticTextUpdate = true;
            TranscriptBox.Text = combined;
            TranscriptBox.CaretIndex = TranscriptBox.Text.Length;
            TranscriptBox.ScrollToEnd();
            _isProgrammaticTextUpdate = false;

            if (_config.ShowWhisperHud && _isRecording)
            {
                _hudWindow?.UpdateLivePreview(processedSpeech);
            }
        }

        private async void HandleTurnCommitted(string turnText)
        {
            if (!_isRecording) return;

            if (_config.DirectPaste && _config.PasteOnPause)
            {
                string currentFullText = TranscriptBox.Text.Trim();
                string sessionNewText = ExtractSessionNewText(currentFullText, _sessionStartText);

                if (sessionNewText.Length > _pastedRawLengthInSession)
                {
                    string unpastedSegment = sessionNewText.Substring(_pastedRawLengthInSession).Trim();
                    if (!string.IsNullOrWhiteSpace(unpastedSegment))
                    {
                        bool ok = await Win32Helper.PasteToExternalWindowAsync(unpastedSegment + " ");
                        if (ok)
                        {
                            _pastedRawLengthInSession = sessionNewText.Length;
                            ShowInlineFeedback("✓ Фразу вставлено!");
                        }
                    }
                }
            }
        }

        private void OnRecorderAudioChunk(string base64Pcm, double rms)
        {
            if (_isRecording)
            {
                _liveClient?.SendAudioChunk(base64Pcm);
            }
        }

        private void OnRecorderLevelUpdate(int rms0To100, bool isSpeaking, float[] bars)
        {
            Dispatcher.BeginInvoke(() =>
            {
                // Update main window 6 mini bars
                for (int i = 0; i < _miniBars.Length && i < bars.Length; i++)
                {
                    _miniBars[i].Height = isSpeaking
                        ? Math.Clamp(bars[i] * 15.0, 3.0, 15.0)
                        : 3.0;
                }

                // Update live Mic Test meter in Settings
                if (MicTestBar != null && (_isTestingMic || _isRecording))
                {
                    MicTestBar.Value = rms0To100;
                    MicTestLevelText.Text = $"{rms0To100}%";
                }

                // Update Whisper HUD 8 bars
                if (_isRecording && _config.ShowWhisperHud)
                {
                    _hudWindow?.UpdateSpectrum(bars, isSpeaking);
                }
            });
        }

        private void OnRecorderSilenceDetected()
        {
            Dispatcher.BeginInvoke(() =>
            {
                if (_isRecording && _liveClient != null && _liveClient.IsConnected)
                {
                    _liveClient.CommitUtterance();
                }
            });
        }

        private void OnRecorderError(Exception ex)
        {
            Dispatcher.BeginInvoke(() =>
            {
                ShowInlineFeedback($"⚠️ {ex.Message}", isError: true);
            });
        }

        private void RecordingClockTimer_Tick(object? sender, EventArgs e)
        {
            if (!_isRecording) return;
            TimeSpan elapsed = DateTime.UtcNow - _recordStartTime;
            string timerStr = $"{(int)elapsed.TotalMinutes:D2}:{elapsed.Seconds:D2}";
            RecordBtnText.Text = $"Стоп {timerStr}";
            _hudWindow?.UpdateTimer(timerStr);
        }

        private void UpdateRecordButtonUi(bool recording)
        {
            if (recording)
            {
                RecordBtn.Background = new SolidColorBrush(System.Windows.Media.Color.FromRgb(0xDC, 0x26, 0x26));
                RecordBtn.BorderBrush = new SolidColorBrush(System.Windows.Media.Color.FromRgb(0xEF, 0x44, 0x44));
                RecordBtnText.Text = "Стоп 00:00";
            }
            else
            {
                RecordBtn.Background = new SolidColorBrush(System.Windows.Media.Color.FromRgb(0x4F, 0x46, 0xE5));
                RecordBtn.BorderBrush = new SolidColorBrush(System.Windows.Media.Color.FromRgb(0x63, 0x66, 0xF1));
                RecordBtnText.Text = "Запис";
                foreach (var bar in _miniBars)
                {
                    bar.Height = 3.0;
                }
            }
        }

        private void SetStatusBadge(string status, string label)
        {
            StatusText.Text = label;
            StatusDot.Fill = status switch
            {
                "recording" => new SolidColorBrush(System.Windows.Media.Color.FromRgb(0xEF, 0x44, 0x44)),
                "connecting" => new SolidColorBrush(System.Windows.Media.Color.FromRgb(0xF5, 0x9E, 0x0B)),
                "error" => new SolidColorBrush(System.Windows.Media.Color.FromRgb(0xEF, 0x44, 0x44)),
                _ => new SolidColorBrush(System.Windows.Media.Color.FromRgb(0x10, 0xB9, 0x81))
            };
        }

        private void ShowInlineFeedback(string text, bool isError = false)
        {
            FeedbackText.Text = text;
            if (isError)
            {
                FeedbackBar.Background = new SolidColorBrush(System.Windows.Media.Color.FromArgb(0x28, 0xEF, 0x44, 0x44));
                FeedbackBar.BorderBrush = new SolidColorBrush(System.Windows.Media.Color.FromArgb(0x66, 0xEF, 0x44, 0x44));
                FeedbackText.Foreground = new SolidColorBrush(System.Windows.Media.Color.FromRgb(0xFC, 0xA5, 0xA5));
            }
            else
            {
                FeedbackBar.Background = new SolidColorBrush(System.Windows.Media.Color.FromArgb(0x22, 0x10, 0xB9, 0x81));
                FeedbackBar.BorderBrush = new SolidColorBrush(System.Windows.Media.Color.FromArgb(0x55, 0x10, 0xB9, 0x81));
                FeedbackText.Foreground = new SolidColorBrush(System.Windows.Media.Color.FromRgb(0x34, 0xD3, 0x99));
            }

            FeedbackBar.Visibility = Visibility.Visible;
            _feedbackHideTimer.Stop();
            _feedbackHideTimer.Start();
        }

        // ====================================================================
        // UI EVENT HANDLERS
        // ====================================================================

        private void TitleBar_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        {
            if (e.LeftButton == MouseButtonState.Pressed)
            {
                try
                {
                    DragMove();
                }
                catch { }
            }
        }

        private void RecordBtn_Click(object sender, RoutedEventArgs e)
        {
            _ = ToggleRecordingAsync();
        }

        private void AutoPasteBtn_Click(object sender, RoutedEventArgs e)
        {
            _config.DirectPaste = !_config.DirectPaste;
            ConfigManager.Save(_config);
            UpdateAutoPasteButtonUi();
            ShowInlineFeedback(_config.DirectPaste
                ? "✓ Автовставку увімкнено (текст вставлятиметься в активне вікно)"
                : "Автовставку вимкнено");
        }

        private void ModeSmartPolishBtn_Click(object sender, RoutedEventArgs e)
        {
            if (_config.Mode == "smart_polish") return;
            _config.Mode = "smart_polish";
            ConfigManager.Save(_config);
            UpdateModeButtonsUi();
        }

        private void ModeVerbatimBtn_Click(object sender, RoutedEventArgs e)
        {
            if (_config.Mode == "verbatim") return;
            _config.Mode = "verbatim";
            ConfigManager.Save(_config);
            UpdateModeButtonsUi();
        }

        private async void TranslateBtn_Click(object sender, RoutedEventArgs e)
        {
            if (_isTranslating) return;
            string currentText = TranscriptBox.Text.Trim();
            if (string.IsNullOrEmpty(currentText))
            {
                ShowInlineFeedback("Немає тексту для перекладу", isError: true);
                return;
            }
            if (string.IsNullOrWhiteSpace(_config.ApiKey))
            {
                ShowInlineFeedback("⚠️ Вкажіть Gemini API Key у налаштуваннях!", isError: true);
                return;
            }

            _isTranslating = true;
            TranslateBtnText.Text = "Перекладаю...";
            TranslateBtn.IsEnabled = false;

            try
            {
                string translated = await FastTranslator.TranslateTextAsync(
                    currentText,
                    _config.TargetLanguage,
                    _config.ApiKey);

                _isProgrammaticTextUpdate = true;
                TranscriptBox.Text = translated;
                TranscriptBox.CaretIndex = TranscriptBox.Text.Length;
                _isProgrammaticTextUpdate = false;

                _baseTextBeforeSpeech = translated;
                _rawCheckpoint = _lastRawStream;

                if (_config.AutoCopy)
                {
                    TryCopyToClipboardSilent(translated);
                }

                ShowInlineFeedback($"✓ Перекладено ({_config.TargetLanguage})!");
            }
            catch (Exception ex)
            {
                ShowInlineFeedback($"⚠️ Помилка перекладу: {ex.Message}", isError: true);
            }
            finally
            {
                TranslateBtnText.Text = "Переклад";
                TranslateBtn.IsEnabled = true;
                _isTranslating = false;
            }
        }

        private void QuickTargetLangCombo_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            if (QuickTargetLangCombo.SelectedItem is ComboBoxItem item && item.Tag is string langCode)
            {
                if (_config.TargetLanguage != langCode)
                {
                    _config.TargetLanguage = langCode;
                    ConfigManager.Save(_config);
                }
            }
        }

        private async void CopyBtn_Click(object sender, RoutedEventArgs e)
        {
            string text = TranscriptBox.Text.Trim();
            if (string.IsNullOrEmpty(text)) return;

            TryCopyToClipboardSilent(text);
            CopyBtnText.Text = "✓ Скопійовано";
            ShowInlineFeedback("✓ Скопійовано в буфер обміну!");
            await Task.Delay(1400);
            CopyBtnText.Text = "Копія";
        }

        private void ClearBtn_Click(object sender, RoutedEventArgs e)
        {
            _isProgrammaticTextUpdate = true;
            TranscriptBox.Text = "";
            _isProgrammaticTextUpdate = false;

            _baseTextBeforeSpeech = "";
            _sessionStartText = "";
            _rawCheckpoint = _lastRawStream;
            _pastedRawLengthInSession = 0;
            _liveClient?.ClearTranscript();
            UpdateWordCounter("");
        }

        private void TranscriptBox_TextChanged(object sender, TextChangedEventArgs e)
        {
            string current = TranscriptBox.Text ?? "";
            PlaceholderText.Visibility = string.IsNullOrEmpty(current) ? Visibility.Visible : Visibility.Collapsed;
            UpdateWordCounter(current);

            if (!_isProgrammaticTextUpdate)
            {
                // User manually edited the text: update checkpoint so subsequent speech appends cleanly
                _baseTextBeforeSpeech = current.Trim();
                _rawCheckpoint = _lastRawStream;
            }
        }

        private void UpdateWordCounter(string text)
        {
            if (string.IsNullOrWhiteSpace(text))
            {
                WordCountText.Text = "0 слів";
                return;
            }
            int words = text.Trim().Split(new[] { ' ', '\t', '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries).Length;
            WordCountText.Text = $"{words} слів";
        }

        private void PinBtn_Click(object sender, RoutedEventArgs e)
        {
            _config.AlwaysOnTop = !_config.AlwaysOnTop;
            ConfigManager.Save(_config);
            ApplyConfigToUi();
        }

        private void MinimizeBtn_Click(object sender, RoutedEventArgs e)
        {
            Hide();
        }

        private void CloseBtn_Click(object sender, RoutedEventArgs e)
        {
            ExitApplication();
        }

        private void LangLockBadge_Click(object sender, MouseButtonEventArgs e)
        {
            OpenSettingsView("general");
        }

        // ====================================================================
        // SETTINGS VIEW & TAB SWITCHING
        // ====================================================================

        private void SettingsBtn_Click(object sender, RoutedEventArgs e)
        {
            if (_isSettingsOpen)
                CloseSettingsView();
            else
                OpenSettingsView("general");
        }

        private void OpenSettingsView(string initialTab = "general")
        {
            if (!_isSettingsOpen)
            {
                _savedCompactWidth = Width;
                _savedCompactHeight = Height;
                _isSettingsOpen = true;

                // Smoothly expand window so settings are roomy and comfortable
                if (Width < 485) Width = 485;
                if (Height < 520) Height = 520;
            }

            // Load current config values into Settings controls
            ApiKeyPasswordBox.Password = _config.ApiKey;
            ApiKeyVisibleBox.Text = _config.ApiKey;

            SelectComboItemByTag(SpokenLanguageCombo, _config.SpokenLanguage);
            SelectComboItemByTag(ModelCombo, _config.Model);
            SelectComboItemByTag(FontSizeCombo, _config.FontSize);
            SelectComboItemByTag(RecordingBehaviorCombo, _config.RecordingBehavior);
            RefreshMicrophoneList();

            ShowWhisperHudCheck.IsChecked = _config.ShowWhisperHud;
            OpacitySlider.Value = _config.WindowOpacity;
            OpacityValText.Text = $"{_config.WindowOpacity}%";

            _tempRecordHotkey = _config.RecordHotkey;
            _tempGlobalHotkey = _config.GlobalHotkey;
            CaptureRecordHotkeyBtn.Content = _tempRecordHotkey;
            CaptureGlobalHotkeyBtn.Content = _tempGlobalHotkey;

            DirectPasteCheck.IsChecked = _config.DirectPaste;
            PasteOnPauseCheck.IsChecked = _config.PasteOnPause;
            AutoCopyCheck.IsChecked = _config.AutoCopy;

            VoiceBoostCheck.IsChecked = _config.VoiceBoost;
            MicGainSlider.Value = _config.MicGainPercent;
            MicGainValText.Text = $"{_config.MicGainPercent}%";

            SilenceTimeoutSlider.Value = _config.SilenceTimeoutMs;
            SilenceTimeoutValText.Text = $"{(_config.SilenceTimeoutMs / 1000.0):F1} с";

            CustomInstructionsBox.Text = _config.CustomInstructions;

            WorkspaceView.Visibility = Visibility.Collapsed;
            SettingsView.Visibility = Visibility.Visible;

            SwitchSettingsTab(initialTab);
        }

        private void CloseSettingsView()
        {
            CancelHotkeyCapture();
            StopMicTestIfActive();
            _isSettingsOpen = false;
            SettingsView.Visibility = Visibility.Collapsed;
            WorkspaceView.Visibility = Visibility.Visible;

            Width = _savedCompactWidth;
            Height = _savedCompactHeight;
        }

        private void SwitchSettingsTab(string tab)
        {
            CancelHotkeyCapture();
            if (tab != "audio")
                StopMicTestIfActive();

            SettingsTabGeneral.Visibility = tab == "general" ? Visibility.Visible : Visibility.Collapsed;
            SettingsTabHotkeys.Visibility = tab == "hotkeys" ? Visibility.Visible : Visibility.Collapsed;
            SettingsTabAudio.Visibility = tab == "audio" ? Visibility.Visible : Visibility.Collapsed;

            HighlightTabBtn(TabGeneralBtn, tab == "general");
            HighlightTabBtn(TabHotkeysBtn, tab == "hotkeys");
            HighlightTabBtn(TabAudioBtn, tab == "audio");
        }

        private static void HighlightTabBtn(Button btn, bool active)
        {
            btn.Background = active
                ? new SolidColorBrush(System.Windows.Media.Color.FromArgb(0x33, 0x63, 0x66, 0xF1))
                : System.Windows.Media.Brushes.Transparent;
            btn.BorderBrush = active
                ? new SolidColorBrush(System.Windows.Media.Color.FromArgb(0x77, 0x63, 0x66, 0xF1))
                : System.Windows.Media.Brushes.Transparent;
            btn.Foreground = active
                ? new SolidColorBrush(System.Windows.Media.Color.FromRgb(0xE0, 0xE7, 0xFF))
                : new SolidColorBrush(System.Windows.Media.Color.FromRgb(0x94, 0xA3, 0xB8));
        }

        private void TabGeneralBtn_Click(object sender, RoutedEventArgs e) => SwitchSettingsTab("general");
        private void TabHotkeysBtn_Click(object sender, RoutedEventArgs e) => SwitchSettingsTab("hotkeys");
        private void TabAudioBtn_Click(object sender, RoutedEventArgs e) => SwitchSettingsTab("audio");

        private void ToggleApiKeyVisibilityBtn_Click(object sender, RoutedEventArgs e)
        {
            _isApiKeyVisible = !_isApiKeyVisible;
            if (_isApiKeyVisible)
            {
                ApiKeyVisibleBox.Text = ApiKeyPasswordBox.Password;
                ApiKeyPasswordBox.Visibility = Visibility.Collapsed;
                ApiKeyVisibleBox.Visibility = Visibility.Visible;
            }
            else
            {
                ApiKeyPasswordBox.Password = ApiKeyVisibleBox.Text;
                ApiKeyVisibleBox.Visibility = Visibility.Collapsed;
                ApiKeyPasswordBox.Visibility = Visibility.Visible;
            }
        }

        private void ApiKeyPasswordBox_PasswordChanged(object sender, RoutedEventArgs e)
        {
            if (!_isApiKeyVisible)
                ApiKeyVisibleBox.Text = ApiKeyPasswordBox.Password;
        }

        private void ApiKeyVisibleBox_TextChanged(object sender, TextChangedEventArgs e)
        {
            if (_isApiKeyVisible)
                ApiKeyPasswordBox.Password = ApiKeyVisibleBox.Text;
        }

        private void OpacitySlider_ValueChanged(object sender, RoutedPropertyChangedEventArgs<double> e)
        {
            if (OpacityValText != null)
            {
                int val = (int)Math.Round(e.NewValue);
                OpacityValText.Text = $"{val}%";
                if (MainWindowBorder != null)
                    MainWindowBorder.Opacity = Math.Clamp(val / 100.0, 0.45, 1.0);
            }
        }

        private void MicGainSlider_ValueChanged(object sender, RoutedPropertyChangedEventArgs<double> e)
        {
            if (MicGainValText != null)
            {
                int gainPct = (int)Math.Round(e.NewValue);
                MicGainValText.Text = $"{gainPct}%";
                if (_recorder != null)
                {
                    _recorder.MicGainPercent = gainPct;
                }
            }
        }

        private void TestMicBtn_Click(object sender, RoutedEventArgs e)
        {
            if (_isRecording) return;

            if (_isTestingMic)
            {
                StopMicTestIfActive();
            }
            else
            {
                try
                {
                    if (MicDeviceCombo.SelectedItem is ComboBoxItem micItem && micItem.Tag is int devId)
                        _recorder.DeviceId = devId;
                    _recorder.MicGainPercent = (int)Math.Round(MicGainSlider.Value);
                    _recorder.VoiceBoost = VoiceBoostCheck.IsChecked == true;
                    _recorder.Start();
                    _isTestingMic = true;
                    TestMicBtn.Content = "⏹ Стоп";
                }
                catch (Exception ex)
                {
                    ShowInlineFeedback($"⚠️ {ex.Message}", isError: true);
                }
            }
        }

        private void StopMicTestIfActive()
        {
            if (_isTestingMic)
            {
                _isTestingMic = false;
                if (!_isRecording)
                {
                    _recorder.Stop();
                }
                if (TestMicBtn != null)
                    TestMicBtn.Content = "🎤 Перевірити";
                if (MicTestBar != null)
                    MicTestBar.Value = 0;
                if (MicTestLevelText != null)
                    MicTestLevelText.Text = "0%";
            }
        }

        private void SilenceTimeoutSlider_ValueChanged(object sender, RoutedPropertyChangedEventArgs<double> e)
        {
            if (SilenceTimeoutValText != null)
            {
                SilenceTimeoutValText.Text = $"{(e.NewValue / 1000.0):F1} с";
            }
        }

        private void RefreshMicsBtn_Click(object sender, RoutedEventArgs e)
        {
            RefreshMicrophoneList();
        }

        // ====================================================================
        // CUSTOM HOTKEY CAPTURE (LAYOUT-INDEPENDENT PHYSICAL VK + CHORDS)
        // ====================================================================

        private void CaptureRecordHotkeyBtn_Click(object sender, RoutedEventArgs e)
        {
            _capturingHotkeyTarget = "record";
            _pendingModifierChord = "";
            Win32Helper.IsCapturingCustomHotkey = true;
            CaptureRecordHotkeyBtn.Content = "Натисніть клавіші (напр. Ctrl+Alt або Ctrl+Shift+R)...";
            CaptureRecordHotkeyBtn.BorderBrush = new SolidColorBrush(System.Windows.Media.Color.FromRgb(0x81, 0x8C, 0xF8));
            CaptureRecordHotkeyBtn.Focus();
        }

        private void CaptureGlobalHotkeyBtn_Click(object sender, RoutedEventArgs e)
        {
            _capturingHotkeyTarget = "global";
            _pendingModifierChord = "";
            Win32Helper.IsCapturingCustomHotkey = true;
            CaptureGlobalHotkeyBtn.Content = "Натисніть клавіші... (Esc — відміна)";
            CaptureGlobalHotkeyBtn.BorderBrush = new SolidColorBrush(System.Windows.Media.Color.FromRgb(0x81, 0x8C, 0xF8));
            CaptureGlobalHotkeyBtn.Focus();
        }

        private void CaptureRecordHotkeyBtn_KeyDown(object sender, KeyEventArgs e)
        {
            if (_capturingHotkeyTarget != "record") return;
            e.Handled = true;

            if (e.Key == Key.Escape)
            {
                CancelHotkeyCapture();
                return;
            }

            string built = Win32Helper.BuildHotkeyFromWpfKeyEvent(e);
            if (!string.IsNullOrEmpty(built))
            {
                _tempRecordHotkey = built;
                CancelHotkeyCapture();
                return;
            }

            string chord = Win32Helper.GetActiveModifierChordPreview();
            if (!string.IsNullOrEmpty(chord))
            {
                _pendingModifierChord = chord;
                CaptureRecordHotkeyBtn.Content = $"{chord} (відпустіть для збереження або додайте клавішу)";
            }
        }

        private void CaptureRecordHotkeyBtn_KeyUp(object sender, KeyEventArgs e)
        {
            if (_capturingHotkeyTarget != "record") return;
            if (!string.IsNullOrEmpty(_pendingModifierChord))
            {
                e.Handled = true;
                _tempRecordHotkey = _pendingModifierChord;
                CancelHotkeyCapture();
            }
        }

        private void CaptureGlobalHotkeyBtn_KeyDown(object sender, KeyEventArgs e)
        {
            if (_capturingHotkeyTarget != "global") return;
            e.Handled = true;

            if (e.Key == Key.Escape)
            {
                CancelHotkeyCapture();
                return;
            }

            string built = Win32Helper.BuildHotkeyFromWpfKeyEvent(e);
            if (!string.IsNullOrEmpty(built))
            {
                _tempGlobalHotkey = built;
                CancelHotkeyCapture();
                return;
            }

            string chord = Win32Helper.GetActiveModifierChordPreview();
            if (!string.IsNullOrEmpty(chord))
            {
                _pendingModifierChord = chord;
                CaptureGlobalHotkeyBtn.Content = $"{chord} (відпустіть для збереження або додайте клавішу)";
            }
        }

        private void CaptureGlobalHotkeyBtn_KeyUp(object sender, KeyEventArgs e)
        {
            if (_capturingHotkeyTarget != "global") return;
            if (!string.IsNullOrEmpty(_pendingModifierChord))
            {
                e.Handled = true;
                _tempGlobalHotkey = _pendingModifierChord;
                CancelHotkeyCapture();
            }
        }

        private void PresetRecordHotkey_Click(object sender, RoutedEventArgs e)
        {
            if (sender is Button btn && btn.Tag is string preset && !string.IsNullOrWhiteSpace(preset))
            {
                _tempRecordHotkey = preset;
                CancelHotkeyCapture();
            }
        }

        private void CaptureHotkeyBtn_LostFocus(object sender, RoutedEventArgs e)
        {
            CancelHotkeyCapture();
        }

        private void CancelHotkeyCapture()
        {
            _capturingHotkeyTarget = null;
            _pendingModifierChord = "";
            Win32Helper.IsCapturingCustomHotkey = false;
            if (CaptureRecordHotkeyBtn != null)
            {
                CaptureRecordHotkeyBtn.Content = string.IsNullOrEmpty(_tempRecordHotkey) ? _config.RecordHotkey : _tempRecordHotkey;
                CaptureRecordHotkeyBtn.BorderBrush = new SolidColorBrush(System.Windows.Media.Color.FromRgb(0x33, 0x41, 0x55));
            }
            if (CaptureGlobalHotkeyBtn != null)
            {
                CaptureGlobalHotkeyBtn.Content = string.IsNullOrEmpty(_tempGlobalHotkey) ? _config.GlobalHotkey : _tempGlobalHotkey;
                CaptureGlobalHotkeyBtn.BorderBrush = new SolidColorBrush(System.Windows.Media.Color.FromRgb(0x33, 0x41, 0x55));
            }
        }

        private void ResetRecordHotkeyBtn_Click(object sender, RoutedEventArgs e)
        {
            _tempRecordHotkey = "Ctrl+Shift+R";
            CancelHotkeyCapture();
        }

        private void ResetGlobalHotkeyBtn_Click(object sender, RoutedEventArgs e)
        {
            _tempGlobalHotkey = "Alt+Space";
            CancelHotkeyCapture();
        }

        private void SaveSettingsBtn_Click(object sender, RoutedEventArgs e)
        {
            _config.ApiKey = (_isApiKeyVisible ? ApiKeyVisibleBox.Text : ApiKeyPasswordBox.Password).Trim();

            if (SpokenLanguageCombo.SelectedItem is ComboBoxItem slItem && slItem.Tag is string slCode)
                _config.SpokenLanguage = slCode;

            if (ModelCombo.SelectedItem is ComboBoxItem mItem && mItem.Tag is string modelId)
                _config.Model = modelId;

            if (FontSizeCombo.SelectedItem is ComboBoxItem fsItem && fsItem.Tag is string fsCode)
                _config.FontSize = fsCode;

            if (RecordingBehaviorCombo.SelectedItem is ComboBoxItem rbItem && rbItem.Tag is string rbCode)
                _config.RecordingBehavior = rbCode;

            if (MicDeviceCombo.SelectedItem is ComboBoxItem micItem && micItem.Tag is int devId)
                _config.DeviceId = devId;

            _config.ShowWhisperHud = ShowWhisperHudCheck.IsChecked == true;
            _config.WindowOpacity = (int)Math.Round(OpacitySlider.Value);
            _config.RecordHotkey = string.IsNullOrWhiteSpace(_tempRecordHotkey) ? "Ctrl+Shift+R" : _tempRecordHotkey;
            _config.GlobalHotkey = string.IsNullOrWhiteSpace(_tempGlobalHotkey) ? "Alt+Space" : _tempGlobalHotkey;

            _config.DirectPaste = DirectPasteCheck.IsChecked == true;
            _config.PasteOnPause = PasteOnPauseCheck.IsChecked == true;
            _config.AutoCopy = AutoCopyCheck.IsChecked == true;
            _config.VoiceBoost = VoiceBoostCheck.IsChecked == true;

            _config.MicGainPercent = (int)Math.Round(MicGainSlider.Value);
            _config.SilenceTimeoutMs = (int)Math.Round(SilenceTimeoutSlider.Value);
            _config.CustomInstructions = CustomInstructionsBox.Text.Trim();

            ConfigManager.Save(_config);
            Win32Helper.ConfigureHotkeys(_config.GlobalHotkey, _config.RecordHotkey);
            if (_trayIcon != null)
            {
                _trayIcon.Text = $"VoxFlow — Голосове введення ({_config.RecordHotkey})";
            }

            ApplyConfigToUi();
            CloseSettingsView();
            ShowInlineFeedback("✓ Налаштування збережено!");
        }

        private void CancelSettingsBtn_Click(object sender, RoutedEventArgs e)
        {
            ApplyConfigToUi();
            CloseSettingsView();
        }

        private void ResetSettingsBtn_Click(object sender, RoutedEventArgs e)
        {
            string preservedKey = _config.ApiKey;
            _config = ConfigManager.Reset();
            if (!string.IsNullOrEmpty(preservedKey))
            {
                _config.ApiKey = preservedKey;
                ConfigManager.Save(_config);
            }
            Win32Helper.ConfigureHotkeys(_config.GlobalHotkey, _config.RecordHotkey);
            ApplyConfigToUi();
            OpenSettingsView("general");
            ShowInlineFeedback("Налаштування скинуто за замовчуванням");
        }

        private static void SelectComboItemByTag(ComboBox combo, object tagValue)
        {
            foreach (var obj in combo.Items)
            {
                if (obj is ComboBoxItem item && item.Tag != null && item.Tag.Equals(tagValue))
                {
                    combo.SelectedItem = item;
                    return;
                }
            }
        }

        private static void TryCopyToClipboardSilent(string text)
        {
            for (int i = 0; i < 3; i++)
            {
                try
                {
                    Clipboard.SetDataObject(text, true);
                    return;
                }
                catch
                {
                    Thread.Sleep(15);
                }
            }
        }

        public void ToggleWindowVisibility()
        {
            if (IsVisible && WindowState != WindowState.Minimized)
            {
                Hide();
            }
            else
            {
                ShowAndActivateWindow();
            }
        }

        public void ShowAndActivateWindow()
        {
            Show();
            if (WindowState == WindowState.Minimized)
                WindowState = WindowState.Normal;
            Activate();
        }

        private void MainWindow_Closing(object? sender, System.ComponentModel.CancelEventArgs e)
        {
            if (!_isExiting)
            {
                ExitApplication();
            }
        }

        private void ExitApplication()
        {
            if (_isExiting) return;
            _isExiting = true;

            try
            {
                _foregroundPollTimer.Stop();
                _recordingClockTimer.Stop();
                Win32Helper.UninstallGlobalKeyboardHook();
                _recorder.Dispose();
                _liveClient?.Dispose();
                _hudWindow?.Close();

                if (_trayIcon != null)
                {
                    _trayIcon.Visible = false;
                    _trayIcon.Dispose();
                    _trayIcon = null;
                }
            }
            catch { }

            Application.Current.Shutdown();
        }
    }
}
