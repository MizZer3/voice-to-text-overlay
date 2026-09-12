# Voice-to-Text Overlay

> A fast, frameless, always-on-top desktop overlay for real-time voice dictation, smart polish transcription, and live simultaneous translation powered by **Google Gemini Live API**.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform: Windows](https://img.shields.io/badge/Platform-Windows%20x64-0078D6.svg)](https://github.com/MizZer3/voice-to-text-overlay/releases)
[![Gemini Live API](https://img.shields.io/badge/AI-Gemini%203.5%20Live%20API-8E24AA.svg)](https://aistudio.google.com/)
[![Electron](https://img.shields.io/badge/Framework-Electron%2044-47848F.svg)](https://www.electronjs.org/)

---

## 📖 Overview

**Voice-to-Text Overlay** is a floating Windows desktop application engineered for seamless, lightning-fast voice typing. Designed as an unobtrusive frameless overlay, it stays pinned above your active work environment—code editors (VS Code, IntelliJ), web browsers, office suites, or messaging clients (Telegram, Discord, Slack)—enabling hands-free dictation without ever leaving your workflow.

Under the hood, the application leverages Google's state-of-the-art **Gemini Live Multimodal WebSocket API** and high-throughput Flash Lite models for immediate, accurate, and context-aware speech processing.

---

## 🤖 AI Models & Architecture

The application combines low-latency streaming and high-speed translation models to ensure zero lag and minimal token consumption:

1. **`gemini-3.5-transcribe-live` (Streaming Audio-to-Text via WebSocket)**:
   - Connects directly to Google AI Studio's bidirectional WebSocket endpoint:  
     `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent`
   - Streams raw microphone audio as **16-bit PCM at 16 kHz Mono** with sub-second delta transcription.
   - Operates with specialized `inputTranscription` envelopes for continuous, non-intrusive dictation without conversational chatbot interruptions.

2. **`gemini-3.5-flash-lite` (Simultaneous Live Translation Engine)**:
   - Powers the **Live Translate** mode, instantly translating transcribed phrases into 10+ target languages.
   - Operates with an generous quota (**500 Requests Per Day, 15 RPM**).
   - Features automatic failover to **`gemini-3.1-flash-lite`** (also 500 RPD) to guarantee 100% uptime.

---

## 🌟 Core Features

* **🪟 Sleek Floating Frameless Overlay**:
  - Compact standard window (~380x270 px) with an interactive corner resize handle.
  - **Always-on-Top**: Floats above all windows; pin/unpin anytime via the pin button.
  - **Draggable Header**: Drag and position anywhere across multi-monitor setups.
  - **Adjustable Opacity**: Slider allows customizing transparency between 60% and 100% to keep background text visible.
  - **System Tray Mode**: Minimizes cleanly to the Windows taskbar notification tray.

* **🎯 3 Powerful Processing Modes**:
  - ✨ **Smart Polish (Чистовик)**: Intelligently removes filler words (`um`, `uh`, `like`, `е-е-е`, `ну`, `типу`, `короче`, `як би`), eliminates stutters and repetitions, and standardizes punctuation and sentence capitalization while preserving speaker intent.
  - 📝 **Verbatim (Стенограма)**: Produces an exact word-for-word transcript without any cuts, modifications, or omissions.
  - 🌐 **Live Translate (Переклад)**: Live speech-to-text with simultaneous translation into your chosen language (English, Ukrainian, Polish, German, Spanish, French, Italian, Portuguese, Japanese, Chinese).

* **🎙️ Smart Voice Activity Detection (VAD) & Token-Saving Silence Suppression**:
  - Live animated audio waveform reacting to real-time RMS microphone amplitude.
  - Automatically ceases sending empty audio noise during extended silence (with a 700ms hangover buffer to avoid clipping word starts), dramatically reducing token usage.
  - Auto-finalizes phrases upon silence timeouts.

* **⌨️ Global System-Wide Hotkeys**:
  - **`Alt + Space`**: Instantly show or hide the overlay window from any active app.
  - **`Ctrl + Shift + R`**: Toggle audio recording on/off in the background without needing to click the widget.
  - Both shortcuts can be customized in Settings.

* **⚡ Direct Typing / Auto-Paste into External Apps**:
  - Automatically types or pastes dictated and polished text directly into active windows (Discord, Telegram, Slack, Word, browsers, code editors) via native Win32 `keybd_event` (<kbd>Ctrl+V</kbd>).
  - Dictate seamlessly without ever switching windows or pressing manual copy/paste buttons.
  - Quick toggle button **`[✓ Вставка]`** right on the action bar and in Settings.

* **📋 Seamless Auto-Copy & Non-Destructive Manual Edits**:
  - **Auto-Copy to Clipboard**: Copies finished text to your clipboard automatically upon stopping recording or when a silence timeout occurs.
  - **Non-Destructive Manual Editing**: Freely type, edit typos, or insert punctuation inside the transcription box during or between recording sessions. Newly spoken words seamlessly append without resurrecting or duplicating previously spoken phrases.

* **🎛️ Dual Recording Behavior**:
  - **Toggle Mode**: Click once to record, click again to stop.
  - **Push-to-Talk (PTT)**: Hold the mouse button or Spacebar to dictate, release to finish.

---

## 🚀 Installation & Usage

### Method 1: Download Pre-Compiled App (Recommended for Users)

1. Open the [Releases](https://github.com/MizZer3/voice-to-text-overlay/releases) page.
2. Download the latest **`Gemini-Live-Windows-x64.zip`**.
3. Extract the ZIP folder anywhere on your computer.
4. Launch **`Gemini Live.exe`**.
5. Click the **Gear (⚙️)** icon, paste your free API key from [Google AI Studio](https://aistudio.google.com/), and click **Save**!

### Method 2: Build & Run from Source (For Developers)

#### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher)
- npm

```bash
# 1. Clone the repository
git clone https://github.com/MizZer3/voice-to-text-overlay.git
cd voice-to-text-overlay

# 2. Install dependencies
npm install

# 3. Launch in development mode
npm start
```

#### Run Automated Test Suite
The project contains 82 comprehensive automated unit and integration tests:
```bash
npm test
```

#### Package into Standalone Executable
```bash
npm run build:exe
```
This builds an optimized standalone package in `dist/Gemini Live-win32-x64/` and a native Windows launcher in `Gemini Live.exe`.

---

## ⚙️ Settings Reference

| Option | Description | Default |
| :--- | :--- | :--- |
| **API Key** | Your Google AI Studio API Key | Required |
| **Active Mode** | Smart Polish / Verbatim / Live Translate | `Smart Polish` |
| **Target Language** | Language for Live Translate mode | `English` |
| **Recording Behavior** | Toggle mode vs. Push-to-Talk | `Toggle` |
| **Auto-Copy** | Automatically copies transcription to clipboard upon pause/stop | `Enabled` |
| **Always on Top** | Keeps the window floating above all other windows | `Enabled` |
| **VAD Threshold** | Microphone sensitivity threshold for voice detection | `0.018` |
| **Silence Timeout** | Duration of silence before automatically ending speech turn | `1.8s` |
| **Global Toggle Hotkey** | Shortcut to summon or hide widget | `Alt+Space` |
| **Record Hotkey** | Shortcut to start/stop dictation | `Ctrl+Shift+R` |
| **Window Opacity** | Adjust transparency level of the floating overlay | `98%` |

---

## 📂 Project Structure

```
voice-to-text-overlay/
├── src/
│   ├── app.js                 # UI controller, event listeners, state management
│   ├── gemini-live-client.js  # Bidirectional WebSocket client for Gemini Live API
│   ├── audio-processor.js     # Web Audio API, PCM downsampler, RMS & VAD suppression
│   ├── text-cleaner.js        # Speech filler removal, deduplication, stream alignment
│   ├── fast-translator.js     # Simultaneous translator using gemini-3.5-flash-lite
│   ├── prompts.js             # System instructions and prompt templates
│   ├── storage.js             # Local settings persistence & migrations
│   ├── index.html             # Frameless overlay HTML layout
│   └── style.css              # Dark theme styling, glassmorphism, animations
├── main.js                    # Electron main process (IPC, global shortcuts, tray)
├── preload.js                 # Electron secure context isolation bridge
├── scripts/
│   ├── build-exe.js           # Automated packaging & native C# launcher compiler
│   └── generate-icons.js      # Icon asset generation
├── test/                      # 79 automated unit, integration, and E2E simulation tests
├── package.json               # Project manifest and scripts
└── .gitignore                 # Excludes node_modules, binaries, and build artifacts
```

---

## 📄 License

This project is open-source and licensed under the [MIT License](LICENSE).
