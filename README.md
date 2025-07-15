# MeetScript  
A powerful Chrome Extension :contentReference[oaicite:0]{index=0}

MeetScript lets you capture tab + mic audio, transcribe it via OpenAI Whisper, and generate professional meeting minutes with GPT-4o.

---

## Features
- **Audio Capture**: Record your current tab and microphone simultaneously. :contentReference[oaicite:1]{index=1}  
- **Multiple Formats**: Save as `.mp3` or `.wav`; choose MP3 bitrate (96 kbps / 192 kbps / 320 kbps). :contentReference[oaicite:2]{index=2}  
- **Time Limits**: Set 1–20 min capture or remove the limit entirely. :contentReference[oaicite:3]{index=3}  
- **Tab Muting**: Mute the recorded tab during capture. :contentReference[oaicite:4]{index=4}  
- **Transcription**: Uses OpenAI Whisper (`whisper-1`)—requires your API key. :contentReference[oaicite:5]{index=5}  
- **Meeting Minutes**: Auto-generate structured minutes (summary, key points, action items, decisions, attendees) via GPT-4o. :contentReference[oaicite:6]{index=6}  
- **Keyboard Shortcuts**:  
  - **Start**: Ctrl + Shift + S (Win/Linux) / ⌘ + Shift + U (macOS)  
  - **Stop**: Ctrl + Shift + X (Win/Linux) / MacCtrl + Shift + X (macOS) :contentReference[oaicite:7]{index=7}  
- **Error Handling**: If capture is blocked (e.g. YouTube), shows an error page. :contentReference[oaicite:8]{index=8}  

---

## Installation
1. **Clone** or download this repo.  
2. Open `chrome://extensions` in Chrome.  
3. **Enable Developer mode**.  
4. Click **Load unpacked** and select this folder.

---

## Usage
1. Click the **MeetScript** toolbar icon. :contentReference[oaicite:9]{index=9}  
2. Press **Start Capture** or use the shortcut.  
3. Press **Stop Capture** or use the shortcut again.  
4. In the popup, click **Transcribe Audio** to send to OpenAI.  
5. Click **Generate Meeting Minutes** to download a `.docx` file.

---

## Options  
(Chrome toolbar ▸ **Options**) :contentReference[oaicite:10]{index=10}  
- **Mute tabs** during recording  
- **Maximum capture time**: 1–20 min  
- **Remove time limit**  
- **Output format**: `.mp3` / `.wav`  
- **MP3 Quality**: Low (96 kbps), Medium (192 kbps), High (320 kbps)  
- **OpenAI API Key** (for transcription & minutes)

---

## File Structure
- `manifest.json` (name, version, permissions) :contentReference[oaicite:11]{index=11}  
- **Popup UI**:  
  - `popup.html`, `popup.js`, `popup.css`   
- **Completion UI**:  
  - `complete.html`, `complete.js`, `complete.css`   
- **Options**:  
  - `options.html`, `options.js`, `options.css`   
- **Error Page**:  
  - `error.html`, `error.css`   
- **Background Logic**:  
  - `background.js` :contentReference[oaicite:12]{index=12}  
- **Audio Worker**:  
  - `worker.js` :contentReference[oaicite:13]{index=13}  
- Version control:  
  - `.gitattributes` :contentReference[oaicite:14]{index=14}  

---

## Permissions
- `tabCapture`, `downloads`, `storage`  
- Access to `https://api.openai.com/*` :contentReference[oaicite:15]{index=15}  

---

## License
None at the moment  
