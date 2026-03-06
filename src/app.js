// Main application logic — FlashScribe Web (Gemini Edition)
import { initDB, saveRecording, loadRecordings, updateRecordingText, deleteRecording } from './storage.js';
import { transcribeWithGemini } from './gemini.js';
import { ScribePill } from './pill.js';

// ─── State ───────────────────────────────────────────────────────────
let mediaRecorder = null;
let isRecording = false;
let recordings = [];
let elements = {};
let pill = null;
let selectedFile = null;   // Audio file chosen via upload

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
        recordBtn: document.getElementById('recordBtn'),     // pill-wrapper div
        recordStatus: document.getElementById('recordStatus'),
        pillCanvas: document.getElementById('pillCanvas'),
        uploadSection: document.getElementById('uploadSection'),
        uploadZone: document.getElementById('uploadZone'),
        audioFileInput: document.getElementById('audioFileInput'),
        uploadPlaceholder: document.getElementById('uploadPlaceholder'),
        uploadSelected: document.getElementById('uploadSelected'),
        uploadFileName: document.getElementById('uploadFileName'),
        clearFileBtn: document.getElementById('clearFileBtn'),
        processFileBtn: document.getElementById('processFileBtn'),
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
    // API Key
    elements.saveKeyBtn.addEventListener('click', saveApiKey);
    elements.apiKeyInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') saveApiKey();
    });

    // ── FIX 1: Pill-wrapper is now the direct click/keyboard target ──
    // No more transparent overlay — only clicks on the pill itself fire
    elements.recordBtn.addEventListener('click', toggleRecording);
    elements.recordBtn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleRecording();
        }
    });

    // Output
    elements.copyBtn.addEventListener('click', copyOutput);

    // ── FIX 2: Audio file upload ─────────────────────────────────────
    // Clicking anywhere on the drop zone opens the file picker
    elements.uploadZone.addEventListener('click', () => {
        if (!selectedFile) elements.audioFileInput.click();
    });

    // Drag and drop support
    elements.uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        elements.uploadZone.classList.add('drag-over');
    });
    elements.uploadZone.addEventListener('dragleave', () => {
        elements.uploadZone.classList.remove('drag-over');
    });
    elements.uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        elements.uploadZone.classList.remove('drag-over');
        const file = e.dataTransfer?.files?.[0];
        if (file) handleFileSelected(file);
    });

    elements.audioFileInput.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (file) handleFileSelected(file);
    });

    elements.clearFileBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        clearSelectedFile();
    });

    elements.processFileBtn.addEventListener('click', processUploadedFile);
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
    elements.uploadSection.style.display = 'block';
    elements.historySection.style.display = 'block';

    // Init pill once the canvas is in DOM
    if (!pill && elements.pillCanvas) {
        pill = new ScribePill(elements.pillCanvas);
    }
}

// ─── FIX 2: Audio File Upload ─────────────────────────────────────────
const SUPPORTED_AUDIO_TYPES = new Set([
    'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/wave', 'audio/x-wav',
    'audio/flac', 'audio/x-flac', 'audio/ogg', 'audio/vorbis', 'audio/opus',
    'audio/m4a', 'audio/mp4', 'audio/aac', 'audio/x-aac', 'audio/webm',
    'audio/3gpp', 'audio/amr', 'video/webm', 'video/mp4',
]);

function handleFileSelected(file) {
    // Accept audio/* or any of our known extensions
    const isAudio = file.type.startsWith('audio/') ||
        file.type.startsWith('video/') || // webm video containers carry audio
        SUPPORTED_AUDIO_TYPES.has(file.type) ||
        /\.(mp3|wav|wave|flac|ogg|oga|opus|m4a|aac|webm|weba|mp4|mpeg|mpga|amr|3gp)$/i.test(file.name);

    if (!isAudio) {
        showToast('⚠️ Please select an audio file');
        log(`⚠️ Unsupported file type: ${file.type || file.name}`, 'warn');
        return;
    }

    selectedFile = file;

    // Show selected state
    elements.uploadPlaceholder.style.display = 'none';
    elements.uploadSelected.style.display = 'flex';
    elements.uploadFileName.textContent = file.name;
    elements.processFileBtn.style.display = 'block';
    elements.uploadZone.classList.add('has-file');

    log(`📁 File selected: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`, 'info');
}

function clearSelectedFile() {
    selectedFile = null;
    elements.audioFileInput.value = '';
    elements.uploadPlaceholder.style.display = 'flex';
    elements.uploadSelected.style.display = 'none';
    elements.processFileBtn.style.display = 'none';
    elements.uploadZone.classList.remove('has-file');
}

async function processUploadedFile() {
    if (!selectedFile) return;

    const apiKey = localStorage.getItem('geminiApiKey');
    if (!apiKey) {
        showToast('⚠️ No API key saved');
        return;
    }

    const modelId = elements.modelSelect?.value || 'gemini-2.5-flash';
    const id = Date.now();
    const timestamp = new Date().toISOString();

    log(`📁 Processing uploaded file: ${selectedFile.name}`, 'info');

    // ── FIX 3 applied to uploads too: save blob BEFORE calling Gemini ──
    const audioBlob = selectedFile;
    await _saveAndRender(id, audioBlob, '⏳ Processing... (tap Reprocess if failed)', timestamp);

    const processBtn = elements.processFileBtn;
    processBtn.disabled = true;
    processBtn.textContent = '⏳ Transcribing...';

    try {
        const text = await transcribeWithGemini(audioBlob, apiKey, modelId, log);
        if (text) {
            await _updateAndRender(id, text);
            elements.outputText.textContent = text;
            elements.outputSection.style.display = 'block';
            elements.outputSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            showToast('✅ File transcribed!');
            log('✅ File transcription complete!', 'success');

            // Clear the upload zone after success
            clearSelectedFile();
        } else {
            await _updateAndRender(id, '❌ TRANSCRIPTION FAILED — tap Reprocess to try again');
            log('❌ No transcription returned.', 'error');
        }
    } catch (err) {
        await _updateAndRender(id, `❌ ERROR: ${err.message} — tap Reprocess to try again`);
        log(`❌ Error: ${err.message}`, 'error');
    } finally {
        processBtn.disabled = false;
        processBtn.textContent = '🤖 Transcribe File';
    }
}

// ─── Recording Toggle ─────────────────────────────────────────────────
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
        if (pill) pill.attachStream(stream);

        const chunks = [];
        const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
        mediaRecorder = new MediaRecorder(stream, { mimeType });

        // Store id/timestamp here so we can save before Gemini returns
        const recordingId = Date.now();
        const timestamp = new Date().toISOString();

        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunks.push(e.data);
        };

        mediaRecorder.onstop = async () => {
            stream.getTracks().forEach(t => t.stop());
            if (pill) pill.detachStream();

            const audioBlob = new Blob(chunks, { type: mimeType });

            // ── FIX 3: Save audio IMMEDIATELY before calling Gemini ──────
            // This guarantees audio is preserved even if transcription fails
            await _saveAndRender(recordingId, audioBlob, '⏳ Processing... (tap Reprocess if failed)', timestamp);

            setStatus('processing');
            log('⚙️ Sending to Gemini...', 'info');

            const apiKey = localStorage.getItem('geminiApiKey');
            const modelId = elements.modelSelect?.value || 'gemini-2.5-flash';
            localStorage.setItem('geminiModel', modelId);

            try {
                const text = await transcribeWithGemini(audioBlob, apiKey, modelId, log);
                if (text) {
                    await _updateAndRender(recordingId, text);
                    elements.outputText.textContent = text;
                    elements.outputSection.style.display = 'block';
                    elements.outputSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    setStatus('success');
                    log('✅ Transcription complete!', 'success');
                    showToast('✅ Transcribed!');
                    setTimeout(() => setStatus('idle'), 2000);
                } else {
                    await _updateAndRender(recordingId, '❌ TRANSCRIPTION FAILED — tap Reprocess to try again');
                    setStatus('error');
                    log('❌ No transcription returned.', 'error');
                    setTimeout(() => setStatus('idle'), 3000);
                }
            } catch (err) {
                await _updateAndRender(recordingId, `❌ ERROR: ${err.message} — tap Reprocess to try again`);
                setStatus('error');
                log(`❌ Error: ${err.message}`, 'error');
                setTimeout(() => setStatus('idle'), 3000);
            }
        };

        mediaRecorder.start();
        isRecording = true;
        setStatus('recording');
        elements.recordBtn.setAttribute('aria-pressed', 'true');
        log('🎤 Recording started...', 'info');

    } catch (err) {
        log(`❌ Mic access failed: ${err.message}`, 'error');
        setStatus('error');
        setTimeout(() => setStatus('idle'), 3000);
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }
    isRecording = false;
    elements.recordBtn.setAttribute('aria-pressed', 'false');
    log('⏹️ Recording stopped.', 'info');
}

// ─── Save Helpers ─────────────────────────────────────────────────────
/** Save a recording and re-render history immediately */
async function _saveAndRender(id, blob, initialText, timestamp) {
    try {
        await saveRecording(id, blob, initialText, timestamp);
        // Rebuild in-memory list and UI
        recordings = await loadRecordings();
        renderHistory();
        elements.historySection.style.display = 'block';
    } catch (e) {
        log(`⚠️ Could not save recording: ${e.message}`, 'warn');
    }
}

/** Update just the text of an existing recording, then re-render */
async function _updateAndRender(id, text) {
    try {
        await updateRecordingText(id, text);
        recordings = await loadRecordings();
        renderHistory();
    } catch (e) {
        log(`⚠️ Could not update recording text: ${e.message}`, 'warn');
    }
}

// ─── UI State ─────────────────────────────────────────────────────────
function setStatus(state) {
    if (pill) pill.setState(state);
    const messages = {
        recording: '🔴 Recording... tap to stop',
        processing: '🤖 Thinking...',
        success: '✅ Done!',
        error: '❌ Error — tap to retry',
        idle: 'Tap the pill to record',
    };
    if (elements.recordStatus) {
        elements.recordStatus.textContent = messages[state] || 'Tap the pill to record';
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

// ─── History Rendering ────────────────────────────────────────────────
// FIX 3: Each card has a Play button (reads blob from IndexedDB)
//        and a Reprocess button (re-sends to Gemini)
function renderHistory() {
    const list = elements.historyList;
    if (!list) return;
    list.innerHTML = '';

    recordings.slice(0, 30).forEach((rec) => {
        const isFailed = rec.text?.startsWith('❌') || rec.text?.startsWith('⏳');
        const card = document.createElement('div');
        card.className = 'history-card' + (isFailed ? ' history-card-failed' : '');

        const ts = new Date(rec.timestamp).toLocaleString();
        card.innerHTML = `
            <div class="history-header">
                <span class="history-time">${ts}</span>
                <div class="history-actions">
                    ${rec.blob ? `<button class="btn btn-small history-play-btn" data-id="${rec.id}">▶ Play</button>` : ''}
                    <button class="btn btn-small history-reprocess-btn" data-id="${rec.id}">🔄 Reprocess</button>
                    <button class="btn btn-small history-copy-btn" data-text="${escapeAttr(rec.text)}"
                        ${isFailed ? 'disabled' : ''}>📋 Copy</button>
                    <button class="btn btn-small history-delete-btn" data-id="${rec.id}">🗑</button>
                </div>
            </div>
            <div class="history-text ${isFailed ? 'failed-text' : ''}">${escapeHtml(rec.text)}</div>
        `;

        // Play
        if (rec.blob) {
            card.querySelector('.history-play-btn')?.addEventListener('click', () => playBlob(rec.blob, rec.id));
        }
        // Reprocess
        card.querySelector('.history-reprocess-btn')?.addEventListener('click', () => reprocessRecording(rec.id));
        // Copy
        card.querySelector('.history-copy-btn')?.addEventListener('click', () => {
            if (!isFailed) {
                navigator.clipboard.writeText(rec.text).then(() => showToast('📋 Copied!'));
            }
        });
        // Delete
        card.querySelector('.history-delete-btn')?.addEventListener('click', async () => {
            await deleteRecording(rec.id);
            recordings = recordings.filter(r => r.id !== rec.id);
            renderHistory();
        });

        list.appendChild(card);
    });
}

// Play audio blob in-browser
const _activePlayers = {};
function playBlob(blob, id) {
    // Stop any existing player for this id
    if (_activePlayers[id]) {
        _activePlayers[id].pause();
        _activePlayers[id].src = '';
        delete _activePlayers[id];
        return;
    }
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    _activePlayers[id] = audio;
    audio.play().catch(e => log(`⚠️ Playback error: ${e.message}`, 'warn'));
    audio.onended = () => {
        URL.revokeObjectURL(url);
        delete _activePlayers[id];
    };
}

// Reprocess: find the recording, re-send its blob to Gemini
async function reprocessRecording(id) {
    const rec = recordings.find(r => r.id === id);
    if (!rec?.blob) {
        showToast('⚠️ No audio saved for this recording');
        return;
    }
    const apiKey = localStorage.getItem('geminiApiKey');
    if (!apiKey) { showToast('⚠️ No API key saved'); return; }

    const modelId = elements.modelSelect?.value || 'gemini-2.5-flash';
    log(`🔄 Reprocessing recording from ${new Date(rec.timestamp).toLocaleTimeString()}...`, 'info');

    // Update text to show pending
    await _updateAndRender(id, '⏳ Reprocessing...');

    try {
        const text = await transcribeWithGemini(rec.blob, apiKey, modelId, log);
        if (text) {
            await _updateAndRender(id, text);
            elements.outputText.textContent = text;
            elements.outputSection.style.display = 'block';
            elements.outputSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            showToast('✅ Reprocessed!');
            log('✅ Reprocess complete!', 'success');
        } else {
            await _updateAndRender(id, '❌ REPROCESS FAILED — tap Reprocess to try again');
        }
    } catch (err) {
        await _updateAndRender(id, `❌ ERROR: ${err.message} — tap Reprocess to try again`);
        log(`❌ Reprocess error: ${err.message}`, 'error');
    }
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
function escapeHtml(text = '') {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(text = '') {
    return text.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
