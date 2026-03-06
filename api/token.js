// api/token.js — DEPRECATED
// This Vercel Edge Function is no longer needed.
// The Gemini API is called directly from the browser using the user-provided API key.
// ElevenLabs WebSocket token proxying has been removed.

export const config = { runtime: 'edge' };

export default async function handler(request) {
  return new Response(JSON.stringify({ message: 'This endpoint is no longer used. Gemini API is called directly from the browser.' }), {
    status: 410,
    headers: { 'Content-Type': 'application/json' }
  });
}
