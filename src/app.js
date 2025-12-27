// Main application logic
import { initDB, saveRecording, loadRecordings, updateRecordingText } from './storage.js';
import { transcribeBatch } from './batch.js';
import { transcribeRealtime } from './websocket.js';

// State
let mediaRecorder = null;
let isRecording = false;
let recordings = [];
let useRealtime = false;

// DOM Elements
let elements = {};

// Initialize app
export function initApp() {
    cacheElements();
    setupEventListeners();
    loadState();
    log('Page loaded. Enter your API key to start.', 'info');
}

function cacheElements() {
    elements = {
        apiKeyInput: document.getElementById('apiKeyInput'),
        saveKeyBtn: document.getElementById('saveKeyBtn'),
        keyStatus: document.getElementById('keyStatus'),
        settingsSection: document.getElementById('settingsSection'),
        languageSelect: document.getElementById('languageSelect'),
        batchModeBtn: document.getElementById('batchModeBtn'),
        realtimeModeBtn: document.getElementById('realtimeModeBtn'),
        realtimeInfo: document.getElementById('realtimeInfo'),
        recorderSection: document.getElementById('recorderSection'),
        recordBtn: document.getElementById('recordBtn'),
        recordStatus: document.getElementById('recordStatus'),
        outputSection: document.getElementById('outputSection'),
        outputText: document.getElementById('outputText'),
        copyBtn: document.getElementById('copyBtn'),
        historySection: document.getElementById('historySection'),
        historyList: document.getElementById('historyList'),
        logOutput: document.getElementById('logOutput'),
        toast: document.getElementById('toast')
    };
}

function setupEventListeners() {
    // API Key
    elements.saveKeyBtn.addEventListener('click', saveApiKey);
    elements.apiKeyInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') saveApiKey();
    });
    
    // Mode toggles
    elements.batchModeBtn.addEventListener('click', () => setMode(false));
    elements.realtimeModeBtn.addEventListener('click', () => setMode(true));
    
    // Recording
    elements.recordBtn.addEventListener('click', toggleRecording);
    
    // Copy
    elements.copyBtn.addEventListener('click', copyOutput);
}

async function loadState() {
    // Load API key
    const savedKey = localStorage.getItem('scribeApiKey');
    if (savedKey) {
        elements.apiKeyInput.value = savedKey;
        showAuthenticatedUI();
    }
    
    // Load recordings from IndexedDB
    try {
        await initDB();
        recordings = await loadRecordings();
        if (recordings.length > 0) {
            renderHistory();
            elements.historySection.style.display = 'block';
            log(`📂 Loaded ${recordings.length} saved recording(s)`, 'success');
        }
    } catch (e) {
        log(`⚠️ Could not load saved recordings: ${e.message}`, 'warn');
    }
}

function saveApiKey() {
    const key = elements.apiKeyInput.value.trim();
    
    if (!key) {
        elements.keyStatus.textContent = '❌ Please enter an API key';
        elements.keyStatus.className = 'status error';
        return;
    }
    
    localStorage.setItem('scribeApiKey', key);
    elements.keyStatus.textContent = '✅ API key saved!';
    elements.keyStatus.className = 'status success';
    showAuthenticatedUI();
    log('API key saved', 'success');
}

function showAuthenticatedUI() {
    elements.settingsSection.style.display = 'block';
    elements.recorderSection.style.display = 'block';
    elements.historySection.style.display = 'block';
}

function setMode(realtime) {
    useRealtime = realtime;
    
    elements.batchModeBtn.classList.toggle('active', !realtime);
    elements.realtimeModeBtn.classList.toggle('active', realtime);
    elements.realtimeInfo.style.display = realtime ? 'block' : 'none';
    
    log(realtime ? '⚡ Real-time mode enabled' : '📦 Batch mode enabled', 'info');
}

async function toggleRecording() {
    if (!isRecording) {
        // Start recording
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const chunks = [];
            
            mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            
            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunks.push(e.data);
            };
            
            mediaRecorder.onstop = async () => {
                const webmBlob = new Blob(chunks, { type: 'audio/webm' });
                stream.getTracks().forEach(t => t.stop());
                await processRecording(webmBlob);
            };
            
            mediaRecorder.start();
            isRecording = true;
            elements.recordBtn.classList.add('recording');
            elements.recordStatus.textContent = '🔴 Recording... Tap to stop';
            log('🎤 Recording started', 'info');
            
        } catch (e) {
            log(`❌ Microphone error: ${e.message}`, 'error');
            showToast('Microphone access denied');
        }
    } else {
        // Stop recording
        mediaRecorder.stop();
        isRecording = false;
        elements.recordBtn.classList.remove('recording');
        elements.recordStatus.textContent = 'Processing...';
        log('🛑 Recording stopped', 'info');
    }
}

async function processRecording(blob) {
    const apiKey = localStorage.getItem('scribeApiKey');
    const language = elements.languageSelect.value;
    
    if (!apiKey) {
        log('❌ No API key found', 'error');
        elements.recordStatus.textContent = 'Error: No API key';
        return;
    }
    
    // Add to history immediately with "Processing..." status
    const recordingId = Date.now();
    const timestamp = new Date().toLocaleTimeString();
    
    recordings.unshift({
        id: recordingId,
        blob: blob,
        text: '(Processing...)',
        timestamp: timestamp
    });
    
    // Keep max 10 recordings
    if (recordings.length > 10) {
        recordings.pop();
    }
    
    renderHistory();
    
    // Save to IndexedDB
    try {
        await saveRecording(recordingId, blob, '(Processing...)', timestamp);
    } catch (e) {
        console.warn('Failed to save recording:', e);
    }
    
    // Transcribe
    elements.recordStatus.innerHTML = '<span class="spinner"></span> Transcribing...';
    elements.outputSection.style.display = 'block';
    elements.outputText.textContent = 'Transcribing...';
    
    try {
        let result;
        
        if (useRealtime) {
            result = await transcribeRealtime(
                blob,
                apiKey,
                language,
                (partial) => {
                    elements.outputText.textContent = partial + '...';
                },
                (committed) => {
                    elements.outputText.textContent = committed;
                    updateHistoryItem(recordingId, committed);
                }
            );
        } else {
            result = await transcribeBatch(blob, apiKey, language);
        }
        
        elements.outputText.textContent = result.text;
        elements.recordStatus.textContent = '✅ Done!';
        
        // Update history
        updateHistoryItem(recordingId, result.text);
        
        // Save to IndexedDB
        try {
            await updateRecordingText(recordingId, result.text);
            log('💾 Transcription saved', 'success');
        } catch (e) {
            console.warn('Failed to save transcription:', e);
        }
        
    } catch (error) {
        log(`❌ Transcription failed: ${error.message}`, 'error');
        elements.outputText.textContent = `Error: ${error.message}`;
        elements.recordStatus.textContent = 'Error';
        
        // If real-time failed, offer to fallback to batch
        if (useRealtime) {
            log('Trying batch mode as fallback...', 'info');
            try {
                const result = await transcribeBatch(blob, apiKey, language);
                elements.outputText.textContent = result.text;
                elements.recordStatus.textContent = '✅ Done (batch fallback)';
                updateHistoryItem(recordingId, result.text);
                await updateRecordingText(recordingId, result.text);
            } catch (e) {
                log(`❌ Batch fallback also failed: ${e.message}`, 'error');
            }
        }
    }
}

function updateHistoryItem(id, text) {
    const recording = recordings.find(r => r.id === id);
    if (recording) {
        recording.text = text;
        renderHistory();
    }
}

function renderHistory() {
    elements.historyList.innerHTML = '';
    
    if (recordings.length === 0) {
        elements.historyList.innerHTML = '<li style="color: #888; text-align: center; padding: 20px;">No recordings yet</li>';
        return;
    }
    
    recordings.forEach(recording => {
        const li = document.createElement('li');
        li.className = 'history-item';
        
        const isProcessing = recording.text === '(Processing...)';
        const textDisplay = isProcessing 
            ? '<div class="history-text" style="color: #888; font-style: italic;">Processing...</div>'
            : `<div class="history-text">${escapeHtml(recording.text)}</div>`;
        
        li.innerHTML = `
            <div class="history-header">
                <span class="history-time">${recording.timestamp}</span>
                ${!isProcessing ? `<button onclick="window.copyHistoryText(${recording.id})">📋 Copy</button>` : ''}
            </div>
            ${textDisplay}
            <div class="history-actions">
                <button onclick="window.playRecording(${recording.id})">▶ Play</button>
                <button onclick="window.downloadRecording(${recording.id})">💾 Download</button>
                <button onclick="window.reprocessRecording(${recording.id})">🔄 Reprocess</button>
            </div>
        `;
        
        elements.historyList.appendChild(li);
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function copyOutput() {
    const text = elements.outputText.textContent;
    if (text) {
        navigator.clipboard.writeText(text);
        showToast('Copied!');
        log('📋 Copied to clipboard', 'success');
    }
}

// Global functions for history buttons
window.playRecording = (id) => {
    const recording = recordings.find(r => r.id === id);
    if (recording && recording.blob) {
        const audio = new Audio(URL.createObjectURL(recording.blob));
        audio.play();
        log('▶ Playing recording', 'info');
    }
};

window.downloadRecording = (id) => {
    const recording = recordings.find(r => r.id === id);
    if (recording && recording.blob) {
        const url = URL.createObjectURL(recording.blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `recording_${recording.timestamp.replace(/:/g, '-')}.webm`;
        a.click();
        URL.revokeObjectURL(url);
        log('💾 Downloaded recording', 'success');
    }
};

window.copyHistoryText = (id) => {
    const recording = recordings.find(r => r.id === id);
    if (recording && recording.text && recording.text !== '(Processing...)') {
        navigator.clipboard.writeText(recording.text);
        showToast('Copied!');
        log('📋 Copied transcription', 'success');
    }
};

window.reprocessRecording = async (id) => {
    const recording = recordings.find(r => r.id === id);
    if (recording && recording.blob) {
        log('🔄 Reprocessing recording...', 'info');
        await processRecording(recording.blob);
    }
};

// Logging
export function log(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.textContent = `[${timestamp}] ${message}`;
    elements.logOutput.appendChild(entry);
    elements.logOutput.scrollTop = elements.logOutput.scrollHeight;
    console.log(`[${type}] ${message}`);
}

function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add('show');
    setTimeout(() => {
        elements.toast.classList.remove('show');
    }, 2000);
}
