import { Hono } from 'hono';
import { XMLParser } from 'fast-xml-parser';

import corsHeaders from './corsHeaders.js';
import fetch from './fetch.js'
import responseHelper from './responseHelper.js';

const app = new Hono();

const cache = caches.default;
const cacheDuration = 60 * 60 * 12;
const cacheControl = {
    'Cache-Control': `public, max-age=${cacheDuration}, stale-while-revalidate=${cacheDuration}`
}
const cacheKey = new Request('https://internal/cache/serverless-design', {
    method: 'GET',
});

app.options('*', (c) => {
    return new Response(null, { headers: corsHeaders });
});

app.get('*', async (c) => {
    const env = c.env;
    const ctx = c.executionCtx;

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
        const dribbble_key = env.CONFIG_DRIBBBLE_KEY;
        const youtube_id = env.CONFIG_YOUTUBE_ID;

        if (
            !behance_id ||
            !behance_key ||
            !behance_proxy ||
            !dribbble_key ||
            !youtube_id
        ) {
            return responseHelper({
                message: 'Missing environment variable(s)!',
            }, 500);
        }

        const result = {
            behance: [],
            dribbble: [],
            youtube: [],
        }

        const response = await Promise.allSettled([
            (async () => {
                try {
                    const cached = await env.KV_CACHE.get(`design:behance`);
                    if (cached) return result.behance = JSON.parse(cached);

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

                    const formattedData = data.map((p) => ({
                        id: p.id,
                        title: p.name,
                        image: p.covers[404],
                        url: p.url,
                    }));

                    await env.KV_CACHE.put(`design:behance`,
                        JSON.stringify(formattedData), {
                        expirationTtl: cacheDuration,
                    });

                    result.behance = formattedData;
                } catch (e) {
                    console.error(e);
                    return null;
                }
            })(),
            (async () => {
                try {
                    const cached = await env.KV_CACHE.get(`design:dribbble`);
                    if (cached) return result.dribbble = JSON.parse(cached);

                    const dribbbleResponse = await fetch(
                        `https://api.dribbble.com/v2/user/shots?access_token=${dribbble_key}`
                    );

                    if (!dribbbleResponse?.ok) {
                        const code = dribbbleResponse.status;
                        const text = await dribbbleResponse.text();

                        throw new Error(`Dribbble API failed (${code}): ${text}`);
                    }

                    const data = await dribbbleResponse.json();

                    const formattedData = data.map((p) => ({
                        id: p.id,
                        title: p.title,
                        image: p.images.normal,
                        url: p.html_url,
                    }));

                    await env.KV_CACHE.put(`design:dribbble`,
                        JSON.stringify(formattedData), {
                        expirationTtl: cacheDuration,
                    });

                    result.dribbble = formattedData;
                } catch (e) {
                    console.error(e);
                    return null;
                }
            })(),
            (async () => {
                try {
                    const cached = await env.KV_CACHE.get(`design:youtube`);
                    if (cached) return result.youtube = JSON.parse(cached);

                    const youtubeResponse = await fetch(
                        `https://www.youtube.com/feeds/videos.xml?channel_id=${youtube_id}`
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
                        .map((post) => ({
                            id: post['yt:videoId'],
                            title: post.title,
                            image: `https://img.youtube.com/vi/${post['yt:videoId']}/maxresdefault.jpg`,
                            url: `https://www.youtube.com/watch?v=${post['yt:videoId']}`,
                        }));

                    await env.KV_CACHE.put(`design:youtube`,
                        JSON.stringify(formattedData), {
                        expirationTtl: cacheDuration,
                    });

                    result.youtube = formattedData;
                } catch (e) {
                    console.error(e);
                    return null;
                }
            })(),
        ]);

        const cachedData = responseHelper({
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
        return responseHelper({
            message: e.message,
        }, 500);
    }
});

app.delete('*', async (c) => {
    await cache.delete(cacheKey);
    return responseHelper(null, 204);
});

app.all('*', () => {
    return responseHelper({
        message: 'Method not allowed!',
    }, 405);
});

export default app;
