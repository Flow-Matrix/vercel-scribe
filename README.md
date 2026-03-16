# 🎙️ FlashScribe Web - Speech-to-Text (Gemini Edition)

A pure client-side speech-to-text app using Google Gemini.

## ✨ Features

- 🎤 Record audio directly in browser
- 🤖 AI-powered transcription with Gemini
- 🔄 Smart model rotation and degradation fallback
- 📜 Recording history (saved to IndexedDB)
- 🔑 User-provided API key or secret passcode unlock

## 🚀 Deploy to Vercel

This is a standard Vite project. You can deploy it to Vercel with zero configuration:

1. Push this repository to GitHub.
2. Import the project into [Vercel](https://vercel.com).
3. Vercel will automatically detect Vite and use `npm run build` as the build command and `dist` as the output directory.

## 🛠️ Local Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build
```

## 📂 Project Structure

```
vercel-scribe/
├── api/
│   └── token.js        # Vercel Edge Function (Legacy/Optional)
├── src/
│   ├── app.js          # Main application logic
│   ├── gemini.js       # Gemini transcription engine
│   ├── main.js         # Entry point
│   ├── pill.js         # UI component for recording
│   ├── storage.js      # IndexedDB persistence
│   └── styles.css      # Styling
├── index.html          # Main HTML
├── package.json        # Dependencies
├── vercel.json         # Vercel configuration
└── vite.config.js      # Vite configuration
│   ├── app.js          # UI Logic & State Management
│   ├── gemini.js       # Transcription Engine & Vertex AI Auth
│   ├── pill.js         # Canvas-based Audio Visualizer
│   ├── storage.js      # IndexedDB Persistence
│   ├── styles.css      # Multi-theme CSS
│   └── main.js         # Entry point
├── index.html          # Main application shell
├── package.json        # Dependencies & Scripts
└── vite.config.js      # Vite Configuration
```

## How It Works

1. User enters their Gemini API key or a secret passcode
2. Keys are stored in browser localStorage
3. When recording or uploading:
   - Audio is sent to the Gemini API for transcription
   - The app uses smart rotation if multiple keys are provided
   - If a model fails, it automatically falls back to other available models
4. Transcriptions are saved to IndexedDB for history

## Security Note

The API key is provided by the user in the UI. It's stored in localStorage and only sent to:
- Google Gemini API (transcription)
## 🔒 Security Note

Authentication credentials (API Keys or Service Account JSONs) are provided by the user and stored in `localStorage`. They are only sent directly to Google's API endpoints (`generativelanguage.googleapis.com` or `aiplatform.googleapis.com`). No backend server is involved in the transcription flow.
