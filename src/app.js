// Main application logic — FlashScribe Web (Gemini Edition)
import { initDB, saveRecording, loadRecordings } from './storage.js';
import { transcribeWithGemini } from './gemini.js';

// ─── State ───────────────────────────────────────────────────────────
let mediaRecorder = null;
let isRecording = false;
let recordings = [];
let elements = {};

// ─── Init ─────────────────────────────────────────────────────────────
export function initApp() {
    cacheElements();
    setupEventListeners();
    loadState();
    log('Page loaded. Enter your Gemini API key to start.', 'info');
}

function cacheElements() {
    elements = {
        apiKeyInput: document.getElementById('apiKeyInput'),
        saveKeyBtn: document.getElementById('saveKeyBtn'),
        keyStatus: document.getElementById('keyStatus'),
        settingsSection: document.getElementById('settingsSection'),
        languageSelect: document.getElementById('languageSelect'),
        modelSelect: document.getElementById('modelSelect'),
        recorderSection: document.getElementById('recorderSection'),
        recordBtn: document.getElementById('recordBtn'),
        recordStatus: document.getElementById('recordStatus'),
        outputSection: document.getElementById('outputSection'),
        outputText: document.getElementById('outputText'),
        copyBtn: document.getElementById('copyBtn'),
        historySection: document.getElementById('historySection'),
        historyList: document.getElementById('historyList'),
        logOutput: document.getElementById('logOutput'),
        toast: document.getElementById('toast'),
    };
}

function setupEventListeners() {
    elements.saveKeyBtn.addEventListener('click', saveApiKey);
    elements.apiKeyInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') saveApiKey();
    });
    elements.recordBtn.addEventListener('click', toggleRecording);
    elements.copyBtn.addEventListener('click', copyOutput);
}

async function loadState() {
    const savedKey = localStorage.getItem('geminiApiKey');
    if (savedKey) {
        elements.apiKeyInput.value = savedKey;
        showAuthenticatedUI();
    }
    const savedModel = localStorage.getItem('geminiModel');
    if (savedModel && elements.modelSelect) {
        elements.modelSelect.value = savedModel;
    }

    try {
        await initDB();
        recordings = await loadRecordings();
        if (recordings.length > 0) {
            renderHistory();
            elements.historySection.style.display = 'block';
            log(`📂 Loaded ${recordings.length} saved recording(s)`, 'success');
        }
    } catch (e) {
        log(`⚠️ Could not load history: ${e.message}`, 'warn');
    }
}

// ─── API Key ──────────────────────────────────────────────────────────
function saveApiKey() {
    const key = elements.apiKeyInput.value.trim();
    if (!key) {
        elements.keyStatus.textContent = '❌ Please enter an API key';
        elements.keyStatus.className = 'status error';
        return;
    }
    localStorage.setItem('geminiApiKey', key);
    elements.keyStatus.textContent = '✅ API key saved!';
    elements.keyStatus.className = 'status success';
    showAuthenticatedUI();
    log('🔑 Gemini API key saved.', 'success');
}

function showAuthenticatedUI() {
    elements.settingsSection.style.display = 'block';
    elements.recorderSection.style.display = 'block';
    elements.historySection.style.display = 'block';
}

// ─── Recording ────────────────────────────────────────────────────────
async function toggleRecording() {
    if (!isRecording) {
        await startRecording();
    } else {
        stopRecording();
    }
}

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const chunks = [];

        // Prefer webm; fallback for Safari
        const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
        mediaRecorder = new MediaRecorder(stream, { mimeType });

        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunks.push(e.data);
        };

        mediaRecorder.onstop = async () => {
            // Stop all tracks
            stream.getTracks().forEach(t => t.stop());

            const audioBlob = new Blob(chunks, { type: mimeType });
            const timestamp = new Date().toISOString();
            const id = Date.now();

            setStatus('processing');
            log('⚙️ Processing audio...', 'info');

            const apiKey = localStorage.getItem('geminiApiKey');
            const modelId = elements.modelSelect?.value || 'gemini-2.5-flash';

            // Save model preference
            localStorage.setItem('geminiModel', modelId);

            try {
                const text = await transcribeWithGemini(audioBlob, apiKey, modelId, log);

                if (text) {
                    // Show output
                    elements.outputText.textContent = text;
                    elements.outputSection.style.display = 'block';

                    // Save to IndexedDB
                    await saveRecording(id, audioBlob, text, timestamp);
                    recordings.unshift({ id, blob: audioBlob, text, timestamp });
                    renderHistory();
                    elements.historySection.style.display = 'block';

                    setStatus('idle');
                    log('✅ Transcription complete!', 'success');
                    showToast('✅ Transcribed!');
                } else {
                    setStatus('error');
                    log('❌ No transcription returned.', 'error');
                }
            } catch (err) {
                setStatus('error');
                log(`❌ Error: ${err.message}`, 'error');
            }
        };

        mediaRecorder.start();
        isRecording = true;
        setStatus('recording');
        log('🎤 Recording started...', 'info');
    } catch (err) {
        log(`❌ Mic access failed: ${err.message}`, 'error');
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }
    isRecording = false;
    setStatus('processing');
    log('⏹️ Recording stopped. Sending to Gemini...', 'info');
}

// ─── UI State ─────────────────────────────────────────────────────────
function setStatus(state) {
    const btn = elements.recordBtn;
    const statusEl = elements.recordStatus;

    btn.classList.remove('recording');

    switch (state) {
        case 'recording':
            btn.textContent = '⏹️';
            btn.classList.add('recording');
            statusEl.textContent = '🔴 Recording... tap to stop';
            break;
        case 'processing':
            btn.textContent = '⏳';
            statusEl.textContent = '🤖 Thinking...';
            break;
        case 'error':
            btn.textContent = '🎤';
            statusEl.textContent = '❌ Error — try again';
            break;
        default: // idle
            btn.textContent = '🎤';
            statusEl.textContent = 'Tap to Record';
    }
}

// ─── Copy ─────────────────────────────────────────────────────────────
function copyOutput() {
    const text = elements.outputText.textContent;
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
        showToast('📋 Copied!');
        log('📋 Copied to clipboard.', 'success');
    });
}

// ─── History ──────────────────────────────────────────────────────────
function renderHistory() {
    const list = elements.historyList;
    list.innerHTML = '';
    recordings.slice(0, 20).forEach((rec) => {
        const card = document.createElement('div');
        card.className = 'history-card';

        const ts = new Date(rec.timestamp).toLocaleString();
        card.innerHTML = `
            <div class="history-header">
                <span class="history-time">${ts}</span>
                <button class="btn btn-small history-copy-btn">📋 Copy</button>
            </div>
            <div class="history-text">${escapeHtml(rec.text)}</div>
        `;
        card.querySelector('.history-copy-btn').addEventListener('click', () => {
            navigator.clipboard.writeText(rec.text).then(() => showToast('📋 Copied!'));
        });
        list.appendChild(card);
    });
}

// ─── Log ──────────────────────────────────────────────────────────────
export function log(message, level = 'info') {
    const logEl = elements.logOutput;
    if (!logEl) return;
    const colors = { info: '#888', success: '#2ed573', error: '#ff4757', warn: '#ffa502' };
    const line = document.createElement('div');
    line.style.color = colors[level] || '#888';
    line.style.fontSize = '0.78rem';
    line.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    logEl.appendChild(line);
    logEl.scrollTop = logEl.scrollHeight;
}

// ─── Toast ────────────────────────────────────────────────────────────
function showToast(msg) {
    elements.toast.textContent = msg;
    elements.toast.classList.add('show');
    setTimeout(() => elements.toast.classList.remove('show'), 2500);
}

// ─── Utils ────────────────────────────────────────────────────────────
function escapeHtml(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
