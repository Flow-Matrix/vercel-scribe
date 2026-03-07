// Gemini Transcription Engine — Smart Quota & Model Rotation
// Mirrors FlashScribe Pro pipeline with multi-key rotation and model degradation.

const SYSTEM_INSTRUCTION = `### ROLE:
You are an expert **Multilingual Interpreter and Technical Scribe**. Your goal is process mixed Hindi/English (Hinglish) or pure Hindi audio and output a **100% English transcription** that preserves technical accuracy and cleans up speech errors.

### CORE DIRECTIVES:

1.  **LANGUAGE NORMALIZATION (TRANSLATION LAYER):**
    * **Target Language:** The final output must be **strictly English**.
    * **Hinglish/Hindi Input:** If the user speaks in Hindi or mixes Hindi with English, translate the non-English parts into natural, grammatically correct English.
    * **Sentiment Retention:** Capture the original intent and tone. Do not sanitize emotions.

2.  **ENTITY PRESERVATION (THE "GOD RULE"):**
    * **Technical Integrity:** **Freeze** technical terms, model names, version numbers, and proper nouns.
    * **Trust the Audio:** If the user says "Gemini 3 Flash," keep it exactly as "Gemini 3 Flash." Do NOT translate or "correct" specific entities based on internal knowledge.

3.  **INTELLIGENT VERBATIM & CLEANUP (UPDATED):**
    * **False Starts (The "We Are... We Were" Rule):** If the user stumbles and immediately corrects a word or phrase, **discard the error** and transcribe only the correction.
        * *Input:* "Yes, we are we were anyway..."
        * *Output:* "Yes, we were anyway..."
    * **Deliberate Changes:** If the user completes a thought and *then* changes their mind, keep the context ONLY if it is necessary for the record. Otherwise, favor the final decision.
    * **Filler Words:** Remove pure fillers (e.g., "um," "uh," "matlab/like") unless they carry meaning.

### ABSOLUTE PROHIBITIONS:
* **DO NOT** output Hindi text or Romanized Hindi.
* **DO NOT** summarize thoughts; translate sentence-by-sentence.
* **DO NOT** include stuttering repetitions (e.g., do NOT write "I... I went").

### OUTPUT FORMAT:
* You must output the final transcription inside a Markdown code block (using triple backticks).
* Example format:
\`\`\`text
[The transcribed text goes here]
\`\`\``;

// ── Model Degradation Fallback Order ─────────────────────────────────
// When the selected model fails on ALL keys, the system degrades to the
// next model in this list and retries all keys again.
const MODEL_FALLBACK_ORDER = [
    'gemini-3.1-flash',
    'gemini-3.0-flash',
    'gemini-3.0-pro',
    'gemini-2.5-flash',
    'gemini-2.5-pro',
    'gemini-2.0-flash',
    'gemini-1.5-flash',
];

/**
 * Transcribe audio with smart multi-key rotation and model degradation.
 *
 * @param {Blob}            audioBlob   - The recorded/uploaded audio blob
 * @param {string|string[]} apiKeys     - Single key string OR array of keys
 * @param {string}          modelId     - Currently selected Gemini model
 * @param {function}        log         - Logging callback
 * @returns {Promise<string>} Transcribed text
 */
export async function transcribeWithGemini(audioBlob, apiKeys, modelId = 'gemini-2.5-flash', log) {
    // Normalize to array
    const keys = Array.isArray(apiKeys) ? apiKeys : [apiKeys];

    // Convert blob to base64 once (reused across all retries)
    const base64Audio = await blobToBase64(audioBlob);
    const mimeType = audioBlob.type || 'audio/webm';

    // Build the list of models to try, starting from the user's selected model
    const modelsToTry = buildFallbackChain(modelId);

    log(`🤖 Sending audio to Gemini (${keys.length} key(s), model: ${modelId})...`, 'info');

    for (const model of modelsToTry) {
        // Track whether this model returned a "not found / invalid" error on ALL keys
        let allKeysRejectedModel = true;

        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            const keyLabel = keys.length > 1 ? `Key ${i + 1}/${keys.length}` : 'Key';

            try {
                log(`🤖 Trying ${model} with ${keyLabel}...`, 'info');
                const result = await _callGeminiAPI(base64Audio, mimeType, key, model);
                log(`✅ ${model} succeeded with ${keyLabel}`, 'success');
                return result;

            } catch (err) {
                const status = err.httpStatus || 0;

                if (status === 429) {
                    // ── Quota exhausted on this key → try next key, same model ──
                    log(`⚠️ ${keyLabel} quota exhausted (429). Rotating...`, 'warn');
                    allKeysRejectedModel = false; // model itself is valid
                    continue;
                }

                if (status === 404 || status === 400) {
                    // ── Model not found / invalid on this key ──
                    log(`⚠️ ${model} not available on ${keyLabel} (${status}). Trying next key...`, 'warn');
                    continue;
                }

                // ── Other unexpected error → still try next key ──
                log(`⚠️ ${keyLabel} error: ${err.message}. Trying next key...`, 'warn');
                allKeysRejectedModel = false;
                continue;
            }
        }

        // If we exhausted all keys for this model:
        if (allKeysRejectedModel && modelsToTry.length > 1) {
            log(`🔄 ${model} rejected by all keys. Degrading to next model...`, 'warn');
        } else if (!allKeysRejectedModel) {
            // All keys were quota-exhausted (429) for a valid model → no point trying lower models
            log(`❌ All ${keys.length} keys exhausted for ${model}.`, 'error');
        }
    }

    throw new Error(`All ${keys.length} key(s) and ${modelsToTry.length} model(s) exhausted. Please try again later or add more API keys.`);
}

// ─── Internal: Single API Call ────────────────────────────────────────

async function _callGeminiAPI(base64Audio, mimeType, apiKey, modelId) {
    const payload = {
        system_instruction: {
            parts: [{ text: SYSTEM_INSTRUCTION }]
        },
        contents: [
            {
                role: 'user',
                parts: [
                    {
                        inline_data: {
                            mime_type: mimeType,
                            data: base64Audio
                        }
                    }
                ]
            }
        ],
        generationConfig: {
            temperature: 0.1
        }
    };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;
    const start = performance.now();

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const errMsg = errData?.error?.message || `HTTP ${response.status}`;
        const error = new Error(`Gemini API error (${modelId}): ${errMsg}`);
        error.httpStatus = response.status;
        throw error;
    }

    const data = await response.json();
    const elapsed = ((performance.now() - start) / 1000).toFixed(2);

    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const result = extractCodeBlock(rawText);

    if (!result) {
        throw new Error(`Empty response from ${modelId}`);
    }

    return result;
}

// ─── Build Fallback Chain ─────────────────────────────────────────────
// Starts from the user's selected model and includes all models below it
// in the fallback order. If the selected model isn't in the predefined
// list (e.g. a custom model), it goes first, then the full fallback list.

function buildFallbackChain(selectedModel) {
    const idx = MODEL_FALLBACK_ORDER.indexOf(selectedModel);

    if (idx >= 0) {
        // Start from the selected model and go down
        return MODEL_FALLBACK_ORDER.slice(idx);
    }

    // Custom model → try it first, then the full fallback list
    return [selectedModel, ...MODEL_FALLBACK_ORDER];
}

// ─── Helpers ──────────────────────────────────────────────────────────

function extractCodeBlock(text) {
    const match = text.match(/```(?:[a-zA-Z]*\n)?([\s\S]*?)```/);
    return match ? match[1].trim() : text.trim();
}

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64 = reader.result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}
