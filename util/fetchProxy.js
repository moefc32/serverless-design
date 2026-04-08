import fetch from './fetch.js';

export default async function (proxyUrl, serviceSecret, body) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = crypto.randomUUID();

    const u = new URL(proxyUrl);
    const path = u.pathname === '/' ? '/api' : u.pathname;
    const fullPath = path + u.search;

    const payload = `POST:${fullPath}:${timestamp}:${nonce}`;

    const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(serviceSecret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );

    const sigBuffer = await crypto.subtle.sign(
        'HMAC',
        key,
        new TextEncoder().encode(payload)
    );

    const signature = [...new Uint8Array(sigBuffer)]
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

    return fetch(proxyUrl, {
        method: 'POST',
        body: body ? JSON.stringify(body) : undefined,
        headers: {
            'Content-Type': 'application/json',
            'x-nonce': nonce,
            'x-path': fullPath,
            'x-signature': signature,
            'x-timestamp': timestamp,
        },
    });
}
