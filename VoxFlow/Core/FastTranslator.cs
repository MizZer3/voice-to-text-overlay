using System;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace VoxFlow.Core
{
    public static class FastTranslator
    {
        private static readonly HttpClient Http = new()
        {
            Timeout = TimeSpan.FromSeconds(12)
        };

        private static readonly string[] ModelsToTry =
        {
            "gemini-3.5-flash-lite",
            "gemini-3.1-flash-lite"
        };

        public static async Task<string> TranslateTextAsync(
            string text,
            string targetLanguage = "English",
            string apiKey = "",
            CancellationToken cancellationToken = default)
        {
            string trimmed = (text ?? "").Trim();
            if (string.IsNullOrEmpty(trimmed) || string.IsNullOrWhiteSpace(apiKey))
            {
                return trimmed;
            }

            string prompt = $@"You are a professional simultaneous interpreter.
Translate the following spoken text accurately and naturally into {targetLanguage}.
Rules:
1. Output ONLY the raw translated text.
2. Do NOT add quotes, explanations, markdown formatting, or conversational remarks.
3. Preserve the speaker's tone, emphasis, and intent.

Text to translate:
{trimmed}";

            var payload = new
            {
                contents = new[]
                {
                    new
                    {
                        parts = new[]
                        {
                            new { text = prompt }
                        }
                    }
                },
                generationConfig = new
                {
                    temperature = 0.1,
                    maxOutputTokens = 1024
                }
            };

            string jsonBody = JsonSerializer.Serialize(payload);

            foreach (string model in ModelsToTry)
            {
                try
                {
                    string url = $"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={Uri.EscapeDataString(apiKey.Trim())}";
                    using var content = new StringContent(jsonBody, Encoding.UTF8, "application/json");
                    using var response = await Http.PostAsync(url, content, cancellationToken);

                    if (response.IsSuccessStatusCode)
                    {
                        string respJson = await response.Content.ReadAsStringAsync(cancellationToken);
                        using var doc = JsonDocument.Parse(respJson);
                        if (doc.RootElement.TryGetProperty("candidates", out var candidates) &&
                            candidates.ValueKind == JsonValueKind.Array &&
                            candidates.GetArrayLength() > 0)
                        {
                            var first = candidates[0];
                            if (first.TryGetProperty("content", out var contentEl) &&
                                contentEl.TryGetProperty("parts", out var parts) &&
                                parts.ValueKind == JsonValueKind.Array &&
                                parts.GetArrayLength() > 0 &&
                                parts[0].TryGetProperty("text", out var textEl) &&
                                textEl.ValueKind == JsonValueKind.String)
                            {
                                string rawCandidate = (textEl.GetString() ?? "").Trim();
                                string cleaned = rawCandidate.Trim('"', '\'', '«', '»', '„', '“').Trim();
                                if (!string.IsNullOrEmpty(cleaned))
                                    return cleaned;
                                if (!string.IsNullOrEmpty(rawCandidate))
                                    return rawCandidate;
                            }
                        }
                    }
                }
                catch
                {
                    // Try fallback model
                }
            }

            return trimmed;
        }
    }
}
