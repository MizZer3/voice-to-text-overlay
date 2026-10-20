using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Runtime.InteropServices;

namespace VoxFlow.Audio
{
    public record AudioDeviceInfo(int DeviceId, string Name);

    public class NativeAudioRecorder : IDisposable
    {
        private const int CALLBACK_FUNCTION = 0x00030000;
        private const int WIM_DATA = 0x3C0;
        private const short WAVE_FORMAT_PCM = 1;

        [StructLayout(LayoutKind.Sequential)]
        private struct WAVEFORMATEX
        {
            public short wFormatTag;
            public short nChannels;
            public int nSamplesPerSec;
            public int nAvgBytesPerSec;
            public short nBlockAlign;
            public short wBitsPerSample;
            public short cbSize;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct WAVEHDR
        {
            public IntPtr lpData;
            public int dwBufferLength;
            public int dwBytesRecorded;
            public IntPtr dwUser;
            public int dwFlags;
            public int dwLoops;
            public IntPtr lpNext;
            public IntPtr reserved;
        }

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        private struct WAVEINCAPSW
        {
            public short wMid;
            public short wPid;
            public int vDriverVersion;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]
            public string szPname;
            public int dwFormats;
            public short wChannels;
            public short wReserved1;
        }

        private delegate void WaveInProc(IntPtr hwi, int uMsg, IntPtr dwInstance, IntPtr dwParam1, IntPtr dwParam2);

        [DllImport("winmm.dll")]
        private static extern int waveInGetNumDevs();

        [DllImport("winmm.dll", CharSet = CharSet.Unicode)]
        private static extern int waveInGetDevCapsW(IntPtr uDeviceID, out WAVEINCAPSW pwic, int cbwic);

        [DllImport("winmm.dll")]
        private static extern int waveInOpen(out IntPtr phwi, int uDeviceID, ref WAVEFORMATEX pwfx, WaveInProc dwCallback, IntPtr dwInstance, int fdwOpen);

        [DllImport("winmm.dll")]
        private static extern int waveInPrepareHeader(IntPtr hwi, IntPtr pwh, int cbwh);

        [DllImport("winmm.dll")]
        private static extern int waveInUnprepareHeader(IntPtr hwi, IntPtr pwh, int cbwh);

        [DllImport("winmm.dll")]
        private static extern int waveInAddBuffer(IntPtr hwi, IntPtr pwh, int cbwh);

        [DllImport("winmm.dll")]
        private static extern int waveInStart(IntPtr hwi);

        [DllImport("winmm.dll")]
        private static extern int waveInReset(IntPtr hwi);

        [DllImport("winmm.dll")]
        private static extern int waveInClose(IntPtr hwi);

        private sealed class PinnedWaveBuffer : IDisposable
        {
            public byte[] Data;
            public GCHandle DataHandle;
            public IntPtr HeaderPtr;
            public int BufferSize;

            public PinnedWaveBuffer(int sizeBytes)
            {
                BufferSize = sizeBytes;
                Data = new byte[sizeBytes];
                DataHandle = GCHandle.Alloc(Data, GCHandleType.Pinned);

                var hdr = new WAVEHDR
                {
                    lpData = DataHandle.AddrOfPinnedObject(),
                    dwBufferLength = sizeBytes,
                    dwBytesRecorded = 0,
                    dwFlags = 0
                };

                HeaderPtr = Marshal.AllocHGlobal(Marshal.SizeOf<WAVEHDR>());
                Marshal.StructureToPtr(hdr, HeaderPtr, false);
            }

            public void Dispose()
            {
                if (HeaderPtr != IntPtr.Zero)
                {
                    Marshal.FreeHGlobal(HeaderPtr);
                    HeaderPtr = IntPtr.Zero;
                }
                if (DataHandle.IsAllocated)
                {
                    DataHandle.Free();
                }
            }
        }

        public int TargetSampleRate { get; } = 16000;
        public double VadThreshold { get; set; } = 0.0035;
        public int MicGainPercent { get; set; } = 320; // 100%..600% pre-amp
        public int SilenceTimeoutMs { get; set; } = 1600;
        public int HangoverDurationMs { get; set; } = 1800;
        public int DeviceId { get; set; } = -1; // -1 = WAVE_MAPPER (default)
        public bool VoiceBoost { get; set; } = true;

        public bool IsRecording { get; private set; }
        private volatile bool _isStopping;

        private IntPtr _hWaveIn = IntPtr.Zero;
        private readonly WaveInProc _callbackDelegate;
        private readonly List<PinnedWaveBuffer> _buffers = new();
        private readonly ConcurrentQueue<string> _preRollQueue = new();

        // Audio filter state (High-Pass Filter 85Hz + Soft AGC)
        private float _hpfPrevIn;
        private float _hpfPrevOut;
        private float _runningGain = 1.35f;

        // VAD state
        private bool _hasDetectedSpeech;
        private bool _isSilentSuppressed = true;
        private long _lastSpeechTick;

        public event Action<string, double>? OnAudioChunk; // (base64Pcm, rawRms)
        public event Action<int, bool, float[]>? OnLevelUpdate; // (rms0To100, isSpeaking, spectrum8Bars)
        public event Action? OnSilenceDetected;
        public event Action<Exception>? OnError;

        public NativeAudioRecorder()
        {
            _callbackDelegate = OnWaveInCallback;
        }

        public static List<AudioDeviceInfo> GetInputDevices()
        {
            var list = new List<AudioDeviceInfo>
            {
                new(-1, "🎙️ Мікрофон за замовчуванням (Windows Default)")
            };

            try
            {
                int count = waveInGetNumDevs();
                int structSize = Marshal.SizeOf<WAVEINCAPSW>();
                for (int i = 0; i < count; i++)
                {
                    if (waveInGetDevCapsW((IntPtr)i, out var caps, structSize) == 0)
                    {
                        string name = string.IsNullOrWhiteSpace(caps.szPname) ? $"Мікрофон #{i + 1}" : caps.szPname.Trim();
                        list.Add(new AudioDeviceInfo(i, name));
                    }
                }
            }
            catch
            {
                // Fallback to default device only
            }

            return list;
        }

        public void Start()
        {
            if (IsRecording) return;

            _isStopping = false;
            _hasDetectedSpeech = false;
            _isSilentSuppressed = false; // Stream immediately so quiet voices are never blocked at start
            _lastSpeechTick = Environment.TickCount64;
            _hpfPrevIn = 0f;
            _hpfPrevOut = 0f;
            _runningGain = 1.6f;
            while (_preRollQueue.TryDequeue(out _)) { }

            var format = new WAVEFORMATEX
            {
                wFormatTag = WAVE_FORMAT_PCM,
                nChannels = 1,
                nSamplesPerSec = TargetSampleRate,
                wBitsPerSample = 16,
                nBlockAlign = 2,
                nAvgBytesPerSec = TargetSampleRate * 2,
                cbSize = 0
            };

            int devId = DeviceId < -1 ? -1 : DeviceId;
            int res = waveInOpen(out _hWaveIn, devId, ref format, _callbackDelegate, IntPtr.Zero, CALLBACK_FUNCTION);
            if (res != 0 && devId != -1)
            {
                // Fallback to default device if saved device was unplugged
                res = waveInOpen(out _hWaveIn, -1, ref format, _callbackDelegate, IntPtr.Zero, CALLBACK_FUNCTION);
            }

            if (res != 0 || _hWaveIn == IntPtr.Zero)
            {
                var ex = new InvalidOperationException($"Не вдалося відкрити мікрофон (WaveIn код: {res}). Перевірте підключення мікрофона та доступ у Windows.");
                OnError?.Invoke(ex);
                throw ex;
            }

            // 8 buffers of 1280 samples (80ms per chunk at 16kHz = 2560 bytes) for ultra-responsive HUD & streaming
            const int bufferSamples = 1280;
            const int bufferBytes = bufferSamples * 2;
            int hdrSize = Marshal.SizeOf<WAVEHDR>();

            for (int i = 0; i < 8; i++)
            {
                var buf = new PinnedWaveBuffer(bufferBytes);
                waveInPrepareHeader(_hWaveIn, buf.HeaderPtr, hdrSize);
                waveInAddBuffer(_hWaveIn, buf.HeaderPtr, hdrSize);
                _buffers.Add(buf);
            }

            int startRes = waveInStart(_hWaveIn);
            if (startRes != 0)
            {
                Stop();
                var ex = new InvalidOperationException($"Помилка запуску запису з мікрофона (код: {startRes}).");
                OnError?.Invoke(ex);
                throw ex;
            }

            IsRecording = true;
        }

        public void Stop()
        {
            if (!IsRecording && _hWaveIn == IntPtr.Zero) return;

            _isStopping = true;
            IsRecording = false;

            IntPtr handle = _hWaveIn;
            _hWaveIn = IntPtr.Zero;

            if (handle != IntPtr.Zero)
            {
                try
                {
                    waveInReset(handle);
                    int hdrSize = Marshal.SizeOf<WAVEHDR>();
                    foreach (var buf in _buffers)
                    {
                        if (buf.HeaderPtr != IntPtr.Zero)
                        {
                            waveInUnprepareHeader(handle, buf.HeaderPtr, hdrSize);
                        }
                        buf.Dispose();
                    }
                    _buffers.Clear();
                    waveInClose(handle);
                }
                catch
                {
                    // Ignore cleanup errors
                }
            }

            while (_preRollQueue.TryDequeue(out _)) { }
            OnLevelUpdate?.Invoke(0, false, new float[8]);
        }

        private void OnWaveInCallback(IntPtr hwi, int uMsg, IntPtr dwInstance, IntPtr dwParam1, IntPtr dwParam2)
        {
            if (uMsg != WIM_DATA || _isStopping || !IsRecording) return;

            try
            {
                var hdr = Marshal.PtrToStructure<WAVEHDR>(dwParam1);
                int bytesRecorded = hdr.dwBytesRecorded;

                if (bytesRecorded > 0)
                {
                    byte[] rawBytes = new byte[bytesRecorded];
                    Marshal.Copy(hdr.lpData, rawBytes, 0, bytesRecorded);
                    ProcessPcmChunk(rawBytes);
                }

                if (!_isStopping && IsRecording && _hWaveIn != IntPtr.Zero)
                {
                    waveInAddBuffer(_hWaveIn, dwParam1, Marshal.SizeOf<WAVEHDR>());
                }
            }
            catch
            {
                // Prevent exceptions from escaping native callback
            }
        }

        public void ProcessPcmChunk(byte[] rawBytes)
        {
            int sampleCount = rawBytes.Length / 2;
            if (sampleCount == 0) return;

            byte[] processedBytes = new byte[sampleCount * 2];
            double rawSumSquares = 0;
            float[] bars = new float[8];
            int samplesPerBar = Math.Max(1, sampleCount / 8);

            // High-Pass filter coefficient (~85Hz @ 16kHz) to remove rumble/pop
            const float hpfAlpha = 0.968f;
            float baseGain = Math.Clamp(MicGainPercent / 100.0f, 0.5f, 8.0f);

            // First pass: High-pass filter + apply base Microphone Pre-Amp Gain
            float[] samples = new float[sampleCount];
            for (int i = 0; i < sampleCount; i++)
            {
                short s = (short)(rawBytes[i * 2] | (rawBytes[i * 2 + 1] << 8));
                float x = s / 32768f;

                if (VoiceBoost)
                {
                    float y = hpfAlpha * (_hpfPrevOut + x - _hpfPrevIn);
                    _hpfPrevIn = x;
                    _hpfPrevOut = y;
                    samples[i] = y * baseGain;
                }
                else
                {
                    samples[i] = x * baseGain;
                }

                rawSumSquares += samples[i] * samples[i];
            }

            double preAmpRms = Math.Sqrt(rawSumSquares / sampleCount);

            // Dynamic WebRTC-style Soft AGC for clear recognition even at distance (40-70cm from mic)
            if (VoiceBoost && preAmpRms > 0.002)
            {
                float targetRms = 0.16f;
                float desiredAgc = (float)(targetRms / Math.Max(0.004, preAmpRms));
                desiredAgc = Math.Clamp(desiredAgc, 1.0f, 3.6f);
                // Fast attack for quiet syllables, smooth release
                _runningGain = desiredAgc > _runningGain
                    ? _runningGain * 0.60f + desiredAgc * 0.40f
                    : _runningGain * 0.82f + desiredAgc * 0.18f;
            }
            else if (!VoiceBoost)
            {
                _runningGain = 1.0f;
            }

            // Second pass: apply AGC gain + soft-knee limiter + measure final boosted RMS & 8-bar spectrum
            double boostedSumSquares = 0;
            for (int i = 0; i < sampleCount; i++)
            {
                float v = samples[i] * _runningGain;
                // Smooth soft-knee saturation at ±0.88 so loud voice never clips
                if (v > 0.88f) v = 0.88f + 0.12f * MathF.Tanh((v - 0.88f) * 8f);
                else if (v < -0.88f) v = -0.88f + 0.12f * MathF.Tanh((v + 0.88f) * 8f);

                boostedSumSquares += v * v;

                short pcmOut = (short)Math.Clamp((int)(v * 32767f), short.MinValue, short.MaxValue);
                processedBytes[i * 2] = (byte)(pcmOut & 0xFF);
                processedBytes[i * 2 + 1] = (byte)((pcmOut >> 8) & 0xFF);

                int barIdx = Math.Min(7, i / samplesPerBar);
                bars[barIdx] += Math.Abs(v);
            }

            for (int b = 0; b < 8; b++)
            {
                bars[b] = Math.Clamp((bars[b] / samplesPerBar) * 4.5f, 0.08f, 1.0f);
            }

            double postGainRms = Math.Sqrt(boostedSumSquares / sampleCount);
            int normalizedRms = (int)Math.Clamp(Math.Round(postGainRms * 480.0), 0, 100);

            // Compare post-gain RMS against low threshold so quiet normal speech is always detected
            double activeThreshold = Math.Max(0.003, VadThreshold);
            bool isVoiceActive = postGainRms >= activeThreshold;
            long now = Environment.TickCount64;

            string base64 = Convert.ToBase64String(processedBytes);

            if (isVoiceActive)
            {
                if (_isSilentSuppressed)
                {
                    _isSilentSuppressed = false;
                    // Flush 400ms pre-roll buffer so initial Ukrainian consonants are never clipped
                    while (_preRollQueue.TryDequeue(out string? preChunk))
                    {
                        OnAudioChunk?.Invoke(preChunk, activeThreshold);
                    }
                }
                _hasDetectedSpeech = true;
                _lastSpeechTick = now;
            }

            OnLevelUpdate?.Invoke(normalizedRms, isVoiceActive, bars);

            if (_hasDetectedSpeech && !isVoiceActive)
            {
                long silentMs = now - _lastSpeechTick;
                // Only suppress sending dead air after extended hangover (1.8s+)
                if (silentMs > HangoverDurationMs && !_isSilentSuppressed)
                {
                    _isSilentSuppressed = true;
                }

                if (silentMs >= SilenceTimeoutMs)
                {
                    _hasDetectedSpeech = false;
                    OnSilenceDetected?.Invoke();
                }
            }

            if (_isSilentSuppressed)
            {
                // Keep 5 chunks (~400ms) pre-roll buffer
                _preRollQueue.Enqueue(base64);
                while (_preRollQueue.Count > 5)
                {
                    _preRollQueue.TryDequeue(out _);
                }
                return;
            }

            OnAudioChunk?.Invoke(base64, postGainRms);
        }

        public void Dispose()
        {
            Stop();
        }
    }
}
