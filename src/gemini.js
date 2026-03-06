// Gemini 2.5 Flash - Audio Transcription Engine
// Mirrors the FlashScribe Pro pipeline exactly

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

/**
 * Transcribe audio blob using Gemini 2.5 Flash via REST API.
 * Mirrors the GeminiBrain.transcribe_audio() method from FlashScribe Pro.
 *
 * @param {Blob} audioBlob - The recorded audio blob
 * @param {string} apiKey - Google Gemini API key
 * @param {string} modelId - Gemini model ID (default: gemini-2.5-flash)
 * @param {function} log - Logging callback
 * @returns {Promise<string>} - Transcribed text
 */
export async function transcribeWithGemini(audioBlob, apiKey, modelId = 'gemini-2.5-flash', log) {
    log('🤖 Sending audio to Gemini...', 'info');

    // Convert blob to base64
    const base64Audio = await blobToBase64(audioBlob);
    const mimeType = audioBlob.type || 'audio/webm';

    // Build request payload — mirrors the Python google-genai SDK structure
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

    log(`🤖 Calling ${modelId}...`, 'info');
    const start = performance.now();

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const errMsg = errData?.error?.message || `HTTP ${response.status}`;
        throw new Error(`Gemini API error: ${errMsg}`);
    }

    const data = await response.json();
    const elapsed = ((performance.now() - start) / 1000).toFixed(2);
    log(`🤖 Response in ${elapsed}s from ${modelId}`, 'success');

    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return extractCodeBlock(rawText);
}

/**
 * Extract text from a markdown code block — same logic as GeminiBrain._extract_code_block()
 */
function extractCodeBlock(text) {
    const match = text.match(/```(?:[a-zA-Z]*\n)?([\s\S]*?)```/);
    return match ? match[1].trim() : text.trim();
}

/**
 * Convert a Blob to base64 string (data URI, strip the prefix)
 */
function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            // Strip "data:audio/webm;base64," prefix
            const base64 = reader.result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}
