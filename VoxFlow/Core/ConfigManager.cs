using System;
using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace VoxFlow.Core
{
    public class AppConfig
    {
        [JsonPropertyName("apiKey")]
        public string ApiKey { get; set; } = "";

        [JsonPropertyName("mode")]
        public string Mode { get; set; } = "smart_polish"; // "smart_polish" | "verbatim"

        [JsonPropertyName("targetLanguage")]
        public string TargetLanguage { get; set; } = "English";

        [JsonPropertyName("model")]
        public string Model { get; set; } = "gemini-3.5-transcribe-live";

        [JsonPropertyName("recordingBehavior")]
        public string RecordingBehavior { get; set; } = "toggle"; // "toggle" | "push_to_talk"

        [JsonPropertyName("vadThreshold")]
        public double VadThreshold { get; set; } = 0.0035;

        [JsonPropertyName("micGainPercent")]
        public int MicGainPercent { get; set; } = 320; // 100% = 1x, 320% = 3.2x base pre-amp + AGC

        [JsonPropertyName("silenceTimeoutMs")]
        public int SilenceTimeoutMs { get; set; } = 1600;

        [JsonPropertyName("autoCopy")]
        public bool AutoCopy { get; set; } = true;

        [JsonPropertyName("directPaste")]
        public bool DirectPaste { get; set; } = true;

        [JsonPropertyName("pasteOnPause")]
        public bool PasteOnPause { get; set; } = false;

        [JsonPropertyName("alwaysOnTop")]
        public bool AlwaysOnTop { get; set; } = true;

        [JsonPropertyName("showWhisperHud")]
        public bool ShowWhisperHud { get; set; } = true;

        [JsonPropertyName("voiceBoost")]
        public bool VoiceBoost { get; set; } = true;

        [JsonPropertyName("globalHotkey")]
        public string GlobalHotkey { get; set; } = "Alt+Space";

        [JsonPropertyName("recordHotkey")]
        public string RecordHotkey { get; set; } = "Ctrl+Shift+R";

        [JsonPropertyName("windowOpacity")]
        public int WindowOpacity { get; set; } = 98;

        [JsonPropertyName("deviceId")]
        public int DeviceId { get; set; } = -1; // -1 = Default Windows WaveIn Device

        [JsonPropertyName("fontSize")]
        public string FontSize { get; set; } = "medium"; // "small" | "medium" | "large"

        [JsonPropertyName("spokenLanguage")]
        public string SpokenLanguage { get; set; } = "uk"; // "uk" | "en" | "pl" | "de" | "es" | "auto"

        [JsonPropertyName("customInstructions")]
        public string CustomInstructions { get; set; } = "";

        [JsonPropertyName("configVersion")]
        public int ConfigVersion { get; set; } = 4;
    }

    public static class ConfigManager
    {
        private static readonly string AppDataFolder = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "VoxFlow"
        );

        public static string ConfigFilePath => Path.Combine(AppDataFolder, "config.json");

        private static readonly JsonSerializerOptions JsonOptions = new()
        {
            WriteIndented = true,
            PropertyNameCaseInsensitive = true
        };

        public static AppConfig Load(string? customPath = null)
        {
            string targetPath = customPath ?? ConfigFilePath;
            AppConfig config = new();

            try
            {
                if (File.Exists(targetPath))
                {
                    string json = File.ReadAllText(targetPath);
                    var loaded = JsonSerializer.Deserialize<AppConfig>(json, JsonOptions);
                    if (loaded != null)
                    {
                        config = loaded;
                    }
                }
                else
                {
                    // Try migrating from legacy Electron app folders
                    TryMigrateLegacyConfig(config);
                    Save(config, targetPath);
                }
            }
            catch
            {
                TryMigrateLegacyConfig(config);
            }

            if (string.IsNullOrWhiteSpace(config.ApiKey))
            {
                TryMigrateLegacyConfig(config);
            }

            NormalizeConfig(config);
            return config;
        }

        public static AppConfig Save(AppConfig config, string? customPath = null)
        {
            NormalizeConfig(config);
            string targetPath = customPath ?? ConfigFilePath;
            try
            {
                string? dir = Path.GetDirectoryName(targetPath);
                if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
                {
                    Directory.CreateDirectory(dir);
                }
                string json = JsonSerializer.Serialize(config, JsonOptions);
                File.WriteAllText(targetPath, json);
            }
            catch
            {
                // Ignore disk write errors in restricted environments
            }
            return config;
        }

        public static AppConfig Reset(string? customPath = null)
        {
            var fresh = new AppConfig();
            TryMigrateLegacyConfig(fresh, apiKeyOnly: true);
            return Save(fresh, customPath);
        }

        public static string NormalizeHotkeyString(string? raw)
        {
            if (string.IsNullOrWhiteSpace(raw)) return "";
            string s = raw.Trim()
                .Replace("CommandOrControl", "Ctrl", StringComparison.OrdinalIgnoreCase)
                .Replace("Control", "Ctrl", StringComparison.OrdinalIgnoreCase);

            // Convert accidental Ukrainian/Cyrillic physical letter mappings from old config
            s = ReplaceCyrillicHotkeyChar(s);
            return s;
        }

        private static string ReplaceCyrillicHotkeyChar(string hotkey)
        {
            var parts = hotkey.Split('+', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            for (int i = 0; i < parts.Length; i++)
            {
                if (parts[i].Length == 1)
                {
                    char c = char.ToUpperInvariant(parts[i][0]);
                    char mapped = c switch
                    {
                        'Й' => 'Q', 'Ц' => 'W', 'У' => 'E', 'К' => 'R', 'Е' => 'T',
                        'Н' => 'Y', 'Г' => 'U', 'Ш' => 'I', 'Щ' => 'O', 'З' => 'P',
                        'Ф' => 'A', 'І' => 'S', 'Ы' => 'S', 'В' => 'D', 'А' => 'F',
                        'П' => 'G', 'Р' => 'H', 'О' => 'J', 'Л' => 'K', 'Д' => 'L',
                        'Я' => 'Z', 'Ч' => 'X', 'С' => 'C', 'М' => 'V', 'И' => 'B',
                        'Т' => 'N', 'Ь' => 'M',
                        _ => c
                    };
                    parts[i] = mapped.ToString();
                }
            }
            return string.Join("+", parts);
        }

        private static void NormalizeConfig(AppConfig config)
        {
            if (config.Mode != "smart_polish" && config.Mode != "verbatim")
            {
                config.Mode = "smart_polish";
            }

            string[] allowedSpoken = { "uk", "en", "pl", "de", "es", "auto" };
            if (Array.IndexOf(allowedSpoken, config.SpokenLanguage) < 0)
            {
                config.SpokenLanguage = "uk";
            }

            string cleanModel = (config.Model ?? "").Replace("models/", "", StringComparison.OrdinalIgnoreCase).Trim();
            if (string.IsNullOrEmpty(cleanModel) ||
                cleanModel.StartsWith("gemini-2.", StringComparison.OrdinalIgnoreCase) ||
                cleanModel.Equals("gemini-3.5-live-translate", StringComparison.OrdinalIgnoreCase))
            {
                config.Model = "gemini-3.5-transcribe-live";
            }
            else
            {
                config.Model = cleanModel;
            }

            config.GlobalHotkey = NormalizeHotkeyString(config.GlobalHotkey);
            if (string.IsNullOrEmpty(config.GlobalHotkey)) config.GlobalHotkey = "Alt+Space";

            config.RecordHotkey = NormalizeHotkeyString(config.RecordHotkey);
            if (string.IsNullOrEmpty(config.RecordHotkey)) config.RecordHotkey = "Ctrl+Shift+R";

            if (config.ConfigVersion < 4)
            {
                config.VadThreshold = 0.0035;
                if (config.MicGainPercent < 200)
                    config.MicGainPercent = 320;
            }

            config.MicGainPercent = Math.Clamp(config.MicGainPercent, 100, 600);
            config.VadThreshold = Math.Clamp(config.VadThreshold, 0.001, 0.08);
            config.SilenceTimeoutMs = Math.Clamp(config.SilenceTimeoutMs, 600, 5000);
            config.WindowOpacity = Math.Clamp(config.WindowOpacity, 40, 100);
            config.ConfigVersion = 4;
        }

        private static void TryMigrateLegacyConfig(AppConfig target, bool apiKeyOnly = false)
        {
            string appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
            string[] legacyPaths =
            {
                Path.Combine(appData, "voice-to-text-overlay", "gemini_config_backup.json"),
                Path.Combine(appData, "gemini-live-overlay", "gemini_config_backup.json")
            };

            foreach (string path in legacyPaths)
            {
                try
                {
                    if (!File.Exists(path)) continue;
                    string json = File.ReadAllText(path);
                    using JsonDocument doc = JsonDocument.Parse(json);
                    var root = doc.RootElement;

                    if (root.TryGetProperty("apiKey", out var apiKeyProp) && apiKeyProp.ValueKind == JsonValueKind.String)
                    {
                        string key = apiKeyProp.GetString() ?? "";
                        if (!string.IsNullOrWhiteSpace(key))
                        {
                            target.ApiKey = key.Trim();
                            if (apiKeyOnly) return;
                        }
                    }

                    if (!apiKeyOnly)
                    {
                        if (root.TryGetProperty("spokenLanguage", out var sl) && sl.ValueKind == JsonValueKind.String)
                            target.SpokenLanguage = sl.GetString() ?? "uk";
                        if (root.TryGetProperty("targetLanguage", out var tl) && tl.ValueKind == JsonValueKind.String)
                            target.TargetLanguage = tl.GetString() ?? "English";
                        if (root.TryGetProperty("mode", out var m) && m.ValueKind == JsonValueKind.String)
                            target.Mode = m.GetString() ?? "smart_polish";
                        if (root.TryGetProperty("directPaste", out var dp) && (dp.ValueKind == JsonValueKind.True || dp.ValueKind == JsonValueKind.False))
                            target.DirectPaste = dp.GetBoolean();
                    }

                    if (!string.IsNullOrWhiteSpace(target.ApiKey))
                        return;
                }
                catch
                {
                    // Ignore malformed legacy file
                }
            }
        }
    }
}
