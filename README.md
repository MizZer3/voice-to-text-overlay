# VoxFlow — AI Voice-to-Text & Live Translation Desktop Overlay (C# / .NET 8 WPF)

[**🇺🇦 Українська версія**](#-voxflow--нативний-ші-асистент-голосового-вводу-та-перекладу-c--net-8-wpf) | [**🇬🇧 English Version**](#-english-description)

---

## 🇺🇦 VoxFlow — Нативний ШІ-асистент голосового вводу та перекладу (C# / .NET 8 WPF)

**VoxFlow** — надлегкий нативний десктопний додаток-оверлей для Windows (написаний з нуля на **C# / .NET 8 WPF + Win32 API** без Electron/Chromium), який перетворює ваше мовлення на чистий текст наживо за допомогою **Google Gemini Live API (`gemini-3.5-transcribe-live`)** та миттєво вставляє його у будь-яку програму (Discord, Telegram, браузер, IDE, документи чи ігри).

### 🚀 Головні переваги версії 2.0:
- **Мінімальне споживання ресурсів**: Повна відмова від Electron (Chromium). Замість ~300 МБ оперативної пам'яті та ~245 МБ на диску нативний додаток займає лічені мегабайти (~330 КБ) та споживає у 6–8 разів менше ОЗП.
- **Плаваючий візуальний індикатор у стилі Whisper (HUD Pill)**: Компактна напівпрозора капсула внизу екрана з живою 8-смуговою звуковою хвилею, прев'ю слів та таймером запису, яка ніколи не перехоплює фокус клавіатури (`WS_EX_NOACTIVATE`).
- **Надійна Автовставка (`Direct Paste`)**:
  - Автоматично відстежує останнє активне зовнішнє вікно (`Discord`, `Telegram`, браузер тощо) та показує поточну ціль (`↳ Discord`).
  - Якщо ви натиснули кнопку «Стоп» мишкою у вікні `VoxFlow`, додаток сам повертає фокус у цільове поле вводу (`AttachThreadInput` + `SetForegroundWindow`), програмно відпускає затиснуті клавіші-модифікатори (`Shift`, `Alt`, `Ctrl`, `Win`) і виконує чистий `Ctrl+V` через Win32 `SendInput`.
- **Вільні хоткеї та підтримка `Ctrl + Alt` (як у Whisper)**:
  - Низькорівневий хук `WH_KEYBOARD_LL` працює з фізичними віртуальними кодами клавіш, стабільно на будь-якій розкладці (`УКР` / `ENG`).
  - Підтримка режимів **Toggle** (натиснути Старт / Стоп) та **Push-to-Talk** (утримувати клавішу під час мовлення).
  - Панель швидкого вибору хоткеїв у налаштуваннях в один клік (`Ctrl+Alt`, `Ctrl+Win`, `RightAlt`, `F8`).
- **Покращене сприйняття української мови (`Voice Boost` + Мовний замок)**:
  - Вбудований DSP-препроцесор звуку: фільтр низьких частот **High-Pass 85 Гц** (прибирає гул мікрофона та дихання), налаштовуваний передпідсилювач (**Pre-Amp 100%–600%**), динамічна авто-нормалізація гучності (**Soft AGC до 10x**) для розпізнавання голосу на відстані та **Pre-Roll буфер (400 мс)**.
  - Жорстке блокування польської та російської мов у системному промпті та клієнтському фільтрі `FilterLanguageLock`.
- **Зручні вкладки Налаштувань**: Вікно автоматично розширюється при відкритті налаштувань і поділене на 3 логічні вкладки (`⚙️ Загальні`, `⌨️ Хоткеї та Вставка`, `🎙️ Аудіо та ШІ`) із живою шкалою перевірки мікрофона `🎤 Перевірити`.

---

## 🇬🇧 English Description

**VoxFlow** is an ultra-lightweight, native Windows desktop voice-to-text overlay built from scratch in **C# / .NET 8 (WPF + Win32 API)**, completely eliminating Electron & Chromium. It streams microphone audio directly to **Google Gemini Live API (`gemini-3.5-transcribe-live`)** in real time and automatically types/pastes the transcribed or translated text into any active application (Discord, Telegram, web browsers, IDEs, documents, or games).

### 🚀 Key Features:
- **Ultra-lightweight & Native**: Replaced heavy Electron (~245 MB on disk, ~300 MB RAM) with a tiny native C# app (~330 KB total size) consuming minimal RAM and zero idle CPU.
- **Whisper-Style Floating HUD Pill**: A sleek, translucent pill at the bottom-center of the screen featuring a live 8-band audio spectrum visualizer, real-time word preview, and quick-stop controls. Uses `WS_EX_NOACTIVATE` so it never steals keyboard focus from active games or chat apps.
- **Rock-Solid Direct Auto-Paste**:
  - Automatically tracks the target external window (`↳ Discord`, `↳ Telegram`) and restores focus smoothly.
  - Forcibly releases modifier keys (`Shift`, `Alt`, `Ctrl`, `Win`) before firing `Ctrl+V` so holding down hotkeys never breaks text insertion.
  - Supports both instant paste on pause and full transcript paste upon stopping recording.
- **Unoccupied Hotkeys & Whisper-style `Ctrl + Alt` Support**:
  - Built on a low-level Win32 keyboard hook (`WH_KEYBOARD_LL`) using physical Virtual Keys, working consistently across all keyboard layouts (UKR / ENG / etc.).
  - Supports modifier chords (`Ctrl+Alt`, `Ctrl+Win`), single keys (`RightAlt`, `F8`), and both Toggle & Push-to-Talk modes.
  - Quick-preset selector buttons in settings for instant 1-click configuration.
- **Audio Preprocessing & Sensitivity Boost**:
  - Built-in DSP pipeline: 85Hz High-Pass filter (eliminates mic rumble/breathing), adjustable microphone pre-amp (100% to 600%), and dynamic Soft AGC for crystal-clear voice recognition at a comfortable distance.
  - Strict language lock preventing foreign hallucinations when speaking Ukrainian.
- **Spacious Tabbed Settings**:
  - The window automatically expands when opening Settings, cleanly organized into 3 tabs (`General`, `Hotkeys & Auto-Paste`, `Audio & AI`).
  - Includes a live microphone level test meter (`🎤 Test`) directly in settings.

---

## 📦 Запуск та збірка / Download & Run

### Готовий виконуваний файл / Prebuilt Executable
- Завантажте готовий портативний архів: **[VoxFlow-v2.0.0-win-x64.zip](https://github.com/MizZer3/voice-to-text-overlay/releases/download/v2.0.0/VoxFlow-v2.0.0-win-x64.zip)**
- Або запустіть **`VoxFlow.exe`** чи ярлик **`VoxFlow.lnk`** безпосередньо у папці проєкту.

### Збірка з вихідного коду / Build from Source (.NET 8+ SDK)
```powershell
dotnet build VoxFlow/VoxFlow.csproj -c Release
```

### Запуск автоматичних тестів / Automated Tests
```powershell
dotnet ./VoxFlow/bin/Release/net8.0-windows/VoxFlow.dll --self-test
```
