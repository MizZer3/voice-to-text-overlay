using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;

namespace VoxFlow.Core
{
    public static class TextCleaner
    {
        private static readonly Regex PolishDiacriticsRegex = new(@"[ąćęłńśźżĄĆĘŁŃŚŹŻ]", RegexOptions.Compiled);

        private static readonly Regex PolishIndicatorsRegex = new(
            @"(?<!\p{L})(?:dzień|dobry|dobrze|proszę|prosze|dziękuję|dziekuje|bardzo|przepraszam|oczywiście|oczywiscie|nie\s+wiem|jak\s+się\s+masz|jak\s+sie\s+masz|co\s+tam\s+słychać|jestem|jesteś|jestes|chcę|chce|chciałbym|będzie|bedzie|będziemy|będą|człowiek|ludzie|dlaczego|kiedy|teraz|wszystko|to\s+jest|nie\s+rozumiem|słucham|mówię|pamiętam|naprawdę|życie|szczęście|dziecko|dzieci|pieniądze|бардзо|дзєнь|дзень|пшепрашам|перепрашам|проше|дзєкую|дзенкую|цо\s+то|цось|людзє|єстем|панство)(?!\p{L})",
            RegexOptions.IgnoreCase | RegexOptions.Compiled | RegexOptions.CultureInvariant
        );

        private static readonly (Regex Pattern, string Replacement)[] PolishMultiWordMap =
        {
            (new(@"(?<!\p{L})(?:dzień\s+dobry|dzien\s+dobry|дзєнь\s+добри|дзень\s+добри)(?!\p{L})", RegexOptions.IgnoreCase | RegexOptions.Compiled), "добрий день"),
            (new(@"(?<!\p{L})(?:dobry\s+wieczór|dobry\s+wieczor|добри\s+вечор)(?!\p{L})", RegexOptions.IgnoreCase | RegexOptions.Compiled), "добрий вечір"),
            (new(@"(?<!\p{L})(?:jak\s+się\s+masz|jak\s+sie\s+masz|co\s+tam\s+słychać|co\s+tam\s+slychac|як\s+сє\s+маш|як\s+се\s+маш)(?!\p{L})", RegexOptions.IgnoreCase | RegexOptions.Compiled), "як справи"),
            (new(@"(?<!\p{L})(?:nie\s+wiem|нє\s+вєм|не\s+вєм)(?!\p{L})", RegexOptions.IgnoreCase | RegexOptions.Compiled), "не знаю"),
            (new(@"(?<!\p{L})(?:nie\s+rozumiem)(?!\p{L})", RegexOptions.IgnoreCase | RegexOptions.Compiled), "не розумію"),
            (new(@"(?<!\p{L})(?:to\s+jest|то\s+єст)(?!\p{L})", RegexOptions.IgnoreCase | RegexOptions.Compiled), "це"),
            (new(@"(?<!\p{L})(?:wszystko\s+w\s+porządku|wszystko\s+w\s+porzadku)(?!\p{L})", RegexOptions.IgnoreCase | RegexOptions.Compiled), "все гаразд"),
            (new(@"(?<!\p{L})(?:цо\s+то\s+єст|цо\s+то\s+є)(?!\p{L})", RegexOptions.IgnoreCase | RegexOptions.Compiled), "що це"),
            (new(@"(?<!\p{L})(?:проше\s+бардзо)(?!\p{L})", RegexOptions.IgnoreCase | RegexOptions.Compiled), "будь ласка"),
            (new(@"(?<!\p{L})(?:може\s+биць)(?!\p{L})", RegexOptions.IgnoreCase | RegexOptions.Compiled), "може бути"),
            (new(@"(?<!\p{L})(?:bardzo\s+dobrze|бардзо\s+добже|бардзо\s+добре)(?!\p{L})", RegexOptions.IgnoreCase | RegexOptions.Compiled), "дуже добре"),
            (new(@"(?<!\p{L})(?:dziękuję\s+bardzo|dziekuje\s+bardzo|бардзо\s+дзєкую)(?!\p{L})", RegexOptions.IgnoreCase | RegexOptions.Compiled), "дякую дуже"),
            (new(@"(?<!\p{L})(?:za\s+pomoc|za\s+pomocą)(?!\p{L})", RegexOptions.IgnoreCase | RegexOptions.Compiled), "за допомогу")
        };

        private static readonly (Regex Pattern, string Replacement)[] CyrillicPolishMap =
        {
            (new(@"(?<!\p{L})бардзо(?!\p{L})", RegexOptions.IgnoreCase | RegexOptions.Compiled), "дуже"),
            (new(@"(?<!\p{L})пшепрашам(?!\p{L})", RegexOptions.IgnoreCase | RegexOptions.Compiled), "вибачте"),
            (new(@"(?<!\p{L})перепрашам(?!\p{L})", RegexOptions.IgnoreCase | RegexOptions.Compiled), "перепрошую"),
            (new(@"(?<!\p{L})проше(?!\p{L})", RegexOptions.IgnoreCase | RegexOptions.Compiled), "прошу"),
            (new(@"(?<!\p{L})дзєкую(?!\p{L})", RegexOptions.IgnoreCase | RegexOptions.Compiled), "дякую"),
            (new(@"(?<!\p{L})дзенкую(?!\p{L})", RegexOptions.IgnoreCase | RegexOptions.Compiled), "дякую"),
            (new(@"(?<!\p{L})цось(?!\p{L})", RegexOptions.IgnoreCase | RegexOptions.Compiled), "щось"),
            (new(@"(?<!\p{L})цо(?!\p{L})", RegexOptions.IgnoreCase | RegexOptions.Compiled), "що"),
            (new(@"(?<!\p{L})гдзє(?!\p{L})", RegexOptions.IgnoreCase | RegexOptions.Compiled), "де"),
            (new(@"(?<!\p{L})хце(?!\p{L})", RegexOptions.IgnoreCase | RegexOptions.Compiled), "хочу"),
            (new(@"(?<!\p{L})встистко(?!\p{L})", RegexOptions.IgnoreCase | RegexOptions.Compiled), "все"),
            (new(@"(?<!\p{L})вшистко(?!\p{L})", RegexOptions.IgnoreCase | RegexOptions.Compiled), "все"),
            (new(@"(?<!\p{L})ніц(?!\p{L})", RegexOptions.IgnoreCase | RegexOptions.Compiled), "нічого"),
            (new(@"(?<!\p{L})єстем(?!\p{L})", RegexOptions.IgnoreCase | RegexOptions.Compiled), "я є"),
            (new(@"(?<!\p{L})людзє(?!\p{L})", RegexOptions.IgnoreCase | RegexOptions.Compiled), "люди"),
            (new(@"(?<!\p{L})дзєцько(?!\p{L})", RegexOptions.IgnoreCase | RegexOptions.Compiled), "дитина"),
            (new(@"(?<!\p{L})дзєци(?!\p{L})", RegexOptions.IgnoreCase | RegexOptions.Compiled), "діти"),
            (new(@"(?<!\p{L})панство(?!\p{L})", RegexOptions.IgnoreCase | RegexOptions.Compiled), "панове")
        };

        private static readonly (Regex Pattern, string Replacement)[] PolishSingleWordMap =
        {
            (new(@"(?<!\p{L})(?:proszę|prosze)(?!\p{L})", RegexOptions.IgnoreCase | RegexOptions.Compiled), "будь ласка"),
            (new(@"(?<!\p{L})(?:dziękuję|dziekuje)(?!\p{L})", RegexOptions.IgnoreCase | RegexOptions.Compiled), "дякую"),
            (new(@"(?<!\p{L})(?:dobrze)(?!\p{L})", RegexOptions.IgnoreCase | RegexOptions.Compiled), "добре"),
            (new(@"(?<!\p{L})(?:bardzo)(?!\p{L})", RegexOptions.IgnoreCase | RegexOptions.Compiled), "дуже"),
            (new(@"(?<!\p{L})(?:przepraszam)(?!\p{L})", RegexOptions.IgnoreCase | RegexOptions.Compiled), "вибачте"),
            (new(@"(?<!\p{L})(?:oczywiście|oczywiscie)(?!\p{L})", RegexOptions.IgnoreCase | RegexOptions.Compiled), "звісно"),
            (new(@"(?<!\p{L})(?:jestem)(?!\p{L})", RegexOptions.IgnoreCase | RegexOptions.Compiled), "я є"),
            (new(@"(?<!\p{L})(?:jesteś|jestes)(?!\p{L})", RegexOptions.IgnoreCase | RegexOptions.Compiled), "ти є"),
            (new(@"(?<!\p{L})(?:chcę|chce)(?!\p{L})", RegexOptions.IgnoreCase | RegexOptions.Compiled), "хочу"),
            (new(@"(?<!\p{L})(?:chciałbym|chcialbym)(?!\p{L})", RegexOptions.IgnoreCase | RegexOptions.Compiled), "я хотів би"),
            (new(@"(?<!\p{L})(?:będzie|bedzie)(?!\p{L})", RegexOptions.IgnoreCase | RegexOptions.Compiled), "буде"),
            (new(@"(?<!\p{L})(?:będziemy|bedziemy)(?!\p{L})", RegexOptions.IgnoreCase | RegexOptions.Compiled), "будемо"),
            (new(@"(?<!\p{L})(?:będą|beda)(?!\p{L})", RegexOptions.IgnoreCase | RegexOptions.Compiled), "будуть"),
            (new(@"(?<!\p{L})(?:mamy)(?!\p{L})", RegexOptions.IgnoreCase | RegexOptions.Compiled), "маємо"),
            (new(@"(?<!\p{L})(?:macie)(?!\p{L})", RegexOptions.IgnoreCase | RegexOptions.Compiled), "маєте"),
            (new(@"(?<!\p{L})(?:masz)(?!\p{L})", RegexOptions.IgnoreCase | RegexOptions.Compiled), "маєш"),
            (new(@"(?<!\p{L})(?:człowiek|czlowiek)(?!\p{L})", RegexOptions.IgnoreCase | RegexOptions.Compiled), "людина"),
            (new(@"(?<!\p{L})(?:ludzie)(?!\p{L})", RegexOptions.IgnoreCase | RegexOptions.Compiled), "люди"),
            (new(@"(?<!\p{L})(?:dlaczego)(?!\p{L})", RegexOptions.IgnoreCase | RegexOptions.Compiled), "чому"),
            (new(@"(?<!\p{L})(?:kiedy)(?!\p{L})", RegexOptions.IgnoreCase | RegexOptions.Compiled), "коли"),
            (new(@"(?<!\p{L})(?:gdzie)(?!\p{L})", RegexOptions.IgnoreCase | RegexOptions.Compiled), "де"),
            (new(@"(?<!\p{L})(?:teraz)(?!\p{L})", RegexOptions.IgnoreCase | RegexOptions.Compiled), "зараз"),
            (new(@"(?<!\p{L})(?:wszystko)(?!\p{L})", RegexOptions.IgnoreCase | RegexOptions.Compiled), "все"),
            (new(@"(?<!\p{L})(?:słucham|slucham)(?!\p{L})", RegexOptions.IgnoreCase | RegexOptions.Compiled), "слухаю"),
            (new(@"(?<!\p{L})(?:mówię|mowie)(?!\p{L})", RegexOptions.IgnoreCase | RegexOptions.Compiled), "говорю"),
            (new(@"(?<!\p{L})(?:widzę|widze)(?!\p{L})", RegexOptions.IgnoreCase | RegexOptions.Compiled), "бачу"),
            (new(@"(?<!\p{L})(?:wiem)(?!\p{L})", RegexOptions.IgnoreCase | RegexOptions.Compiled), "знаю"),
            (new(@"(?<!\p{L})(?:pamiętam|pamietam)(?!\p{L})", RegexOptions.IgnoreCase | RegexOptions.Compiled), "пам'ятаю"),
            (new(@"(?<!\p{L})(?:naprawdę|naprawde)(?!\p{L})", RegexOptions.IgnoreCase | RegexOptions.Compiled), "справді"),
            (new(@"(?<!\p{L})(?:życie|zycie)(?!\p{L})", RegexOptions.IgnoreCase | RegexOptions.Compiled), "життя"),
            (new(@"(?<!\p{L})(?:szczęście|szczescie)(?!\p{L})", RegexOptions.IgnoreCase | RegexOptions.Compiled), "щастя"),
            (new(@"(?<!\p{L})(?:dziecko)(?!\p{L})", RegexOptions.IgnoreCase | RegexOptions.Compiled), "дитина"),
            (new(@"(?<!\p{L})(?:dzieci)(?!\p{L})", RegexOptions.IgnoreCase | RegexOptions.Compiled), "діти"),
            (new(@"(?<!\p{L})(?:pieniądze|pieniadze)(?!\p{L})", RegexOptions.IgnoreCase | RegexOptions.Compiled), "гроші"),
            (new(@"(?<!\p{L})(?:pięć|piec)(?!\p{L})", RegexOptions.IgnoreCase | RegexOptions.Compiled), "п'ять"),
            (new(@"(?<!\p{L})(?:sześć|szesc)(?!\p{L})", RegexOptions.IgnoreCase | RegexOptions.Compiled), "шість")
        };

        private static readonly Regex PolishContextParticlesTrigger = new(
            @"(?<!\p{L})(?:się|sie|jest|dla|ale|oraz|tylko|przez|może|moze)(?!\p{L})",
            RegexOptions.IgnoreCase | RegexOptions.Compiled
        );

        private static readonly Regex VocalPausesRegex = new(
            @"(?<!\p{L})(?:[еeє][\-–—][еeє](?:[\-–—][еeє])?|[еeє]{2,}|[аa]{2,}|[мm]{2,}|гм|хм|uhm?|um|er|erm|ah{1,2}|hmm?)(?!\p{L})",
            RegexOptions.IgnoreCase | RegexOptions.Compiled
        );

        private static readonly Regex SingleLetterVocalPauseRegex = new(
            @"(?<!\p{L})[еe](?!\p{L})",
            RegexOptions.IgnoreCase | RegexOptions.Compiled
        );

        private static readonly Regex MultiWordFillersRegex = new(
            @"(?<!\p{L})(?:короче\s+кажучи|коротше\s+кажучи|як\s+би|так\s+би\s+мовити|you\s+know|sort\s+of|kind\s+of)(?!\p{L})",
            RegexOptions.IgnoreCase | RegexOptions.Compiled
        );

        private static readonly Regex SingleWordFillersRegex = new(
            @"(?<!\p{L})(?:ну|типу|короче|коротше|значить)(?!\p{L})",
            RegexOptions.IgnoreCase | RegexOptions.Compiled
        );

        private static readonly Regex IntroOtRegex = new(
            @"(^|[.!?]\s*)(?<!\p{L})от\s+",
            RegexOptions.IgnoreCase | RegexOptions.Compiled
        );

        private static readonly Regex WordStutterRegex = new(
            @"(?<!\p{L})(\p{L}+)(?:[\s,]+\1(?!\p{L}))+",
            RegexOptions.IgnoreCase | RegexOptions.Compiled
        );

        private static readonly Regex HyphenStutterRegex = new(
            @"(?<!\p{L})(\p{L})[\-–—](\p{L}+)(?!\p{L})",
            RegexOptions.IgnoreCase | RegexOptions.Compiled
        );

        private static readonly Regex SentenceRepeatRegex = new(
            @"([^.!?]+[.!?]+)\s*(?:\1\s*)+",
            RegexOptions.IgnoreCase | RegexOptions.Compiled
        );

        private static readonly Regex StripPunctRegex = new(@"[.,!?:;«»""'\-]+", RegexOptions.Compiled);

        public static bool HasPolishIndicators(string? text)
        {
            if (string.IsNullOrWhiteSpace(text)) return false;
            return PolishDiacriticsRegex.IsMatch(text) || PolishIndicatorsRegex.IsMatch(text);
        }

        public static string FilterLanguageLock(string? text, string spokenLanguage = "uk")
        {
            if (string.IsNullOrWhiteSpace(text)) return "";
            if (!string.Equals(spokenLanguage, "uk", StringComparison.OrdinalIgnoreCase))
                return text;

            string filtered = text;

            foreach (var (pattern, replacement) in PolishMultiWordMap)
            {
                filtered = pattern.Replace(filtered, replacement);
            }

            foreach (var (pattern, replacement) in CyrillicPolishMap)
            {
                filtered = pattern.Replace(filtered, replacement);
            }

            foreach (var (pattern, replacement) in PolishSingleWordMap)
            {
                filtered = pattern.Replace(filtered, replacement);
            }

            if (PolishDiacriticsRegex.IsMatch(text) || PolishContextParticlesTrigger.IsMatch(text))
            {
                filtered = Regex.Replace(filtered, @"(?<!\p{L})(?:się|sie)(?!\p{L})", "", RegexOptions.IgnoreCase);
                filtered = Regex.Replace(filtered, @"(?<!\p{L})jest(?!\p{L})", "є", RegexOptions.IgnoreCase);
                filtered = Regex.Replace(filtered, @"(?<!\p{L})co(?!\p{L})", "що", RegexOptions.IgnoreCase);
                filtered = Regex.Replace(filtered, @"(?<!\p{L})jak(?!\p{L})", "як", RegexOptions.IgnoreCase);
                filtered = Regex.Replace(filtered, @"(?<!\p{L})ale(?!\p{L})", "але", RegexOptions.IgnoreCase);
                filtered = Regex.Replace(filtered, @"(?<!\p{L})dla(?!\p{L})", "для", RegexOptions.IgnoreCase);
                filtered = Regex.Replace(filtered, @"(?<!\p{L})przez(?!\p{L})", "через", RegexOptions.IgnoreCase);
                filtered = Regex.Replace(filtered, @"(?<!\p{L})tylko(?!\p{L})", "лише", RegexOptions.IgnoreCase);
                filtered = Regex.Replace(filtered, @"(?<!\p{L})może(?!\p{L})", "може", RegexOptions.IgnoreCase);
                filtered = Regex.Replace(filtered, @"(?<!\p{L})tak(?!\p{L})", "так", RegexOptions.IgnoreCase);
                filtered = Regex.Replace(filtered, @"(?<!\p{L})nie(?!\p{L})", "ні", RegexOptions.IgnoreCase);
            }

            // Remove stray Polish diacritic characters
            filtered = PolishDiacriticsRegex.Replace(filtered, "");

            // Fix non-Ukrainian Cyrillic letters if ASR accidentally emits Russian letters in Ukrainian mode
            filtered = filtered
                .Replace('ы', 'и').Replace('Ы', 'И')
                .Replace('э', 'е').Replace('Э', 'Е')
                .Replace("ъ", "'").Replace("Ъ", "'");

            return Regex.Replace(filtered, @"[ \t]+", " ").Trim();
        }

        public static string CleanSmartPolish(string? text, string spokenLanguage = "uk")
        {
            if (string.IsNullOrWhiteSpace(text)) return "";

            string cleaned = FilterLanguageLock(text, spokenLanguage);

            // 1. Remove vocal pauses (and any immediately attached parenthetical comma)
            cleaned = VocalPausesRegex.Replace(cleaned, "");
            cleaned = SingleLetterVocalPauseRegex.Replace(cleaned, "");

            // 2. Remove multi-word filler phrases
            cleaned = MultiWordFillersRegex.Replace(cleaned, "");

            // English parenthetical "like"
            cleaned = Regex.Replace(cleaned, @"(^|[.!?]\s*)like\s*,\s*", "$1", RegexOptions.IgnoreCase);
            cleaned = Regex.Replace(cleaned, @",\s*like\s*(?=,|[.!?]|\s)", "", RegexOptions.IgnoreCase);
            cleaned = Regex.Replace(cleaned, @"\s+like\s*,\s*", " ", RegexOptions.IgnoreCase);

            // 3. Remove single-word fillers
            cleaned = SingleWordFillersRegex.Replace(cleaned, "");
            cleaned = IntroOtRegex.Replace(cleaned, "$1");

            // Collapse orphan commas left behind by removed parenthetical fillers (e.g. ", , " -> " ")
            cleaned = Regex.Replace(cleaned, @",\s*(?:,\s*)+", " ");

            // 4. Remove word stutters
            cleaned = WordStutterRegex.Replace(cleaned, "$1");
            cleaned = HyphenStutterRegex.Replace(cleaned, m =>
            {
                string p1 = m.Groups[1].Value;
                string p2 = m.Groups[2].Value;
                if (p2.StartsWith(p1, StringComparison.OrdinalIgnoreCase))
                    return p2;
                return m.Value;
            });

            // 5. Deduplicate identical consecutive sentences
            cleaned = SentenceRepeatRegex.Replace(cleaned, "$1 ");

            // 6. Deduplicate repeated multi-word phrases (1 to 6 words)
            var words = cleaned.Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries);
            if (words.Length >= 2)
            {
                var outWords = new List<string>(words.Length);
                int i = 0;
                while (i < words.Length)
                {
                    bool foundRepeat = false;
                    int maxLen = Math.Min(6, (words.Length - i) / 2);
                    for (int len = maxLen; len >= 1; len--)
                    {
                        string phrase1 = Regex.Replace(string.Join(" ", words.Skip(i).Take(len)).ToLowerInvariant(), @"[.,!?:;]+$", "");
                        string phrase2 = Regex.Replace(string.Join(" ", words.Skip(i + len).Take(len)).ToLowerInvariant(), @"[.,!?:;]+$", "");
                        if (!string.IsNullOrEmpty(phrase1) && phrase1 == phrase2)
                        {
                            i += len;
                            foundRepeat = true;
                            break;
                        }
                    }
                    if (!foundRepeat)
                    {
                        outWords.Add(words[i]);
                        i++;
                    }
                }
                cleaned = string.Join(" ", outWords);
            }

            // 7. Punctuation and spacing cleanup
            cleaned = Regex.Replace(cleaned, @"^[,\s;:–—\-]+", "");
            cleaned = Regex.Replace(cleaned, @"\s+([.,!?:;])", "$1");
            cleaned = Regex.Replace(cleaned, @"(?:,\s*){2,}", ", ");
            cleaned = Regex.Replace(cleaned, @",\s*([.!?])", "$1");
            cleaned = Regex.Replace(cleaned, @"([.,!?:;])(?=[\p{L}])", "$1 ");
            cleaned = Regex.Replace(cleaned, @"[ \t]+", " ").Trim();

            // 8. Capitalize first letter of each sentence
            cleaned = Regex.Replace(cleaned, @"(^|[.!?]\s+)([\p{L}])", m =>
            {
                return m.Groups[1].Value + m.Groups[2].Value.ToUpperInvariant();
            });

            return cleaned.Trim();
        }

        public static string ExtractNewSpeech(string? rawStream, string? rawCheckpoint)
        {
            string raw = (rawStream ?? "").Trim();
            string checkpoint = (rawCheckpoint ?? "").Trim();
            if (string.IsNullOrEmpty(checkpoint)) return raw;
            if (string.IsNullOrEmpty(raw)) return "";

            if (raw.StartsWith(checkpoint, StringComparison.OrdinalIgnoreCase))
            {
                string after = raw.Substring(checkpoint.Length);
                if (string.IsNullOrEmpty(after) || char.IsWhiteSpace(after[0]))
                    return after.Trim();
            }

            var checkWords = checkpoint.ToLowerInvariant().Split(' ', StringSplitOptions.RemoveEmptyEntries);
            var rawWords = raw.Split(' ', StringSplitOptions.RemoveEmptyEntries);
            var rawWordsLower = raw.ToLowerInvariant().Split(' ', StringSplitOptions.RemoveEmptyEntries);

            int matchCount = 0;
            int maxCheck = Math.Min(checkWords.Length, rawWords.Length);

            for (int i = 0; i < maxCheck; i++)
            {
                string wCheck = StripPunctRegex.Replace(checkWords[i], "");
                string wRaw = StripPunctRegex.Replace(rawWordsLower[i], "");
                if (wCheck == wRaw || (i == maxCheck - 1 && wRaw.StartsWith(wCheck, StringComparison.Ordinal)))
                {
                    matchCount = i + 1;
                }
                else
                {
                    break;
                }
            }

            if (matchCount >= checkWords.Length)
            {
                return string.Join(" ", rawWords.Skip(matchCount));
            }

            if (checkWords.Length > 0 && rawWords.Length >= checkWords.Length)
            {
                string lastCheckWord = StripPunctRegex.Replace(checkWords[^1], "");
                for (int offset = -2; offset <= 2; offset++)
                {
                    int idx = checkWords.Length - 1 + offset;
                    if (idx >= 0 && idx < rawWordsLower.Length)
                    {
                        string target = StripPunctRegex.Replace(rawWordsLower[idx], "");
                        if (target == lastCheckWord || target.StartsWith(lastCheckWord, StringComparison.Ordinal))
                        {
                            return string.Join(" ", rawWords.Skip(idx + 1));
                        }
                    }
                }
            }

            if (matchCount > 0)
            {
                return string.Join(" ", rawWords.Skip(matchCount));
            }

            if (rawWords.Length <= checkWords.Length)
            {
                return "";
            }

            return string.Join(" ", rawWords.Skip(checkWords.Length));
        }

        public static string StripTailOverlap(string? baseText, string? newSpeech)
        {
            string b = (baseText ?? "").Trim();
            string s = (newSpeech ?? "").Trim();
            if (string.IsNullOrEmpty(b) || string.IsNullOrEmpty(s)) return s;

            var baseWords = b.Split(' ', StringSplitOptions.RemoveEmptyEntries);
            var speechWords = s.Split(' ', StringSplitOptions.RemoveEmptyEntries);
            int maxOverlap = Math.Min(4, Math.Min(baseWords.Length, speechWords.Length));

            for (int len = maxOverlap; len >= 1; len--)
            {
                string baseSuffix = string.Join(" ", baseWords.Skip(baseWords.Length - len)
                    .Select(w => StripPunctRegex.Replace(w.ToLowerInvariant(), "")));
                string speechPrefix = string.Join(" ", speechWords.Take(len)
                    .Select(w => StripPunctRegex.Replace(w.ToLowerInvariant(), "")));

                if (!string.IsNullOrEmpty(baseSuffix) && baseSuffix == speechPrefix)
                {
                    return string.Join(" ", speechWords.Skip(len));
                }
            }

            return s;
        }
    }
}
