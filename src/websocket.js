// WebSocket real-time transcription
import { log } from './app.js';

export async function transcribeRealtime(blob, apiKey, language, onPartial, onCommit) {
    log('⚡ Starting real-time transcription...', 'info');
    
    // Step 1: Get single-use token from Edge Function
    log('⚡ Fetching WebSocket token...', 'info');
    let token;
    
    try {
        const tokenRes = await fetch('/api/token', {
            method: 'POST',
            headers: { 'x-api-key': apiKey }
        });
        
        const tokenData = await tokenRes.json();
        
        if (tokenData.error) {
            throw new Error(tokenData.error);
        }
        
        token = tokenData.token;
        if (!token) {
            throw new Error('No token received from server');
        }
        
        log('⚡ Token obtained!', 'success');
    } catch (error) {
        log(`❌ Token fetch failed: ${error.message}`, 'error');
        throw new Error(`Token fetch failed: ${error.message}`);
    }
    
    // Step 2: Build WebSocket URL
    const wsParams = new URLSearchParams({
        model_id: 'scribe_v2_realtime',
        token: token,
        audio_format: 'pcm_16000',
        commit_strategy: 'vad',
        vad_threshold: '0.3',
        vad_silence_threshold_secs: '1.5'
    });
    
    if (language && language !== 'auto') {
        wsParams.set('language_code', language);
    }
    
    const wsUrl = `wss://api.elevenlabs.io/v1/speech-to-text/realtime?${wsParams.toString()}`;
    
    // Step 3: Connect and transcribe
    return new Promise((resolve, reject) => {
        log('⚡ Connecting to WebSocket...', 'info');
        
        const ws = new WebSocket(wsUrl);
        let fullTranscript = '';
        let audioDataReady = null;
        
        // Prepare audio immediately
        prepareAudio(blob).then(pcm => { audioDataReady = pcm; });
        
        ws.onopen = () => {
            log('⚡ Connected, waiting for session...', 'success');
        };
        
        ws.onmessage = async (event) => {
            try {
                const data = JSON.parse(event.data);
                
                if (data.message_type === 'session_started') {
                    log('⚡ Session started, sending audio...', 'success');
                    
                    // Wait for audio to be ready
                    while (!audioDataReady) {
                        await new Promise(r => setTimeout(r, 50));
                    }
                    
                    await sendAudio(ws, audioDataReady, log);
                }
                else if (data.message_type === 'partial_transcript') {
                    if (onPartial) onPartial(data.text);
                }
                else if (data.message_type === 'committed_transcript') {
                    fullTranscript += (fullTranscript ? ' ' : '') + data.text;
                    log(`📝 Committed: "${data.text}"`, 'success');
                    if (onCommit) onCommit(fullTranscript);
                }
                else if (data.message_type === 'input_error') {
                    log(`❌ Server error: ${data.error}`, 'error');
                    reject(new Error(data.error));
                    ws.close();
                }
            } catch (e) {
                console.warn('Failed to parse message:', e);
            }
        };
        
        ws.onerror = (error) => {
            log('❌ WebSocket error', 'error');
            reject(new Error('WebSocket connection failed'));
        };
        
        ws.onclose = (event) => {
            log(`⚡ WebSocket closed (code: ${event.code})`, 'info');
            
            if (fullTranscript) {
                resolve({ text: fullTranscript, method: 'websocket' });
            } else if (event.code === 1000) {
                reject(new Error('No speech detected'));
            } else {
                reject(new Error(`Connection closed: ${event.code}`));
            }
        };
    });
}

async function prepareAudio(blob) {
    const arrayBuffer = await blob.arrayBuffer();
    const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    // Convert to PCM 16-bit
    const channelData = audioBuffer.getChannelData(0);
    const pcm16 = new Int16Array(channelData.length);
    
    for (let i = 0; i < channelData.length; i++) {
        pcm16[i] = Math.max(-32768, Math.min(32767, channelData[i] * 32768));
    }
    
    return pcm16;
}

async function sendAudio(ws, pcm16, log) {
    const chunkSize = 8000; // 0.5s at 16kHz
    
    for (let i = 0; i < pcm16.length; i += chunkSize) {
        if (ws.readyState !== WebSocket.OPEN) break;
        
        const chunk = pcm16.slice(i, i + chunkSize);
        const uint8 = new Uint8Array(chunk.buffer);
        
        let binary = '';
        for (let j = 0; j < uint8.length; j++) {
            binary += String.fromCharCode(uint8[j]);
        }
        
        ws.send(JSON.stringify({
            message_type: 'input_audio_chunk',
            audio_base_64: btoa(binary),
            commit: false,
            sample_rate: 16000
        }));
        
        await new Promise(r => setTimeout(r, 30));
    }
    
    // Send commit
    log('⚡ Audio sent, committing...', 'info');
    ws.send(JSON.stringify({
        message_type: 'input_audio_chunk',
        audio_base_64: '',
        commit: true,
        sample_rate: 16000
    }));
    
    // Auto-close after timeout
    setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.close();
        }
    }, 15000);
}
