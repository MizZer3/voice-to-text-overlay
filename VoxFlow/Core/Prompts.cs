using System;
using System.Collections.Generic;

namespace VoxFlow.Core
{
    public record ModeInfo(string Id, string Name, string ShortName, string Icon, string Description, string DefaultModel);
    public record ModelOption(string Id, string Name);
    public record LanguageOption(string Code, string Name, string ShortLabel);
    public record SpokenLanguageOption(string Code, string Name, string Flag);

    public static class Prompts
    {
        public static readonly IReadOnlyDictionary<string, ModeInfo> Modes = new Dictionary<string, ModeInfo>
        {
            ["smart_polish"] = new(
                "smart_polish",
                "Чистовик (Smart Polish)",
                "Чистовик",
                "✨",
                "Очищення від слів-паразитів, природна українська пунктуація та збереження змісту.",
                "gemini-3.5-transcribe-live"
            ),
            ["verbatim"] = new(
                "verbatim",
                "Дослівна стенограма (Verbatim)",
                "Стенограма",
                "📝",
                "Точна транскрипція слово в слово без жодних змін чи пропусків.",
                "gemini-3.5-transcribe-live"
            )
        };

        public static readonly IReadOnlyList<ModelOption> DefaultModels = new List<ModelOption>
        {
            new("gemini-3.5-transcribe-live", "Gemini 3.5 Transcribe Live (Рекомендовано — найточніший STT)"),
            new("gemini-3.5-live-translate-preview", "Gemini 3.5 Live Translate (Аудіо-перекладач)")
        };

        public static readonly IReadOnlyList<LanguageOption> SupportedTargetLanguages = new List<LanguageOption>
        {
            new("English", "🇬🇧 English (Англійська)", "EN"),
            new("Ukrainian", "🇺🇦 Ukrainian (Українська)", "UK"),
            new("Polish", "🇵🇱 Polish (Польська)", "PL"),
            new("German", "🇩🇪 German (Німецька)", "DE"),
            new("French", "🇫🇷 French (Французька)", "FR"),
            new("Spanish", "🇪🇸 Spanish (Іспанська)", "ES"),
            new("Italian", "🇮🇹 Italian (Італійська)", "IT"),
            new("Portuguese", "🇵🇹 Portuguese (Португальська)", "PT"),
            new("Japanese", "🇯🇵 Japanese (Японська)", "JA"),
            new("Chinese", "🇨🇳 Chinese (Китайська)", "ZH")
        };

        public static readonly IReadOnlyList<SpokenLanguageOption> SupportedSpokenLanguages = new List<SpokenLanguageOption>
        {
            new("uk", "🇺🇦 Тільки Українська (Жорсткий захист від польської/російської)", "🇺🇦"),
            new("en", "🇬🇧 Only English (Strict lock)", "🇬🇧"),
            new("pl", "🇵🇱 Tylko Polski (Strict lock)", "🇵🇱"),
            new("de", "🇩🇪 Nur Deutsch (Strict lock)", "🇩🇪"),
            new("es", "🇪🇸 Sólo Español (Strict lock)", "🇪🇸"),
            new("auto", "🌐 Автовизначення мови (Auto-detect)", "🌐")
        };

        public static readonly IReadOnlyDictionary<string, string> SpokenLanguageDirectives = new Dictionary<string, string>
        {
            ["uk"] = @"MANDATORY SINGLE-LANGUAGE LOCK: UKRAINIAN (УКРАЇНСЬКА МОВА) ONLY.
YOU ARE CONFIGURED EXCLUSIVELY AS A NATIVE UKRAINIAN SPEECH TRANSCRIBER.
THE SPEAKER IS A NATIVE UKRAINIAN SPEAKER SPEAKING UKRAINIAN (УКРАЇНСЬКОЮ МОВОЮ).
CRITICAL ENFORCEMENT RULES:
1. ZERO-TOLERANCE FOR POLISH OR RUSSIAN: Under NO circumstances should you ever output Polish (język polski), Russian, or any other foreign language.
2. POLISH IS STRICTLY FORBIDDEN: Never output Polish words (such as 'tak', 'dobrze', 'dzień', 'co', 'jest', 'bardzo', 'proszę', 'nie', 'się', 'dla', 'chcę', 'może', 'kiedy', 'gdzie', 'teraz', 'wszystko') or Polish Latin diacritics (ą, ć, ę, ł, ń, ó, ś, ź, ż).
3. UKRAINIAN PHONETIC DISAMBIGUATION:
   - Ukrainian palatalized consonants ('дз', 'дж', 'сь', 'ць', 'зь') and vowels ('и', 'і', 'ї', 'є') must ALWAYS be recognized as standard Ukrainian words (e.g., 'так', 'добре', 'день', 'що', 'є', 'дуже', 'будь ласка', 'ні', 'для', 'хочу', 'може', 'коли', 'де', 'зараз', 'все', 'взагалі', 'привіт', 'проєкт', 'налаштування', 'хоткеї', 'автовставка').
   - Common conversational Ukrainian words and IT/gaming terms spoken in Ukrainian context (e.g., 'діскорд', 'телеграм', 'мікрофон', 'кнопка', 'вікно', 'запис', 'текст', 'копіювати', 'вставити') must be written cleanly in Ukrainian.
4. ALL output text MUST be written 100% in the Ukrainian Cyrillic alphabet (а-я, і, ї, є, ґ). Only widely recognized international brand names (e.g., Discord, Google, Windows, Whisper, Gemini) may appear in Latin if appropriate.
5. DO NOT ATTEMPT TO AUTO-DETECT OR SWITCH LANGUAGES. The user is speaking Ukrainian. Transcribe strictly in Ukrainian.
6. If the audio is unclear or silent, output NOTHING. Never guess in Polish or another language.",

            ["en"] = @"MANDATORY SINGLE-LANGUAGE LOCK: ENGLISH ONLY.
YOU ARE CONFIGURED EXCLUSIVELY AS AN ENGLISH SPEECH TRANSCRIBER.
THE SPEAKER IS SPEAKING ENGLISH.
Transcribe and process all spoken audio strictly in English using standard English spelling.",

            ["pl"] = @"MANDATORY SINGLE-LANGUAGE LOCK: POLISH (JĘZYK POLSKI) ONLY.
YOU ARE CONFIGURED EXCLUSIVELY AS A POLISH SPEECH TRANSCRIBER.
THE SPEAKER IS SPEAKING POLISH.
Transcribe and process all spoken audio strictly in Polish with proper Polish diacritics (ą, ć, ę, ł, ń, ó, ś, ź, ż).",

            ["de"] = @"MANDATORY SINGLE-LANGUAGE LOCK: GERMAN (DEUTSCH) ONLY.
YOU ARE CONFIGURED EXCLUSIVELY AS A GERMAN SPEECH TRANSCRIBER.
THE SPEAKER IS SPEAKING GERMAN.
Transcribe and process all spoken audio strictly in German with proper umlauts and capitalization.",

            ["es"] = @"MANDATORY SINGLE-LANGUAGE LOCK: SPANISH (ESPAÑOL) ONLY.
YOU ARE CONFIGURED EXCLUSIVELY AS A SPANISH SPEECH TRANSCRIBER.
THE SPEAKER IS SPEAKING SPANISH.
Transcribe and process all spoken audio strictly in Spanish.",

            ["auto"] = @"SPOKEN LANGUAGE DIRECTIVE:
- Detect the spoken language automatically.
- Output text in the exact language spoken by the user without translating."
        };

        private const string SmartPolishPrompt = @"You are an elite real-time speech polish and transcription engine.
Your job is to transcribe the spoken audio cleanly into polished, natural written text while strictly preserving the speaker's original meaning, intent, and vocabulary.
Rules:
1. Remove speech fillers, hesitations, and stutters (e.g., in Ukrainian: 'е-е', 'ну', 'типу', 'як би', 'короче', 'коротше', 'значить', 'от'; in English: 'um', 'uh', 'like', 'you know', 'sort of').
2. Fix broken sentence fragments into coherent, grammatical sentences with natural Ukrainian morphology and word endings.
3. Apply accurate punctuation (commas, periods, question marks, dashes) and capitalization.
4. Do NOT answer questions or engage in conversation.
5. Output ONLY the polished transcription. Never prepend prefixes like 'Transcript:' or 'Here is...'.
6. Language Preservation: Output strictly in the configured language. Never translate unless in translation mode.
7. If there is silence, background noise, or no clear speech, output absolutely NOTHING.";

        private const string VerbatimPrompt = @"You are an ultra-accurate real-time speech-to-text transcription engine.
Your single job is to transcribe the user's spoken audio verbatim, word for word.
Strict Rules:
1. Do NOT answer questions, do NOT converse, do NOT add filler words or remarks.
2. Output ONLY the transcribed words spoken by the user.
3. Transcribe in the exact language configured. Never translate or switch to another language.
4. Add basic capitalization and standard punctuation where pauses occur, but do NOT alter or rephrase any words.
5. If there is background noise, silence, or non-speech sounds, output absolutely NOTHING.";

        public static string GetSystemPrompt(string modeId, string spokenLanguage = "uk", string targetLanguage = "English", string customInstructions = "")
        {
            string basePrompt = modeId switch
            {
                "verbatim" => VerbatimPrompt,
                "live_translate" => $@"You are a professional real-time simultaneous speech interpreter.
Your job is to listen to the user's speech and translate it immediately and accurately into {targetLanguage}.
Rules:
1. Translate the spoken thoughts directly into high quality, fluent {targetLanguage}.
2. Preserve the speaker's tone, emphasis, and intent.
3. Do NOT engage in conversation, do NOT explain translations.
4. Output ONLY the translated text in {targetLanguage}.
5. If there is silence or only background noise, output absolutely NOTHING.",
                _ => SmartPolishPrompt
            };

            string prompt;
            if (modeId != "live_translate")
            {
                if (!SpokenLanguageDirectives.TryGetValue(spokenLanguage ?? "uk", out string? directive))
                {
                    directive = SpokenLanguageDirectives["uk"];
                }
                prompt = $"{directive}\n\n{basePrompt}";
            }
            else
            {
                prompt = basePrompt;
            }

            if (!string.IsNullOrWhiteSpace(customInstructions))
            {
                prompt += $"\n\nUser Custom Instructions:\n{customInstructions.Trim()}";
            }

            return prompt;
        }
    }
}
