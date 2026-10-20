using System;
using System.IO;
using System.Runtime.InteropServices;
using VoxFlow.Audio;
using VoxFlow.Native;

namespace VoxFlow.Core
{
    public static class SelfTestRunner
    {
        public static int RunAllTests()
        {
            Console.OutputEncoding = System.Text.Encoding.UTF8;
            int passed = 0;
            int failed = 0;

            void AssertTrue(string name, bool condition, string? detail = null)
            {
                if (condition)
                {
                    passed++;
                    Console.WriteLine($"  [PASS] {name}");
                }
                else
                {
                    failed++;
                    Console.WriteLine($"  [FAIL] {name} — {detail}");
                }
            }

            Console.WriteLine("=== VoxFlow Automated Test Suite ===");

            // 1. Test TextCleaner & Ukrainian Language Lock
            string polishSample = "Dzień dobry, proszę bardzo, jak się masz? То єст бардзо добре, przepraszam.";
            string lockedUk = TextCleaner.FilterLanguageLock(polishSample, "uk");
            AssertTrue("FilterLanguageLock converts Polish words & Cyrillic phonetics to Ukrainian",
                lockedUk.Contains("добрий день", StringComparison.OrdinalIgnoreCase) &&
                lockedUk.Contains("будь ласка", StringComparison.OrdinalIgnoreCase) &&
                lockedUk.Contains("як справи", StringComparison.OrdinalIgnoreCase) &&
                lockedUk.Contains("дуже добре", StringComparison.OrdinalIgnoreCase) &&
                lockedUk.Contains("вибачте", StringComparison.OrdinalIgnoreCase) &&
                !TextCleaner.HasPolishIndicators(lockedUk),
                $"Got: {lockedUk}");

            // 2. Test Smart Polish filler removal & stutter deduplication
            string messyUk = "От я я, ну, е-е, типу короче кажучи пішов в діскорд.";
            string polished = TextCleaner.CleanSmartPolish(messyUk, "uk");
            AssertTrue("CleanSmartPolish removes Ukrainian fillers & stutters and capitalizes",
                polished == "Я пішов в діскорд.",
                $"Got: '{polished}'");

            // 3. Test ExtractNewSpeech & StripTailOverlap
            string checkpoint = "Привіт, як справи";
            string rawStream = "Привіт, як справи сьогодні ввечері";
            string delta = TextCleaner.ExtractNewSpeech(rawStream, checkpoint);
            AssertTrue("ExtractNewSpeech extracts only newly spoken words after checkpoint",
                delta == "сьогодні ввечері",
                $"Got: '{delta}'");

            string overlapStripped = TextCleaner.StripTailOverlap("Це тестове речення", "тестове речення працює чудово");
            AssertTrue("StripTailOverlap strips 1-4 overlapping boundary words",
                overlapStripped == "працює чудово",
                $"Got: '{overlapStripped}'");

            // 4. Test Prompts Ukrainian Language Lock
            string ukPrompt = Prompts.GetSystemPrompt("smart_polish", "uk");
            AssertTrue("Prompts.GetSystemPrompt includes strict Ukrainian single-language lock",
                ukPrompt.Contains("MANDATORY SINGLE-LANGUAGE LOCK: UKRAINIAN") &&
                ukPrompt.Contains("ZERO-TOLERANCE FOR POLISH OR RUSSIAN"));

            // 5. Test ConfigManager Cyrillic Hotkey Fix & Persistence
            string fixedHk = ConfigManager.NormalizeHotkeyString("CommandOrControl+Shift+К");
            AssertTrue("ConfigManager normalizes Ukrainian Cyrillic 'К' in hotkey to physical 'Ctrl+Shift+R'",
                fixedHk == "Ctrl+Shift+R",
                $"Got: '{fixedHk}'");

            string tempConfigPath = Path.Combine(Path.GetTempPath(), $"voxflow_test_{Guid.NewGuid():N}.json");
            try
            {
                var cfg = new AppConfig
                {
                    ApiKey = "test-key-123",
                    RecordHotkey = "CommandOrControl+Shift+К",
                    Model = "gemini-2.0-flash-exp" // deprecated -> should auto-migrate
                };
                ConfigManager.Save(cfg, tempConfigPath);
                var reloaded = ConfigManager.Load(tempConfigPath);
                AssertTrue("ConfigManager migrates deprecated models and saves/loads cleanly",
                    reloaded.ApiKey == "test-key-123" &&
                    reloaded.RecordHotkey == "Ctrl+Shift+R" &&
                    reloaded.Model == "gemini-3.5-transcribe-live");
            }
            finally
            {
                if (File.Exists(tempConfigPath)) File.Delete(tempConfigPath);
            }

            // 6. Test Win32Helper Hotkey Parsing & SendInput Struct Layout
            var parsedHk = Win32Helper.ParseHotkey("Ctrl+Shift+R");
            AssertTrue("Win32Helper.ParseHotkey parses Ctrl+Shift+R into physical VK 0x52 ('R')",
                parsedHk.IsValid && parsedHk.Ctrl && parsedHk.Shift && !parsedHk.Alt && parsedHk.VirtualKey == 'R');

            var parsedWhisperHk = Win32Helper.ParseHotkey("Ctrl+Alt");
            AssertTrue("Win32Helper.ParseHotkey supports modifier-only Whisper hotkey 'Ctrl+Alt'",
                parsedWhisperHk.IsValid && parsedWhisperHk.IsModifierOnly && parsedWhisperHk.Ctrl && parsedWhisperHk.Alt && !parsedWhisperHk.Shift);

            var parsedRightAlt = Win32Helper.ParseHotkey("RightAlt");
            AssertTrue("Win32Helper.ParseHotkey supports single key 'RightAlt' (VK_RMENU)",
                parsedRightAlt.IsValid && !parsedRightAlt.IsModifierOnly && parsedRightAlt.VirtualKey == Win32Helper.VK_RMENU);

            int inputStructSize = Marshal.SizeOf<Win32Helper.INPUT>();
            int expectedSize = Environment.Is64BitProcess ? 40 : 28;
            AssertTrue($"Win32Helper.INPUT struct size matches OS SendInput ABI ({expectedSize} bytes)",
                inputStructSize == expectedSize,
                $"Got: {inputStructSize}");

            // 7. Test GeminiLiveClient Protocol Builder & Parser
            string setupJson = GeminiLiveClient.CreateSetupMessageJson("gemini-3.5-transcribe-live", "System prompt test");
            AssertTrue("GeminiLiveClient.CreateSetupMessageJson formats model and systemInstruction",
                setupJson.Contains("\"models/gemini-3.5-transcribe-live\"") &&
                setupJson.Contains("\"responseModalities\":[\"TEXT\"]"));

            var client = new GeminiLiveClient("dummy-key");
            string? receivedFull = null;
            client.OnDelta += (_, _, full) => receivedFull = full;
            client.HandleServerJson("{\"setupComplete\":{}}");
            client.HandleServerJson("{\"serverContent\":{\"inputTranscription\":{\"text\":\"Привіт із VoxFlow!\"},\"turnComplete\":true}}");
            AssertTrue("GeminiLiveClient handles setupComplete, inputTranscription, and turnComplete",
                client.IsSetupComplete && receivedFull == "Привіт із VoxFlow!" && client.CommittedText == "Привіт із VoxFlow!",
                $"Got: '{receivedFull}'");

            // 8. Test NativeAudioRecorder DSP Preprocessing (High-Pass + Voice Boost + 8-bar spectrum)
            using var recorder = new NativeAudioRecorder { VoiceBoost = true, VadThreshold = 0.01 };
            bool levelFired = false;
            float[]? capturedBars = null;
            recorder.OnLevelUpdate += (rms, speaking, bars) =>
            {
                levelFired = true;
                capturedBars = bars;
            };
            // Generate synthetic 440Hz sine wave at 16kHz (1280 samples = 2560 bytes)
            byte[] synthPcm = new byte[2560];
            for (int i = 0; i < 1280; i++)
            {
                short sample = (short)(Math.Sin(2.0 * Math.PI * 440.0 * i / 16000.0) * 12000);
                synthPcm[i * 2] = (byte)(sample & 0xFF);
                synthPcm[i * 2 + 1] = (byte)((sample >> 8) & 0xFF);
            }
            recorder.ProcessPcmChunk(synthPcm);
            AssertTrue("NativeAudioRecorder DSP processes 16kHz PCM and computes 8-bar Whisper spectrum",
                levelFired && capturedBars != null && capturedBars.Length == 8 && capturedBars[0] > 0.1f);

            Console.WriteLine($"=== Results: {passed} passed, {failed} failed ===");
            return failed == 0 ? 0 : 1;
        }
    }
}
