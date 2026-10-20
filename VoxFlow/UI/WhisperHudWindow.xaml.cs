using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media;
using VoxFlow.Native;

namespace VoxFlow.UI
{
    public partial class WhisperHudWindow : Window
    {
        private readonly Border[] _bars;
        private bool _hasCustomPosition;

        public event Action? OnStopRequested;

        private static readonly SolidColorBrush ActiveBorderBrush = new(Color.FromArgb(0xAA, 0x81, 0x8C, 0xF8));
        private static readonly SolidColorBrush IdleBorderBrush = new(Color.FromArgb(0x55, 0x63, 0x66, 0xF1));
        private static readonly SolidColorBrush SuccessBorderBrush = new(Color.FromArgb(0xAA, 0x10, 0xB9, 0x81));
        private static readonly SolidColorBrush RedDotBrush = new(Color.FromRgb(0xEF, 0x44, 0x44));
        private static readonly SolidColorBrush SpeakingDotBrush = new(Color.FromRgb(0x34, 0xD3, 0x99));

        public WhisperHudWindow()
        {
            InitializeComponent();
            _bars = new[] { Bar0, Bar1, Bar2, Bar3, Bar4, Bar5, Bar6, Bar7 };
            SourceInitialized += OnSourceInitialized;
        }

        private void OnSourceInitialized(object? sender, EventArgs e)
        {
            IntPtr hwnd = new WindowInteropHelper(this).Handle;
            Win32Helper.SetToolWindowStyle(hwnd, noActivate: true);
            if (!_hasCustomPosition)
            {
                PositionBottomCenter();
            }
        }

        public void PositionBottomCenter()
        {
            var workArea = SystemParameters.WorkArea;
            Left = workArea.Left + (workArea.Width - Width) / 2.0;
            Top = workArea.Bottom - Height - 28;
        }

        public void ShowRecording(string initialText = "Слухаю...")
        {
            if (!_hasCustomPosition)
            {
                PositionBottomCenter();
            }
            HudStatusText.Text = initialText;
            HudTimerText.Text = "00:00";
            PillBorder.BorderBrush = IdleBorderBrush;
            RecDot.Fill = RedDotBrush;
            HudStopBtn.Visibility = Visibility.Visible;
            ResetBars();
            if (!IsVisible)
            {
                Show();
            }
        }

        public void UpdateSpectrum(float[] bars, bool isSpeaking)
        {
            if (bars == null || bars.Length < 8) return;

            PillBorder.BorderBrush = isSpeaking ? ActiveBorderBrush : IdleBorderBrush;
            RecDot.Fill = isSpeaking ? SpeakingDotBrush : RedDotBrush;

            for (int i = 0; i < 8; i++)
            {
                // Emphasize center bars slightly for classic Whisper aesthetic
                float centerWeight = (i == 3 || i == 4) ? 1.25f : (i == 2 || i == 5) ? 1.1f : 0.9f;
                double h = isSpeaking
                    ? Math.Clamp(bars[i] * 22.0 * centerWeight, 4.0, 22.0)
                    : 4.0;
                _bars[i].Height = h;
            }
        }

        public void UpdateLivePreview(string text)
        {
            if (string.IsNullOrWhiteSpace(text))
            {
                HudStatusText.Text = "Слухаю...";
                return;
            }

            string clean = text.Replace("\r", " ").Replace("\n", " ").Trim();
            if (clean.Length > 34)
            {
                clean = "…" + clean.Substring(clean.Length - 33);
            }
            HudStatusText.Text = clean;
        }

        public void UpdateTimer(string timerStr)
        {
            HudTimerText.Text = timerStr;
        }

        public void ShowFlashFeedback(string message)
        {
            if (!_hasCustomPosition)
            {
                PositionBottomCenter();
            }
            HudStatusText.Text = message;
            PillBorder.BorderBrush = SuccessBorderBrush;
            RecDot.Fill = SpeakingDotBrush;
            ResetBars();
            if (!IsVisible)
            {
                Show();
            }
        }

        private void ResetBars()
        {
            foreach (var b in _bars)
            {
                b.Height = 4.0;
            }
        }

        private void Window_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        {
            if (e.LeftButton == MouseButtonState.Pressed)
            {
                try
                {
                    _hasCustomPosition = true;
                    DragMove();
                }
                catch { }
            }
        }

        private void HudStopBtn_Click(object sender, RoutedEventArgs e)
        {
            OnStopRequested?.Invoke();
        }
    }
}
