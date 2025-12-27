// Batch API transcription (direct to ElevenLabs)
import { log } from './app.js';

export async function transcribeBatch(blob, apiKey, language) {
    log('📦 Using Batch API...', 'info');
    
    const formData = new FormData();
    formData.append('file', blob, 'recording.wav');
    formData.append('model_id', 'scribe_v2');
    if (language && language !== 'auto') {
        formData.append('language_code', language);
    }
    
    try {
        const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
            method: 'POST',
            headers: {
                'xi-api-key': apiKey
            },
            body: formData
        });
        
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`API Error: ${response.status} - ${error}`);
        }
        
        const data = await response.json();
        log('✅ Batch transcription complete!', 'success');
        
        return {
            text: data.text || '',
            method: 'batch'
        };
    } catch (error) {
        log(`❌ Batch API error: ${error.message}`, 'error');
        throw error;
    }
}
