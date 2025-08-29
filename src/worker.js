import { XMLParser } from 'fast-xml-parser';

const application = 'Mfc API';
const contentTypeJson = {
	'Content-Type': 'application/json',
};

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
			case 'GET':
				try {
					const behance_id = env.CONFIG_BEHANCE_ID;
					const behance_key = env.CONFIG_BEHANCE_KEY;
					const behance_proxy = env.CONFIG_BEHANCE_PROXY;
					const dribbble_key = env.CONFIG_DRIBBBLE_KEY;
					const youtube_id = env.CONFIG_YOUTUBE_ID;

					if (!behance_id || !behance_key || !behance_proxy || !dribbble_key || !youtube_id) {
						return new Response(JSON.stringify({
							application,
							message: 'Missing environment variable(s)!',
						}), {
							status: 500,
							headers: contentTypeJson,
						});
					}

					const behanceResponse = await fetch(behance_proxy, {
						method: 'POST',
						headers: contentTypeJson,
						body: JSON.stringify({
							behance_id,
							behance_key,
						}),
					});

					const dribbbleResponse = await apiFetch(
						`https://api.dribbble.com/v2/user/shots?access_token=${dribbble_key}`);
					const youtubeResponse = await apiFetch(
						`https://www.youtube.com/feeds/videos.xml?channel_id=${youtube_id}`);

					const result = {
						behance: [],
						dribbble: [],
						youtube: [],
					};

					if (behanceResponse.ok) {
						const { data } = await behanceResponse.json();

						result.behance = data.map(p => ({
							id: p.id,
							title: p.name,
							image: p.covers[404],
							url: p.url,
						}));
					} else {
						const text = await behanceResponse.text();
						console.error(`Behance API returned ${behanceResponse.status}: ${text}`);
					}

					if (dribbbleResponse.ok) {
						const data = await dribbbleResponse.json();

						result.dribbble = data.map(p => ({
							id: p.id,
							title: p.title,
							image: p.images.normal,
							url: p.html_url,
						}));
					} else {
						const text = await dribbbleResponse.text();
						console.error(`Dribbble API returned ${dribbbleResponse.status}: ${text}`);
					}

					if (youtubeResponse.ok) {
						const xml = await youtubeResponse.text();
						const parser = new XMLParser();
						const data = parser.parse(xml);

						result.youtube = (data.feed.entry.slice(0, 6) || []).map((post) => ({
							id: post['yt:videoId'],
							title: post.title,
							image: `https://img.youtube.com/vi/${post['yt:videoId']}/maxresdefault.jpg`,
							url: `https://www.youtube.com/watch?v=${post['yt:videoId']}`,
						}));
					} else {
						const text = await dribbbleResponse.text();
						console.error(`Dribbble API returned ${dribbbleResponse.status}: ${text}`);
					}

					return new Response(JSON.stringify({
						application,
						message: 'Fetch data success.',
						data: result,
					}), {
						headers: contentTypeJson,
					});

				} catch (e) {
					return new Response(JSON.stringify({
						application,
						message: e.message,
					}), {
						status: 500,
						headers: contentTypeJson,
					});
				}

			case 'DELETE':
				return new Response(null, { status: 204 });

			default:
				return new Response(JSON.stringify({
					application,
					message: 'Method not allowed!'
				}), {
					status: 405,
					headers: contentTypeJson,
				});
		}
	},
};
