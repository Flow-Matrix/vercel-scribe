// api/get_keys.js — Vercel Edge Function
// Validates a secret passcode and returns the corresponding Gemini API keys.
// Keys and passcodes are stored in Vercel Environment Variables (invisible to public).

export const config = { runtime: 'edge' };

export default async function handler(request) {
    // Only accept POST
    if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    try {
        const { passcode } = await request.json();

        if (!passcode || typeof passcode !== 'string') {
            return new Response(JSON.stringify({ error: 'Missing passcode' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // ── Sanitize input: remove spaces, make lowercase ────────────────
        const cleanPasscode = passcode.trim().toLowerCase();

        // ── Primary passcode: returns ALL keys ──────────────────────────
        const rawPrimary = process.env.SECRET_PASSCODE_PRIMARY || '';
        const primaryPass = rawPrimary.trim().toLowerCase();

        // ── Secondary passcode: returns only Key 5 ─────────────────────
        const rawSecondary = process.env.SECRET_PASSCODE_SECONDARY || '';
        const secondaryPass = rawSecondary.trim().toLowerCase();

        let keys = [];

        if (primaryPass && cleanPasscode === primaryPass) {
            // Collect all GEMINI_API_KEY_* env vars (1 through 10, flexible)
            for (let i = 1; i <= 10; i++) {
                const key = process.env[`GEMINI_API_KEY_${i}`];
                if (key) keys.push(key.trim());
            }
        } else if (secondaryPass && cleanPasscode === secondaryPass) {
            // Only return key 5
            const key5 = process.env.GEMINI_API_KEY_5;
            if (key5) keys.push(key5.trim());
        } else {
            return new Response(JSON.stringify({ error: 'Invalid passcode' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        if (keys.length === 0) {
            return new Response(JSON.stringify({ error: 'No API keys configured on server' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        return new Response(JSON.stringify({ keys, count: keys.length }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (err) {
        return new Response(JSON.stringify({ error: 'Bad request' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}
