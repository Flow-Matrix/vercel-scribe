// Vercel Edge Function to get WebSocket token
// This is the ONLY server-side code needed

export const config = {
  runtime: 'edge',
};

export default async function handler(request) {
  // Get API key from request header
  const apiKey = request.headers.get('x-api-key');
  
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'No API key provided' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  try {
    // Fetch single-use token from ElevenLabs
    const response = await fetch('https://api.elevenlabs.io/v1/single-use-token/realtime_scribe', {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json'
      }
    });
    
    const data = await response.text();
    
    return new Response(data, {
      status: response.status,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
