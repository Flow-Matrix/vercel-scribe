// Gemini Transcription Engine — Smart Quota, Model Rotation, and Vertex AI Support
// Supports: AI Studio (API Key) and Vertex AI (Service Account) with thinking budget.

const SYSTEM_INSTRUCTION = `### ROLE:
You are an expert **Multilingual Interpreter and Technical Scribe**. Your goal is process mixed Hindi/English (Hinglish) or pure Hindi audio and output a **100% English transcription** that preserves technical accuracy and cleans up speech errors.

### CORE DIRECTIVES:
1. **LANGUAGE NORMALIZATION**: Output must be **strictly English**.
2. **ENTITY PRESERVATION**: Freeze technical terms, model names, and proper nouns.
3. **INTELLIGENT CLEANUP**: Remove false starts and filler words.

### ABSOLUTE PROHIBITIONS:
* DO NOT output Hindi text or Romanized Hindi.
* DO NOT include stuttering repetitions.

### OUTPUT FORMAT:
* Output final transcription inside a Markdown code block (\`\`\`text ... \`\`\`).`;

const MODEL_FALLBACK_ORDER = [
    'gemini-2.0-pro-exp-02-05',
    'gemini-2.0-flash-thinking-exp-01-21',
    'gemini-2.0-flash-exp',
    'gemini-2.0-flash',
    'gemini-1.5-pro',
    'gemini-1.5-flash',
    'gemini-1.5-flash-8b',
];

/**
 * Transcribe audio with smart multi-key rotation and model degradation.
 * @param {Blob} audioBlob
 * @param {Object} config - { mode: 'studio'|'vertex', keys: [], projectId, serviceAccount, thinkingLevel }
 * @param {string} modelId
 * @param {function} log
 */
export async function transcribeWithGemini(audioBlob, config, modelId = 'gemini-2.0-flash', log) {
    const base64Audio = await blobToBase64(audioBlob);
    const mimeType = audioBlob.type || 'audio/webm';
    const modelsToTry = buildFallbackChain(modelId);

    log(`🤖 Sending to Gemini (Mode: ${config.mode}, Model: ${modelId})...`, 'info');

    // For Vertex AI, we fetch the token once per transcription attempt
    let accessToken = null;
    if (config.mode === 'vertex') {
        try {
            log('🔐 Generating Vertex AI access token...', 'info');
            accessToken = await getVertexAccessToken(config.serviceAccount);
            log('✅ Access token generated.', 'success');
        } catch (err) {
            log(`❌ Token error: ${err.message}`, 'error');
            throw err;
        }
    }

    for (const model of modelsToTry) {
        if (config.mode === 'vertex') {
            try {
                log(`🤖 Trying ${model} (Vertex)...`, 'info');
                return await _callVertexAPI(base64Audio, mimeType, accessToken, config.projectId, model, config.thinkingLevel);
            } catch (err) {
                log(`⚠️ ${model} failed (Vertex): ${err.message}`, 'warn');
                continue;
            }
        } else {
            // AI Studio Multi-key rotation
            const keys = config.keys || [];
            if (keys.length === 0) throw new Error("No API keys found for AI Studio");

            for (let i = 0; i < keys.length; i++) {
                const key = keys[i];
                try {
                    log(`🤖 Trying ${model} (Studio Key ${i + 1})...`, 'info');
                    return await _callStudioAPI(base64Audio, mimeType, key, model, config.thinkingLevel);
                } catch (err) {
                    if (err.httpStatus === 429) {
                        log(`⚠️ Key ${i + 1} quota exhausted. Rotating...`, 'warn');
                        continue;
                    }
                    log(`⚠️ Key ${i + 1} error: ${err.message}`, 'warn');
                }
            }
        }
    }

    throw new Error(`All models/keys exhausted. Mode: ${config.mode}`);
}

// ─── API Callers ──────────────────────────────────────────────────────

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent?key=${apiKey}`;
    const start = performance.now();

async function _callVertexAPI(base64Audio, mimeType, token, projectId, modelId, thinkingLevel) {
    const payload = buildPayload(base64Audio, mimeType, modelId, thinkingLevel);
    // Vertex AI uses the global endpoint for preview/exp models as per the guide
    const url = `https://aiplatform.googleapis.com/v1beta1/projects/${projectId}/locations/global/publishers/google/models/${modelId}:generateContent`;
    return await _doFetch(url, payload, modelId, token);
}

function buildPayload(base64Audio, mimeType, modelId, thinkingLevel) {
    const payload = {
        system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents: [{ role: 'user', parts: [{ inline_data: { mime_type: mimeType, data: base64Audio } }] }],
        generationConfig: { temperature: 0.1 }
    };
    // Add Thinking Config if supported and selected
    if (thinkingLevel > 0 && (modelId.includes('thinking') || modelId.includes('pro') || modelId.includes('flash')) && !modelId.includes('lite')) {
        payload.thinking_config = { include_thoughts: true, luxury_thinking_budget: thinkingLevel };
        // Thinking models often require temperature 1.0 or specific settings, but 0.1 is usually safe for structured output
    }
    return payload;
}

async function _doFetch(url, payload, modelId, token = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const error = new Error(errData?.error?.message || `HTTP ${res.status}`);
        error.httpStatus = res.status;
        throw error;
    }
    const data = await res.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const result = extractCodeBlock(rawText);
    if (!result) throw new Error(`Empty response from ${modelId}`);
    return result;
}

// ─── Vertex Token Generation (Web Crypto) ──────────────────────────────

async function getVertexAccessToken(saJsonString) {
    const sa = JSON.parse(saJsonString);
    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + 3600;

    const header = { alg: "RS256", typ: "JWT" };
    const payload = {
        iss: sa.client_email,
        sub: sa.client_email,
        aud: "https://oauth2.googleapis.com/token",
        iat: iat,
        exp: exp,
        scope: "https://www.googleapis.com/auth/cloud-platform"
    };

    const encodedHeader = b64(JSON.stringify(header));
    const encodedPayload = b64(JSON.stringify(payload));
    const unsignedToken = `${encodedHeader}.${encodedPayload}`;

    const signature = await signRS256(unsignedToken, sa.private_key);
    const jwt = `${unsignedToken}.${signature}`;

    const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
            assertion: jwt
        })
    });

    if (!res.ok) {
        const data = await res.json();
        throw new Error(`Auth failed: ${data.error_description || data.error}`);
    }
    const data = await res.json();
    return data.access_token;
}

async function signRS256(message, pem) {
    const pemHeader = "-----BEGIN PRIVATE KEY-----";
    const pemFooter = "-----END PRIVATE KEY-----";
    const pemContents = pem.substring(pemHeader.length, pem.length - pemFooter.length).replace(/\s/g, "");
    const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));

    const key = await crypto.subtle.importKey(
        "pkcs8",
        binaryDer,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["sign"]
    );

    const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(message));
    return b64url(signature);
}

function b64(str) { return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function b64url(buf) {
    return btoa(String.fromCharCode(...new Uint8Array(buf)))
        .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ─── Fallback Helpers ──────────────────────────────────────────────────

function buildFallbackChain(selectedModel) {
    const idx = MODEL_FALLBACK_ORDER.indexOf(selectedModel);
    if (idx >= 0) return MODEL_FALLBACK_ORDER.slice(idx);
    return [selectedModel, ...MODEL_FALLBACK_ORDER];
}

function extractCodeBlock(text) {
    const match = text.match(/```(?:[a-zA-Z]*\n)?([\s\S]*?)```/);
    return match ? match[1].trim() : text.trim();
}

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}
