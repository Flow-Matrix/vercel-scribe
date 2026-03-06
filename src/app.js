// Main application logic — FlashScribe Web (Pill Edition)
import { initDB, saveRecording, loadRecordings } from './storage.js';
import { transcribeWithGemini } from './gemini.js';

// ─── State ───────────────────────────────────────────────────────────
let mediaRecorder = null;
let isRecording = false;
let recordings = [];
let elements = {};
let visualizer = null;

// ─── Visualizer Class ───
class Visualizer {
    constructor(container, dot, label, pill) {
        this.container = container;
        this.dot = dot;
        this.label = label;
        this.pill = pill;
        this.bars = [];
        this.audioContext = null;
        this.analyser = null;
        this.dataArray = null;
        this.animationId = null;
        this.state = 'ready'; // ready, recording, processing, success, error
        this.currentHeights = new Array(40).fill(2);
        this.targetHeights = new Array(40).fill(2);

        this._initBars();
    }

    _initBars() {
        this.container.innerHTML = '';
        for (let i = 0; i < 40; i++) {
            const bar = document.createElement('div');
            bar.className = 'vis-bar';
            this.container.appendChild(bar);
            this.bars.push(bar);
        }
    }

    setState(state, customLabel = null) {
        this.state = state;
        const stateLabels = {
            ready: 'Ready',
            recording: 'Recording...',
            processing: 'Thinking...',
            success: 'Transcribed!',
            error: 'Failed'
        };

        this.label.textContent = customLabel || stateLabels[state] || 'Ready';

        // Update pill class for CSS state styling
        this.pill.className = `pill-recorder state-${state}`;

        if (state === 'processing') {
            this._startProcessingAnim();
        } else if (state === 'ready' || state === 'success' || state === 'error') {
            this._stopAnim();
        }
    }

    async startLive(stream) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = this.audioContext.createMediaStreamSource(stream);
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 256;
        source.connect(this.analyser);

        this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        this.setState('recording');
        this._animate();
    }

    _animate() {
        if (this.state !== 'recording') return;

        this.analyser.getByteFrequencyData(this.dataArray);

        // Map FFT bins to 40 bars (using a subset of lower frequencies for better look)
        for (let i = 0; i < 40; i++) {
            const val = this.dataArray[i * 2] || 0;
            const target = Math.max(4, (val / 255) * 36);
            this.currentHeights[i] += (target - this.currentHeights[i]) * 0.4;

            const h = this.currentHeights[i];
            this.bars[i].style.height = `${h}px`;

            if (h > 6) {
                const rel = Math.min(1, (h - 4) / 30);
                this.bars[i].style.background = `rgb(${Math.floor(50 + 155 * rel)}, ${Math.floor(10 + 20 * rel)}, ${Math.floor(20 + 30 * rel)})`;
            } else {
                this.bars[i].style.background = '#222';
            }
        }

        this.animationId = requestAnimationFrame(() => this._animate());
    }

    _startProcessingAnim() {
        this._stopAnim();
        const loop = () => {
            const now = performance.now() / 1000;
            for (let i = 0; i < 40; i++) {
                const phase = now * 8 - i * 0.15;
                const h = 10 + Math.sin(phase) * 6;
                this.bars[i].style.height = `${h}px`;
                this.bars[i].style.background = '#443311';
            }
            this.animationId = requestAnimationFrame(loop);
        };
        loop();
    }

    _stopAnim() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }

        // Reset bars
        this.bars.forEach(bar => {
            bar.style.height = this.state === 'success' ? '12px' : '4px';
            bar.style.background = this.state === 'success' ? '#114411' : '#222';
        });
    }
}

// ─── Init ─────────────────────────────────────────────────────────────
export function initApp() {
    cacheElements();
    setupEventListeners();

    // Initialize Visualizer
    visualizer = new Visualizer(
        elements.visualizerContainer,
        elements.statusDot,
        elements.statusLabel,
        elements.pillRecorder
    );

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
        // Pill Elements
        pillRecorder: document.getElementById('pillRecorder'),
        statusDot: document.getElementById('statusDot'),
        statusLabel: document.getElementById('statusLabel'),
        visualizerContainer: document.getElementById('visualizerContainer')
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

            visualizer.setState('processing');
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

                    visualizer.setState('success');
                    log('✅ Transcription complete!', 'success');
                    showToast('✅ Transcribed!');

                    // Reset to ready after 2s
                    setTimeout(() => {
                        if (visualizer.state === 'success') visualizer.setState('ready');
                    }, 2000);
                } else {
                    visualizer.setState('error', 'No text');
                    log('❌ No transcription returned.', 'error');
                }
            } catch (err) {
                visualizer.setState('error');
                log(`❌ Error: ${err.message}`, 'error');
            }
        };

        mediaRecorder.start();
        isRecording = true;
        visualizer.startLive(stream);
        log('🎤 Recording started...', 'info');
    } catch (err) {
        log(`❌ Mic access failed: ${err.message}`, 'error');
        visualizer.setState('error');
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }
    isRecording = false;
    log('⏹️ Recording stopped. Sending to Gemini...', 'info');
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
