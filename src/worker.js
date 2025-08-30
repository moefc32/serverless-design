import { XMLParser } from 'fast-xml-parser';
import corsHeaders from './corsHeaders.js';
import responseHelper from './responseHelper.js';

const cache = caches.default;
const cacheDuration = 60 * 60 * 24;
const cacheControl = { 'Cache-Control': `public, max-age=${cacheDuration}` };

async function apiFetch(url, options = {}) {
	const defaultHeaders = {
		'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; Win11) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.5993.90 Safari/537.36',
		'Accept': 'application/json',
	};

	options.headers = { ...defaultHeaders, ...(options.headers || {}) };
	return fetch(url, options);
}

export default {
	async fetch(request, env, ctx) {
		switch (request.method) {
			case 'OPTIONS':
				return new Response(null, { headers: corsHeaders });

			case 'GET':
				try {
					const cachedResponse = await cache.match(request);

					if (cachedResponse) {
						const age = cachedResponse.headers.get('CF-Cache-Age');
						if (age !== null && parseInt(age) < cacheDuration) {
							return cachedResponse;
						}
					}

					const behance_id = env.CONFIG_BEHANCE_ID;
					const behance_key = env.CONFIG_BEHANCE_KEY;
					const behance_proxy = env.CONFIG_BEHANCE_PROXY;
					const dribbble_key = env.CONFIG_DRIBBBLE_KEY;
					const youtube_id = env.CONFIG_YOUTUBE_ID;

					if (!behance_id || !behance_key || !behance_proxy || !dribbble_key || !youtube_id) {
						return responseHelper({
							message: 'Missing environment variable(s)!',
						}, 500);
					}

					const response = await Promise.allSettled([
						fetch(behance_proxy, {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({
								behance_id,
								behance_key,
							}),
						}),
						apiFetch(`https://api.dribbble.com/v2/user/shots?access_token=${dribbble_key}`),
						apiFetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${youtube_id}`),
					]);

					const apiNames = ['Behance', 'Dribbble', 'YouTube'];
					response.forEach((r, i) => {
						if (r.status === 'rejected') {
							console.error(`${apiNames[i]} API failed: ${r.reason}`);
						}
					});

					const [behanceResponse, dribbbleResponse, youtubeResponse] = response.map((r) =>
						r.status === 'fulfilled' ? r.value : null
					);

					const result = {
						behance: [],
						dribbble: [],
						youtube: [],
					};

					if (behanceResponse?.ok) {
						const { data } = await behanceResponse.json();

						result.behance = data.map(p => ({
							id: p.id,
							title: p.name,
							image: p.covers[404],
							url: p.url,
						}));
					}

					if (dribbbleResponse?.ok) {
						const data = await dribbbleResponse.json();

						result.dribbble = data.map(p => ({
							id: p.id,
							title: p.title,
							image: p.images.normal,
							url: p.html_url,
						}));
					}

					if (youtubeResponse?.ok) {
						const xml = await youtubeResponse.text();
						const parser = new XMLParser();
						const data = parser.parse(xml);

						result.youtube = (data.feed.entry.slice(0, 6) || []).map((post) => ({
							id: post['yt:videoId'],
							title: post.title,
							image: `https://img.youtube.com/vi/${post['yt:videoId']}/maxresdefault.jpg`,
							url: `https://www.youtube.com/watch?v=${post['yt:videoId']}`,
						}));
					}

					const cachedData = responseHelper({
						message: 'Fetch data success.',
						data: result,
					}, 200, {
						...cacheControl,
					});

					ctx.waitUntil(cache.put(request, cachedData.clone()));
					return cachedData;
				} catch (e) {
					return responseHelper({
						message: e.message,
					}, 500);
				}

			case 'DELETE':
				await cache.delete(request);
				return responseHelper(null, 204);

			default:
				return responseHelper({
					message: 'Method not allowed!'
				}, 405);
		}
	},
};
