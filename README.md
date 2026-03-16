# 🎙️ Vercel Scribe - Speech-to-Text

A pure client-side speech-to-text app using ElevenLabs Scribe V2.

## Features

- 🎤 Record audio directly in browser
- ⚡ Real-time transcription (WebSocket with VAD)
- 📦 Batch transcription (fallback)
- 📜 Recording history (saved to IndexedDB)
- 🔑 User-provided API key (no server secrets)

## Deploy to Vercel

### Option 1: GitHub (Recommended)

1. Push this folder to a GitHub repository
2. Go to [vercel.com](https://vercel.com)
3. Click "Add New Project"
4. Import your GitHub repository
5. Click "Deploy"

### Option 2: Drag and Drop

1. Run `npm run build` locally
2. Go to [vercel.com](https://vercel.com)
3. Drag the `dist` folder to deploy

## Local Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build
```

## Project Structure

```
vercel-scribe/
├── api/
│   └── token.js        # Vercel Edge Function (WebSocket token)
├── src/
│   ├── app.js          # Main application logic
│   ├── batch.js        # Batch API transcription
│   ├── main.js         # Entry point
│   ├── storage.js      # IndexedDB persistence
│   └── styles.css      # Styling
├── index.html          # Main HTML
├── package.json        # Dependencies
├── vercel.json         # Vercel configuration
└── vite.config.js      # Vite configuration
```

## How It Works

1. User enters their ElevenLabs API key
2. Key is stored in browser localStorage
3. When recording:
   - **Batch Mode**: Audio sent directly to ElevenLabs batch API
   - **Real-time Mode**: Token fetched from Edge Function, then WebSocket connection made
4. Transcriptions saved to IndexedDB for history

## Security Note

The API key is provided by the user in the UI. It's stored in localStorage and only sent to:
- ElevenLabs API (batch transcription)
- Vercel Edge Function -> ElevenLabs (token fetch)

The Edge Function acts as a minimal proxy to fetch WebSocket tokens since browsers can't set custom headers on WebSocket connections.
