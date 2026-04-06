import { Hono } from 'hono';
import { XMLParser } from 'fast-xml-parser';
import corsHeaders from './corsHeaders.js';

import {
    baseDuration,
    cacheControl,
} from '../util/cache.js';
import fetch from '../util/fetch.js'
import sendResponse from '../util/sendResponse.js';

const app = new Hono();
const cache = caches.default;

app.options('/', (c) => {
    return new Response(null, { headers: corsHeaders });
});

app.get('/', async (c) => {
    const env = c.env;
    const ctx = c.executionCtx;
    const cacheKey = new Request(c.req.url, {
        method: 'GET',
    });

    try {
        if (c.req.query('refresh') === 'true') {
            await cache.delete(cacheKey);
        } else {
            const cachedResponse = await cache.match(cacheKey);
            if (cachedResponse) return cachedResponse;
        }

        const behance_id = env.CONFIG_BEHANCE_ID;
        const behance_key = env.CONFIG_BEHANCE_KEY;
        const behance_proxy = env.CONFIG_BEHANCE_PROXY;
        const dribbble_id = env.CONFIG_DRIBBBLE_ID;
        const dribbble_key = env.CONFIG_DRIBBBLE_KEY;
        const youtube_id = env.CONFIG_YOUTUBE_ID;
        const youtube_key = env.CONFIG_YOUTUBE_KEY;

        if (
            !behance_id ||
            !behance_key ||
            !behance_proxy ||
            !dribbble_id ||
            !dribbble_key ||
            !youtube_id ||
            !youtube_key
        ) {
            return sendResponse({
                message: 'Missing environment variable(s)!',
            }, 500);
        }

        const result = {
            behance: {
                projects: [],
                url: `https://behance.net/${behance_id}`,
            },
            dribbble: {
                projects: [],
                url: `https://dribbble.com/${dribbble_id}`,
            },
            youtube: {
                videos: [],
                url: `https://youtube.com/${youtube_id}`,
            },
        }

        const response = await Promise.allSettled([
            (async () => {
                try {
                    const cached = await env.KV_CACHE
                        .get(`design:behance`, { type: 'json' });

                    if (cached) {
                        result.behance.projects = cached;
                        return;
                    }

                    const behanceResponse = await fetch(behance_proxy, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            behance_id,
                            behance_key,
                        }),
                    });

                    if (!behanceResponse?.ok) {
                        const code = behanceResponse.status;
                        const text = await behanceResponse.text();

                        throw new Error(`Behance API failed (${code}): ${text}`);
                    }

                    const { data } = await behanceResponse.json();

                    const formattedData = ([].concat(data || [])
                        .slice(0, 12) || [])
                        .map((p) => ({
                            id: p.id,
                            title: p.name,
                            image: p.covers[404],
                            url: p.url,
                        }));

                    await env.KV_CACHE.put(`design:behance`,
                        JSON.stringify(formattedData), {
                        expirationTtl: baseDuration * 28,
                    });

                    result.behance.projects = formattedData;
                } catch (e) {
                    console.error(e);
                    return null;
                }
            })(),

            (async () => {
                try {
                    const cached = await env.KV_CACHE
                        .get(`design:dribbble`, { type: 'json' });

                    if (cached) {
                        result.dribbble.projects = cached;
                        return;
                    }

                    const dribbbleResponse = await fetch(
                        `https://api.dribbble.com/v2/user/shots?access_token=${dribbble_key}`
                    );

                    if (!dribbbleResponse?.ok) {
                        const code = dribbbleResponse.status;
                        const text = await dribbbleResponse.text();

                        throw new Error(`Dribbble API failed (${code}): ${text}`);
                    }

                    const data = await dribbbleResponse.json();

                    const formattedData = ([].concat(data || [])
                        .slice(0, 12) || [])
                        .map((p) => ({
                            id: p.id,
                            title: p.title,
                            image: p.images.normal,
                            url: p.html_url,
                        }));

                    await env.KV_CACHE.put(`design:dribbble`,
                        JSON.stringify(formattedData), {
                        expirationTtl: baseDuration * 28,
                    });

                    result.dribbble.projects = formattedData;
                } catch (e) {
                    console.error(e);
                    return null;
                }
            })(),

            (async () => {
                try {
                    const cached = await env.KV_CACHE
                        .get(`design:youtube`, { type: 'json' });

                    if (cached) {
                        result.youtube.videos = cached;
                        return;
                    }

                    const youtubeResponse = await fetch(
                        `https://www.youtube.com/feeds/videos.xml?channel_id=${youtube_key}`
                    );

                    if (!youtubeResponse?.ok) {
                        const code = youtubeResponse.status;
                        const text = await youtubeResponse.text();

                        throw new Error(`YouTube API failed (${code}): ${text}`);
                    }

                    const xml = await youtubeResponse.text();
                    const parser = new XMLParser();
                    const data = parser.parse(xml);

                    const formattedData = ([].concat(data.feed.entry || [])
                        .slice(0, 6) || [])
                        .map((p) => ({
                            id: p['yt:videoId'],
                            title: p.title,
                            image: `https://img.youtube.com/vi/${p['yt:videoId']}/maxresdefault.jpg`,
                            url: `https://www.youtube.com/watch?v=${p['yt:videoId']}`,
                        }));

                    await env.KV_CACHE.put(`design:youtube`,
                        JSON.stringify(formattedData), {
                        expirationTtl: baseDuration * 28,
                    });

                    result.youtube.videos = formattedData;
                } catch (e) {
                    console.error(e);
                    return null;
                }
            })()
        ]);

        const cachedData = sendResponse({
            message: 'Fetch data success.',
            data: result,
        }, 200, {
            ...cacheControl,
        });

        if (response.every(r => r.status === 'fulfilled')) {
            ctx.waitUntil(cache.put(cacheKey, cachedData.clone()));
        }

        return cachedData;
    } catch (e) {
        return sendResponse({
            message: e.message,
        }, 500);
    }
});

app.delete('/', async (c) => {
    const cacheKey = new Request(c.req.url, {
        method: 'GET',
    });

    await cache.delete(cacheKey);
    return sendResponse(null, 204);
});

app.all('*', () => {
    return sendResponse({
        message: 'Method not allowed!',
    }, 405);
});

export default {
    fetch: app.fetch,
    async scheduled(evt, env, ctx) {
        try {
            const url = new URL('/', env.BASE_URL);
            const hour = new Date(evt.scheduledTime).getUTCHours();
            if (hour === 4) url.searchParams.set('refresh', 'true');

            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Cloudflare-Cron-Job',
                },
            });

            if (response.ok) {
                console.log('[Cron] Edge cache warmed successfully.');
            } else {
                console.error('[Cron] Warming failed:', response.status);
            }
        } catch (e) {
            console.error(`[Cron] Execution error: ${e.message}`);
        }
    },
};
