# 🎙️ Scribe - Speech-to-Text (Gemini & Vertex AI Edition)

A pure client-side speech-to-text application powered by Google Gemini. Optimized for multilingual transcription (Hinglish/Hindi/English) and technical accuracy.

## ✨ Features

- 🎤 **Live Recording**: Record audio directly in the browser with real-time frequency visualization.
- 📁 **File Upload**: Support for MP3, WAV, FLAC, OGG, OPUS, M4A, AAC, and more.
- 🤖 **Gemini Integration**: Supports AI Studio (API Key) and Vertex AI (Service Account).
- 🧠 **Thinking Support**: Adjustable "Thinking Budget" for Gemini 2.0 Thinking models.
- 🌍 **Multilingual**: Specialized system prompt for translating Hinglish/Hindi to clean English while preserving technical entities.
- 🎨 **Multi-Theme**: Dark, Light, and Pastel themes with high-contrast accessibility.
- 📜 **Local History**: Recording history and audio blobs are saved securely to IndexedDB.
- 🔐 **Privacy First**: All processing is client-side. Service Account JSONs and API keys are stored only in your browser's `localStorage`.

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
scribe/
├── src/
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

## 🔒 Security Note

Authentication credentials (API Keys or Service Account JSONs) are provided by the user and stored in `localStorage`. They are only sent directly to Google's API endpoints (`generativelanguage.googleapis.com` or `aiplatform.googleapis.com`). No backend server is involved in the transcription flow.
