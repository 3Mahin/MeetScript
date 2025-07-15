# MeetScript

**MeetScript** is a robust, user-friendly Chrome extension that enables seamless tab and microphone audio capture, high-accuracy transcription via OpenAI Whisper, and automated generation of professional meeting minutes using GPT-4o.

---

## Table of Contents

1. [Key Features](#key-features)
2. [Installation](#installation)
3. [Usage](#usage)
4. [Configuration](#configuration)
5. [Project Structure](#project-structure)
6. [Permissions](#permissions)
7. [Contributing](#contributing)
8. [License](#license)

---

## Key Features

- **Simultaneous Audio Capture**\
  Record both your active browser tab and microphone in real time.

- **Multiple Export Formats**\
  Save recordings as MP3 or WAV, with adjustable MP3 bitrates (96, 192, or 320 kbps).

- **Customizable Time Limits**\
  Define capture durations from 1 to 20 minutes, or disable the time limit altogether.

- **Tab Muting**\
  Automatically mute the source tab during recording to avoid feedback loops.

- **High-Quality Transcription**\
  Transcribe audio with OpenAI Whisper (`whisper-1`). Requires your OpenAI API key.

- **Automated Meeting Minutes**\
  Generate structured meeting minutes (summary, key points, action items, decisions, attendees) using GPT-4o.

- **Keyboard Shortcuts**

  - **Start Recording:** `Ctrl + Shift + S` (Win/Linux) / `⌘ + Shift + U` (macOS)
  - **Stop Recording:** `Ctrl + Shift + X` (Win/Linux) / `⌘ + Shift + X` (macOS)

- **Error Handling**\
  Displays a custom error page if tab capture is blocked (e.g., on certain media sites).

---

## Installation

1. Clone or download the repository:
   ```bash
   git clone https://github.com/your-org/meetscript.git
   ```
2. Open Chrome and navigate to `chrome://extensions`.
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked**, then select the cloned folder.
5. Pin the **MeetScript** icon to your toolbar for easy access.

---

## Usage

1. Click the **MeetScript** icon in your Chrome toolbar.
2. Click **Start Recording** or use the keyboard shortcut.
3. When finished, click **Stop Recording** or use the keyboard shortcut.
4. In the popup:
   - Click **Transcribe Audio** to generate a transcript.
   - Click **Generate Meeting Minutes** to download a `.docx` file of your minutes.

---

## Configuration

Access the extension options via Chrome toolbar ▸ **Options**.

- **Mute tabs**: Enable or disable tab muting during recording.
- **Capture duration**: Set a maximum recording time (1–20 minutes) or disable the limit.
- **Output format**: Select between MP3 and WAV.
- **MP3 quality**: Choose Low (96 kbps), Medium (192 kbps), or High (320 kbps).
- **OpenAI API Key**: Enter your API key for transcription and minute generation.

---

## Project Structure

```
meetscript/
├─ manifest.json          # Extension metadata and permissions
├─ background.js          # Background script for tab capture
├─ worker.js              # Audio processing worker
├─ popup/
│  ├─ popup.html
│  ├─ popup.js
│  └─ popup.css           # Main recording UI
├─ complete/
│  ├─ complete.html
│  ├─ complete.js
│  └─ complete.css        # Transcript & minutes UI
├─ options/
│  ├─ options.html
│  ├─ options.js
│  └─ options.css         # Configuration page
└─ error/
   ├─ error.html
   └─ error.css           # Custom error handling page
```

---

## Permissions

- **tabCapture**: Capture audio from the active tab.
- **downloads**: Save recordings and documents.
- **storage**: Store user preferences (e.g., API key, settings).
- [**https://api.openai.com/**](https://api.openai.com/): Access OpenAI endpoints for transcription and content generation.

---

## Contributing

We welcome contributions! To propose bug fixes or enhancements:

1. Fork the repository.
2. Create a feature branch (`git checkout -b feature/YourFeature`).
3. Commit your changes (`git commit -m "Add Your Feature"`).
4. Push to your fork (`git push origin feature/YourFeature`).
5. Open a pull request describing your changes.

Please ensure all new features include appropriate tests and documentation updates.

---

## License

This project is currently unlicensed. To apply a license, add your preferred license file (e.g., `LICENSE.md`) to the root directory.

