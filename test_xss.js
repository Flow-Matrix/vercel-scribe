// test_xss.js

function escapeHtml(text = '') {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const maliciousTimestamp = "2023-10-27T10:00:00Z<img src=x onerror=alert('XSS')>";

// This simulates the behavior of the vulnerability
function vulnerableRender(timestamp) {
    const ts = new Date(timestamp).toLocaleString();

    // In some Javascript engines / locales, an invalid Date string might
    // return "Invalid Date" or pass through the invalid parts.
    // If we assume a custom or manipulated Date object or string that
    // bypassed standard Date parsing and retained the payload,
    // or if `rec.timestamp` was used directly instead of new Date().toLocaleString()

    // Let's just test the escaping of the raw payload to prove it works
    const rawPayload = timestamp;

    return `<span class="history-time">${rawPayload}</span>`;
}

// This simulates the fixed behavior
function secureRender(timestamp) {
    const rawPayload = timestamp;
    return `<span class="history-time">${escapeHtml(rawPayload)}</span>`;
}


console.log("Vulnerable Render:", vulnerableRender(maliciousTimestamp));
console.log("Secure Render:    ", secureRender(maliciousTimestamp));

const isSafe = secureRender(maliciousTimestamp).includes('&lt;img src=x onerror=alert(&#39;XSS&#39;)&gt;')
               || secureRender(maliciousTimestamp).includes('&lt;img src=x onerror=alert(\'XSS\')&gt;');

if (isSafe) {
    console.log("✅ The payload is successfully escaped.");
} else {
    console.error("❌ The payload is NOT escaped properly.");
}
