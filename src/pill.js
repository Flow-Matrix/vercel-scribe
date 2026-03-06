/**
 * pill.js — FlashScribe Pill Animation (Browser Port)
 *
 * Direct port of the FloatingPill class from flashscribe.py.
 * Uses Web Audio API AnalyserNode for real-time mic frequency data.
 *
 * States: 'idle' | 'recording' | 'processing' | 'success' | 'error'
 */

const NUM_BARS = 40;
const PILL_W = 380;
const PILL_H = 56;
const CORNER_R = 22;

export class ScribePill {
    constructor(canvasEl) {
        this.canvas = canvasEl;
        this.ctx = canvasEl.getContext('2d');
        this.state = 'idle';

        // Bar animation state (mirrors Python float lists)
        this.currentHeights = new Array(NUM_BARS).fill(2.0);
        this.targetHeights = new Array(NUM_BARS).fill(2.0);

        // Web Audio API refs
        this.analyser = null;
        this.freqData = null;
        this.frequencyBands = new Array(NUM_BARS).fill(0.0);
        this.prevBands = new Array(NUM_BARS).fill(0.0);

        // Animation loop ref
        this._rafId = null;
        this._animating = false;

        this.canvas.width = PILL_W;
        this.canvas.height = PILL_H;

        this._startLoop();
    }

    // ─── Public API ────────────────────────────────────────────────

    /** Call with the MediaStream when recording starts */
    attachStream(mediaStream) {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioCtx.createMediaStreamSource(mediaStream);
        this.analyser = audioCtx.createAnalyser();
        this.analyser.fftSize = 256;
        this.analyser.smoothingTimeConstant = 0.6;
        source.connect(this.analyser);
        this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
        this._audioCtx = audioCtx;
    }

    /** Detach when recording stops */
    detachStream() {
        this.analyser = null;
        this.freqData = null;
        if (this._audioCtx) {
            this._audioCtx.close().catch(() => { });
            this._audioCtx = null;
        }
        this.frequencyBands.fill(0.0);
        this.prevBands.fill(0.0);
    }

    setState(state) {
        this.state = state;
    }

    destroy() {
        this._animating = false;
        if (this._rafId) cancelAnimationFrame(this._rafId);
        this.detachStream();
    }

    // ─── Private: Frequency Band Calculation ──────────────────────
    // Mirrors the _callback() method from AudioEngine in flashscribe.py

    _updateFrequencyBands() {
        if (!this.analyser || !this.freqData) {
            this.frequencyBands.fill(0.0);
            return;
        }

        this.analyser.getByteFrequencyData(this.freqData);

        const nSpec = this.freqData.length;
        // Logarithmic bin mapping (same as Python: np.logspace)
        const alpha = 0.4;

        for (let i = 0; i < NUM_BARS; i++) {
            // Log-spaced bins from index 2..nSpec
            const start = Math.round(Math.pow(10, Math.log10(2) + (i / NUM_BARS) * (Math.log10(nSpec) - Math.log10(2))));
            const end = Math.round(Math.pow(10, Math.log10(2) + ((i + 1) / NUM_BARS) * (Math.log10(nSpec) - Math.log10(2))));

            let sum = 0;
            let count = 0;
            for (let j = Math.max(0, start); j < Math.min(end, nSpec); j++) {
                sum += this.freqData[j] / 255.0;
                count++;
            }
            const rawVal = count > 0 ? sum / count : 0;

            // Mirror Python's smoothing: alpha blend current → prev
            this.frequencyBands[i] = rawVal * alpha + this.prevBands[i] * (1.0 - alpha);
            this.prevBands[i] = this.frequencyBands[i];
        }
    }

    // ─── Private: Render Loop ─────────────────────────────────────
    // Mirrors FloatingPill._animate() from flashscribe.py

    _startLoop() {
        this._animating = true;
        const loop = () => {
            if (!this._animating) return;
            this._frame();
            this._rafId = requestAnimationFrame(loop);
        };
        this._rafId = requestAnimationFrame(loop);
    }

    _frame() {
        const ctx = this.ctx;
        const now = performance.now() / 1000; // seconds, like Python's time.time()
        const W = PILL_W;
        const H = PILL_H;

        // Update freq data every frame during recording
        if (this.state === 'recording') {
            this._updateFrequencyBands();
        }

        // Clear
        ctx.clearRect(0, 0, W, H);

        // ── Draw pill background (rounded rect) ──────────────────
        this._drawPill(ctx, W, H);

        // ── Draw bars ────────────────────────────────────────────
        const barArea = W - 40;   // 20px padding each side
        const barWidth = Math.max(1, barArea / NUM_BARS - 1);
        const centerY = H / 2;

        // Mirror Python: display_levels = list(reversed(levels))
        const displayBands = [...this.frequencyBands].reverse();

        for (let i = 0; i < NUM_BARS; i++) {
            const xPos = 20 + i * (barArea / NUM_BARS);

            if (this.state === 'recording') {
                // ── RECORDING: bars pulse with mic input ──────────
                const val = Math.pow(displayBands[i], 0.7); // gamma correction, same as Python
                this.targetHeights[i] = Math.min(H - 4, 2 + val * (H - 6));
                this.currentHeights[i] += (this.targetHeights[i] - this.currentHeights[i]) * 0.4;
                const h = this.currentHeights[i];

                // Color: dark red → bright red based on height
                let color;
                if (h > 4) {
                    const rel = Math.min(1.0, (h - 4) / (H - 10));
                    const r = Math.round(50 + 155 * rel);
                    const g = Math.round(10 + 20 * rel);
                    const b = Math.round(20 + 30 * rel);
                    color = `rgb(${r},${g},${b})`;
                } else {
                    color = '#1a1a1a';
                }

                ctx.strokeStyle = color;
                ctx.lineWidth = barWidth;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(xPos, centerY - h / 2);
                ctx.lineTo(xPos, centerY + h / 2);
                ctx.stroke();

            } else if (this.state === 'processing') {
                // ── PROCESSING: sine wave ─────────────────────────
                const phase = now * 8 - i * 0.15;
                const h = 10 + Math.sin(phase) * 6;

                ctx.strokeStyle = '#443311';
                ctx.lineWidth = barWidth;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(xPos, centerY - h / 2);
                ctx.lineTo(xPos, centerY + h / 2);
                ctx.stroke();

            } else if (this.state === 'success') {
                // ── SUCCESS: flat bars at center ──────────────────
                ctx.strokeStyle = '#114411';
                ctx.lineWidth = barWidth;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(xPos, H * 0.35);
                ctx.lineTo(xPos, H * 0.65);
                ctx.stroke();

            } else {
                // ── IDLE: bars slowly return to 2px ──────────────
                this.currentHeights[i] += (2.0 - this.currentHeights[i]) * 0.1;
                const h = this.currentHeights[i];

                ctx.strokeStyle = '#1a1a1a';
                ctx.lineWidth = barWidth;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(xPos, centerY - h / 2);
                ctx.lineTo(xPos, centerY + h / 2);
                ctx.stroke();
            }
        }

        // ── Draw recording dot ────────────────────────────────────
        const dotColors = {
            idle: '#444444',
            recording: '#ff4757',
            processing: '#aa8811',
            success: '#2ed573',
            error: '#f44336',
        };
        ctx.fillStyle = dotColors[this.state] || '#444444';
        ctx.beginPath();
        ctx.arc(14, centerY, 4, 0, Math.PI * 2);
        ctx.fill();

        // ── Draw label text ───────────────────────────────────────
        const labels = {
            idle: 'Tap to Record',
            recording: 'Recording...',
            processing: 'Thinking...',
            success: 'Done! ✓',
            error: 'Error — try again',
        };
        ctx.fillStyle = '#e0e0e0';
        ctx.font = '600 11px "Segoe UI", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(labels[this.state] || 'Ready', W / 2, centerY);
    }

    _drawPill(ctx, W, H) {
        const r = CORNER_R;

        // Shadow
        ctx.shadowColor = 'rgba(0,255,157,0.08)';
        ctx.shadowBlur = 20;
        ctx.shadowOffsetY = 4;

        ctx.beginPath();
        ctx.moveTo(r, 0);
        ctx.arcTo(W, 0, W, H, r);
        ctx.arcTo(W, H, 0, H, r);
        ctx.arcTo(0, H, 0, 0, r);
        ctx.arcTo(0, 0, W, 0, r);
        ctx.closePath();

        ctx.fillStyle = '#121212';
        ctx.fill();

        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;

        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        ctx.stroke();
    }
}
