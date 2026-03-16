# 🎙️ FlashScribe Web - Speech-to-Text (Gemini Edition)

A pure client-side speech-to-text app using Google Gemini.

## Features

- 🎤 Record audio directly in browser
- 🤖 AI-powered transcription with Gemini
- 🔄 Smart model rotation and degradation fallback
- 📜 Recording history (saved to IndexedDB)
- 🔑 User-provided API key or secret passcode unlock

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
