// Main application logic — FlashScribe Web (Gemini Edition)
// Supports: single API key, multi-key passcode unlock, smart rotation, custom models, Vertex AI, and Multi-theming.
import { initDB, saveRecording, loadRecordings, updateRecordingText, deleteRecording } from './storage.js';
import { transcribeWithGemini } from './gemini.js';
import { ScribePill } from './pill.js';

// ─── State ───────────────────────────────────────────────────────────
let mediaRecorder = null;
let isRecording = false;
let recordings = [];
let elements = {};
let pill = null;
let selectedFile = null;

// ─── Init ─────────────────────────────────────────────────────────────
export function initApp() {
    cacheElements();
    setupEventListeners();
    loadState();
    log('Page loaded. Ready for transcription.', 'info');
}

function cacheElements() {
    elements = {
        // Theme
        themeSelect: document.getElementById('themeSelect'),

        // Auth Mode
        modeStudio: document.getElementById('modeStudio'),
        modeVertex: document.getElementById('modeVertex'),
        studioSection: document.getElementById('studioSection'),
        vertexSection: document.getElementById('vertexSection'),

        // AI Studio
        apiKeyInput: document.getElementById('apiKeyInput'),
        saveKeyBtn: document.getElementById('saveKeyBtn'),

        // Vertex AI
        vertexProjectId: document.getElementById('vertexProjectId'),
        vertexServiceAccount: document.getElementById('vertexServiceAccount'),
        saveVertexBtn: document.getElementById('saveVertexBtn'),

        keyStatus: document.getElementById('keyStatus'),

        // Settings
        settingsSection: document.getElementById('settingsSection'),
        languageSelect: document.getElementById('languageSelect'),
        modelSelect: document.getElementById('modelSelect'),
        thinkingLevelRow: document.getElementById('thinkingLevelRow'),
        thinkingLevelSelect: document.getElementById('thinkingLevelSelect'),
        customModelRow: document.getElementById('customModelRow'),
        customModelInput: document.getElementById('customModelInput'),
        addCustomModelBtn: document.getElementById('addCustomModelBtn'),

        // Recorder
        recorderSection: document.getElementById('recorderSection'),
        recordBtn: document.getElementById('recordBtn'),
        recordStatus: document.getElementById('recordStatus'),
        pillCanvas: document.getElementById('pillCanvas'),

        // Upload
        uploadSection: document.getElementById('uploadSection'),
        uploadZone: document.getElementById('uploadZone'),
        audioFileInput: document.getElementById('audioFileInput'),
        uploadPlaceholder: document.getElementById('uploadPlaceholder'),
        uploadSelected: document.getElementById('uploadSelected'),
        uploadFileName: document.getElementById('uploadFileName'),
        clearFileBtn: document.getElementById('clearFileBtn'),
        processFileBtn: document.getElementById('processFileBtn'),

        // Output
        outputSection: document.getElementById('outputSection'),
        outputText: document.getElementById('outputText'),
        copyBtn: document.getElementById('copyBtn'),

        // History
        historySection: document.getElementById('historySection'),
        historyList: document.getElementById('historyList'),

        logOutput: document.getElementById('logOutput'),
        toast: document.getElementById('toast'),
    };
}

function setupEventListeners() {
    // Theme
    elements.themeSelect.addEventListener('change', (e) => setTheme(e.target.value));

    // Auth Mode Toggles
    elements.modeStudio.addEventListener('click', () => setAuthMode('studio'));
    elements.modeVertex.addEventListener('click', () => setAuthMode('vertex'));

    // Save Buttons
    elements.saveKeyBtn.addEventListener('click', saveApiKey);
    elements.saveVertexBtn.addEventListener('click', saveVertexConfig);

    elements.apiKeyInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') saveApiKey();
    });

    // Recording
    elements.recordBtn.addEventListener('click', toggleRecording);
    elements.recordBtn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleRecording();
        }
    });

    // Output
    elements.copyBtn.addEventListener('click', copyOutput);

    // Audio upload
    elements.uploadZone.addEventListener('click', () => {
        if (!selectedFile) elements.audioFileInput.click();
    });
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

    // Model management
    elements.modelSelect.addEventListener('change', () => {
        const model = elements.modelSelect.value;
        if (model === '__add_custom__') {
            elements.customModelRow.style.display = 'flex';
            elements.customModelInput.focus();
        } else {
            elements.customModelRow.style.display = 'none';
            localStorage.setItem('geminiModel', model);
            updateThinkingLevelVisibility();
        }
    });

    elements.addCustomModelBtn.addEventListener('click', addCustomModel);
    elements.customModelInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addCustomModel();
    });

    // Thinking Level
    elements.thinkingLevelSelect.addEventListener('change', () => {
        localStorage.setItem('thinkingLevel', elements.thinkingLevelSelect.value);
    });
}

async function loadState() {
    // Restore Theme
    const savedTheme = localStorage.getItem('theme') || 'dark';
    setTheme(savedTheme);
    elements.themeSelect.value = savedTheme;

    // Restore Auth Mode
    const savedMode = localStorage.getItem('authMode') || 'studio';
    setAuthMode(savedMode);

    // Restore Studio Auth
    const savedKeys = localStorage.getItem('geminiApiKeys');
    const savedKey = localStorage.getItem('geminiApiKey');
    if (savedKeys || savedKey) {
        showAuthenticatedUI();
        const count = savedKeys ? JSON.parse(savedKeys).length : 1;
        elements.keyStatus.textContent = savedKeys
            ? `✅ ${count} backup key(s) active`
            : '✅ API key saved';
        elements.keyStatus.className = 'status success';
    }

    // Restore Vertex Auth
    const savedProjectId = localStorage.getItem('vertexProjectId');
    const savedSA = localStorage.getItem('vertexServiceAccount');
    if (savedProjectId && savedSA) {
        elements.vertexProjectId.value = savedProjectId;
        elements.vertexServiceAccount.value = savedSA;
        if (savedMode === 'vertex') {
            showAuthenticatedUI();
            elements.keyStatus.textContent = '✅ Vertex AI configuration active';
            elements.keyStatus.className = 'status success';
        }
    }

    // Restore model selection
    const savedModel = localStorage.getItem('geminiModel');
    if (savedModel) {
        if (!elements.modelSelect.querySelector(`option[value="${CSS.escape(savedModel)}"]`)) {
            _injectCustomOption(savedModel);
        }
        elements.modelSelect.value = savedModel;
    }
    updateThinkingLevelVisibility();

    // Restore Thinking Level
    const savedLevel = localStorage.getItem('thinkingLevel');
    if (savedLevel) {
        elements.thinkingLevelSelect.value = savedLevel;
    }

    // Restore custom models
    _restoreCustomModels();

    // Load history
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

// ─── Theme Management ─────────────────────────────────────────────────
function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
}

// ─── Auth Mode Management ─────────────────────────────────────────────
function setAuthMode(mode) {
    localStorage.setItem('authMode', mode);
    if (mode === 'studio') {
        elements.modeStudio.classList.add('active');
        elements.modeVertex.classList.remove('active');
        elements.studioSection.classList.remove('hidden');
        elements.vertexSection.classList.add('hidden');
    } else {
        elements.modeStudio.classList.remove('active');
        elements.modeVertex.classList.add('active');
        elements.studioSection.classList.add('hidden');
        elements.vertexSection.classList.remove('hidden');
    }
}

// ─── Thinking Level Visibility ────────────────────────────────────────
function updateThinkingLevelVisibility() {
    const model = elements.modelSelect.value;
    // Support "thinking" in name or pro/flash models (excluding lite)
    const supportsThinking = (model.includes('thinking') || model.includes('pro') || model.includes('flash')) && !model.includes('lite');

    if (supportsThinking) {
        elements.thinkingLevelRow.classList.remove('hidden');
    } else {
        elements.thinkingLevelRow.classList.add('hidden');
    }
}

// ─── AES Decryption Payloads ───────────────────────────────────────────
const PAYLOADS = {
    "Mango_Tree": "lUslF0D6jKoaEKVQyi4cYQ==./BAlQQYpPKskvqOr.5+RdhsjSDaERoddnmXCK0Q==.HhCAgqA5iJVo06ygUXmc7vxR6BhQDdSSET/2xEFMXEzCRScGU0T6N22efE3ACtcKmOnvFSmKJAaVtzICJxslxS9UAgV/lz8uYdyOdLJNwLgdH3boOMLnYcB8peZNegFpZPm/NTbhNQUlRM9CMNqgSfmEfnIBtoQTOWiFU9FUfMjPH+tIet8mw+0BVhDxVOlncbvduEG0tdQ5TKLjEZZapuRSMUzBcC/FevWV4sG1Z+kclIrqVD6cwycV7UBFWrDGNDmiZ+qg7hU0SMzpU8jhrsNwgw==",
    "Apple_Tree": "+B/SOq09UazZvDWnBH6vQA==.brzCzTWi4oL/osX+.xMfqEk6aGVvZ7Bzstce6lg==.RLYId9+hEGMnRMRlpTj7WbMKRBtM9g1e2QC1eho9S1Mkx/TlREkZLXDcOw=="
};

async function decryptPayload(passcode, payloadData) {
    try {
        const [salt64, iv64, tag64, cipher64] = payloadData.split('.');
        const toBuf = (b64) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
        const salt = toBuf(salt64);
        const iv = toBuf(iv64);
        const tag = toBuf(tag64);
        const ciphertext = toBuf(cipher64);
        const data = new Uint8Array(ciphertext.length + tag.length);
        data.set(ciphertext);
        data.set(tag, ciphertext.length);
        const enc = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(passcode), { name: "PBKDF2" }, false, ["deriveBits", "deriveKey"]);
        const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt: salt, iterations: 100000, hash: "SHA-256" }, keyMaterial, { name: "AES-GCM", length: 256 }, true, ["decrypt"]);
        const decryptedData = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, key, data);
        const dec = new TextDecoder();
        return JSON.parse(dec.decode(decryptedData));
    } catch (e) { return null; }
}

// ─── API Key / Passcode Auth ──────────────────────────────────────────
async function saveApiKey() {
    const input = elements.apiKeyInput.value.trim();
    if (!input) {
        elements.keyStatus.textContent = '❌ Please enter an API key or passcode';
        elements.keyStatus.className = 'status error';
        return;
    }
    if (input.startsWith('AIza')) {
        localStorage.setItem('geminiApiKey', input);
        localStorage.removeItem('geminiApiKeys');
        elements.keyStatus.textContent = '✅ API key saved!';
        elements.keyStatus.className = 'status success';
        showAuthenticatedUI();
        log('🔑 Single Gemini API key saved.', 'success');
    } else {
        elements.keyStatus.textContent = '🔄 Verifying passcode...';
        elements.keyStatus.className = 'status';
        try {
            const payload = PAYLOADS[input];
            if (!payload) throw new Error('Invalid passcode');
            const keys = await decryptPayload(input, payload);
            if (!keys || keys.length === 0) throw new Error('Invalid passcode or decryption failed');
            localStorage.setItem('geminiApiKeys', JSON.stringify(keys));
            localStorage.removeItem('geminiApiKey');
            elements.keyStatus.textContent = `✅ Unlocked ${keys.length} backup key(s)!`;
            elements.keyStatus.className = 'status success';
            showAuthenticatedUI();
            log(`🔑 Encryption passed! ${keys.length} key(s) unlocked locally.`, 'success');
            showToast(`🔑 ${keys.length} key(s) unlocked!`);
        } catch (err) {
            elements.keyStatus.textContent = `❌ Error: ${err.message}`;
            elements.keyStatus.className = 'status error';
            log(`❌ Passcode error: ${err.message}`, 'error');
        }
    }
}

// ─── Vertex AI Auth ───────────────────────────────────────────────────
async function saveVertexConfig() {
    const projectId = elements.vertexProjectId.value.trim();
    const saJson = elements.vertexServiceAccount.value.trim();
    if (!projectId || !saJson) {
        elements.keyStatus.textContent = '❌ Project ID and Service Account JSON required';
        elements.keyStatus.className = 'status error';
        return;
    }
    try {
        JSON.parse(saJson); // Validate JSON
        localStorage.setItem('vertexProjectId', projectId);
        localStorage.setItem('vertexServiceAccount', saJson);
        elements.keyStatus.textContent = '✅ Vertex AI configuration saved!';
        elements.keyStatus.className = 'status success';
        showAuthenticatedUI();
        log('☁️ Vertex AI configuration saved.', 'success');
    } catch (e) {
        elements.keyStatus.textContent = '❌ Invalid Service Account JSON';
        elements.keyStatus.className = 'status error';
    }
}

function showAuthenticatedUI() {
    elements.settingsSection.style.display = 'block';
    elements.recorderSection.style.display = 'block';
    elements.uploadSection.style.display = 'block';
    elements.historySection.style.display = 'block';
    if (!pill && elements.pillCanvas) {
        pill = new ScribePill(elements.pillCanvas);
    }
}

// ─── Get Active Config ───────────────────────────────────────────────
function getActiveConfig() {
    const authMode = localStorage.getItem('authMode') || 'studio';
    const thinkingLevel = parseInt(localStorage.getItem('thinkingLevel') || '0');

    if (authMode === 'vertex') {
        return {
            mode: 'vertex',
            projectId: localStorage.getItem('vertexProjectId'),
            serviceAccount: localStorage.getItem('vertexServiceAccount'),
            thinkingLevel
        };
    } else {
        const multiKeys = localStorage.getItem('geminiApiKeys');
        let keys = [];
        if (multiKeys) { try { keys = JSON.parse(multiKeys); } catch {} }
        if (keys.length === 0) {
            const singleKey = localStorage.getItem('geminiApiKey');
            if (singleKey) keys = [singleKey];
        }
        return {
            mode: 'studio',
            keys,
            thinkingLevel
        };
    }
}

// ─── Custom Model Management ──────────────────────────────────────────
function addCustomModel() {
    const modelName = elements.customModelInput.value.trim();
    if (!modelName) return;
    _injectCustomOption(modelName);
    const customs = _getCustomModels();
    if (!customs.includes(modelName)) {
        customs.push(modelName);
        localStorage.setItem('customGeminiModels', JSON.stringify(customs));
    }
    elements.modelSelect.value = modelName;
    localStorage.setItem('geminiModel', modelName);
    elements.customModelInput.value = '';
    elements.customModelRow.style.display = 'none';
    updateThinkingLevelVisibility();
    log(`✨ Custom model "${modelName}" added.`, 'success');
}

function _injectCustomOption(modelName) {
    if (elements.modelSelect.querySelector(`option[value="${CSS.escape(modelName)}"]`)) return;
    const opt = document.createElement('option');
    opt.value = modelName;
    opt.textContent = modelName + ' (custom)';
    const sentinel = elements.modelSelect.querySelector('option[value="__add_custom__"]');
    elements.modelSelect.insertBefore(opt, sentinel);
}

function _restoreCustomModels() {
    _getCustomModels().forEach(m => _injectCustomOption(m));
}

function _getCustomModels() {
    try { return JSON.parse(localStorage.getItem('customGeminiModels') || '[]'); } catch { return []; }
}

// ─── Audio File Upload ────────────────────────────────────────────────
const SUPPORTED_AUDIO_TYPES = new Set(['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/wave', 'audio/x-wav', 'audio/flac', 'audio/x-flac', 'audio/ogg', 'audio/vorbis', 'audio/opus', 'audio/m4a', 'audio/mp4', 'audio/aac', 'audio/x-aac', 'audio/webm', 'audio/3gpp', 'audio/amr', 'video/webm', 'video/mp4']);

function handleFileSelected(file) {
    const isAudio = file.type.startsWith('audio/') || file.type.startsWith('video/') || SUPPORTED_AUDIO_TYPES.has(file.type) || /\.(mp3|wav|wave|flac|ogg|oga|opus|m4a|aac|webm|weba|mp4|mpeg|mpga|amr|3gp)$/i.test(file.name);
    if (!isAudio) { showToast('⚠️ Please select an audio file'); return; }
    selectedFile = file;
    elements.uploadPlaceholder.style.display = 'none';
    elements.uploadSelected.style.display = 'flex';
    elements.uploadFileName.textContent = file.name;
    elements.processFileBtn.style.display = 'block';
    elements.uploadZone.classList.add('has-file');
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
    const config = getActiveConfig();
    const modelId = elements.modelSelect?.value || 'gemini-2.0-flash';
    const id = Date.now();
    const timestamp = new Date().toISOString();
    log(`📁 Processing uploaded file: ${selectedFile.name}`, 'info');
    await _saveAndRender(id, selectedFile, '⏳ Processing...', timestamp);
    const processBtn = elements.processFileBtn;
    processBtn.disabled = true;
    processBtn.textContent = '⏳ Transcribing...';
    try {
        const text = await transcribeWithGemini(selectedFile, config, modelId, log);
        if (text) {
            await _updateAndRender(id, text);
            elements.outputText.textContent = text;
            elements.outputSection.style.display = 'block';
            elements.outputSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            showToast('✅ File transcribed!');
            clearSelectedFile();
        } else {
            await _updateAndRender(id, '❌ TRANSCRIPTION FAILED');
        }
    } catch (err) {
        await _updateAndRender(id, `❌ ERROR: ${err.message}`);
        log(`❌ Error: ${err.message}`, 'error');
    } finally {
        processBtn.disabled = false;
        processBtn.textContent = '🤖 Transcribe File';
    }
}

// ─── Recording Toggle ─────────────────────────────────────────────────
async function toggleRecording() {
    if (!isRecording) await startRecording();
    else stopRecording();
}

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (pill) pill.attachStream(stream);
        const chunks = [];
        const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
        mediaRecorder = new MediaRecorder(stream, { mimeType });
        const recordingId = Date.now();
        const timestamp = new Date().toISOString();
        mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
        mediaRecorder.onstop = async () => {
            stream.getTracks().forEach(t => t.stop());
            if (pill) pill.detachStream();
            const audioBlob = new Blob(chunks, { type: mimeType });
            await _saveAndRender(recordingId, audioBlob, '⏳ Processing...', timestamp);
            setStatus('processing');
            const config = getActiveConfig();
            const modelId = elements.modelSelect?.value || 'gemini-2.0-flash';
            try {
                const text = await transcribeWithGemini(audioBlob, config, modelId, log);
                if (text) {
                    await _updateAndRender(recordingId, text);
                    elements.outputText.textContent = text;
                    elements.outputSection.style.display = 'block';
                    elements.outputSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    setStatus('success');
                    showToast('✅ Transcribed!');
                    setTimeout(() => setStatus('idle'), 2000);
                } else {
                    await _updateAndRender(recordingId, '❌ TRANSCRIPTION FAILED');
                    setStatus('error');
                    setTimeout(() => setStatus('idle'), 3000);
                }
            } catch (err) {
                await _updateAndRender(recordingId, `❌ ERROR: ${err.message}`);
                setStatus('error');
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
    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
    isRecording = false;
    elements.recordBtn.setAttribute('aria-pressed', 'false');
    log('⏹️ Recording stopped.', 'info');
}

// ─── Save Helpers ─────────────────────────────────────────────────────
async function _saveAndRender(id, blob, initialText, timestamp) {
    try {
        await saveRecording(id, blob, initialText, timestamp);
        recordings = await loadRecordings();
        renderHistory();
        elements.historySection.style.display = 'block';
    } catch (e) { log(`⚠️ Could not save: ${e.message}`, 'warn'); }
}

async function _updateAndRender(id, text) {
    try {
        await updateRecordingText(id, text);
        recordings = await loadRecordings();
        renderHistory();
    } catch (e) { log(`⚠️ Could not update: ${e.message}`, 'warn'); }
}

// ─── UI State ─────────────────────────────────────────────────────────
function setStatus(state) {
    if (pill) pill.setState(state);
    const messages = { recording: '🔴 Recording...', processing: '🤖 Thinking...', success: '✅ Done!', error: '❌ Error', idle: 'Tap the pill to record' };
    if (elements.recordStatus) elements.recordStatus.textContent = messages[state] || messages.idle;
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
    if (!list) return;
    list.innerHTML = '';
    recordings.slice(0, 30).forEach((rec) => {
        const isFailed = rec.text?.startsWith('❌') || rec.text?.startsWith('⏳');
        const card = document.createElement('div');
        card.className = 'history-card' + (isFailed ? ' history-card-failed' : '');
        const ts = new Date(rec.timestamp).toLocaleString();
        card.innerHTML = `<div class="history-header"><span class="history-time">${ts}</span><div class="history-actions">${rec.blob ? `<button class="btn btn-small history-play-btn" data-id="${rec.id}">▶ Play</button>` : ''}<button class="btn btn-small history-reprocess-btn" data-id="${rec.id}">🔄 Reprocess</button><button class="btn btn-small history-copy-btn" data-text="${escapeAttr(rec.text)}" ${isFailed ? 'disabled' : ''}>📋 Copy</button><button class="btn btn-small history-delete-btn" data-id="${rec.id}">🗑</button></div></div><div class="history-text ${isFailed ? 'failed-text' : ''}">${escapeHtml(rec.text)}</div>`;
        if (rec.blob) card.querySelector('.history-play-btn')?.addEventListener('click', () => playBlob(rec.blob, rec.id));
        card.querySelector('.history-reprocess-btn')?.addEventListener('click', () => reprocessRecording(rec.id));
        card.querySelector('.history-copy-btn')?.addEventListener('click', () => { if (!isFailed) navigator.clipboard.writeText(rec.text).then(() => showToast('📋 Copied!')); });
        card.querySelector('.history-delete-btn')?.addEventListener('click', async () => {
            await deleteRecording(rec.id);
            recordings = recordings.filter(r => r.id !== rec.id);
            renderHistory();
        });
        list.appendChild(card);
    });
}

const _activePlayers = {};
function playBlob(blob, id) {
    if (_activePlayers[id]) { _activePlayers[id].pause(); delete _activePlayers[id]; return; }
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    _activePlayers[id] = audio;
    audio.play();
    audio.onended = () => { URL.revokeObjectURL(url); delete _activePlayers[id]; };
}

async function reprocessRecording(id) {
    const rec = recordings.find(r => r.id === id);
    if (!rec?.blob) { showToast('⚠️ No audio saved'); return; }
    const config = getActiveConfig();
    const modelId = elements.modelSelect?.value || 'gemini-2.0-flash';
    log(`🔄 Reprocessing recording...`, 'info');
    await _updateAndRender(id, '⏳ Reprocessing...');
    try {
        const text = await transcribeWithGemini(rec.blob, config, modelId, log);
        if (text) {
            await _updateAndRender(id, text);
            elements.outputText.textContent = text;
            elements.outputSection.style.display = 'block';
            elements.outputSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            showToast('✅ Reprocessed!');
        } else {
            await _updateAndRender(id, '❌ REPROCESS FAILED');
        }
    } catch (err) {
        await _updateAndRender(id, `❌ ERROR: ${err.message}`);
    }
}

// ─── Log ──────────────────────────────────────────────────────────────
export function log(message, level = 'info') {
    const logEl = elements.logOutput;
    if (!logEl) return;
    const colors = { info: '#888', success: '#2ed573', error: '#ff4757', warn: '#ffa502' };
    const line = document.createElement('div');
    line.style.color = colors[level] || '#888';
    line.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    logEl.appendChild(line);
    logEl.scrollTop = logEl.scrollHeight;
}

function showToast(msg) {
    elements.toast.textContent = msg;
    elements.toast.classList.add('show');
    setTimeout(() => elements.toast.classList.remove('show'), 2500);
}

function escapeHtml(text = '') { return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function escapeAttr(text = '') { return text.replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
