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
					const dribbble_key = env.CONFIG_DRIBBBLE_KEY;
					const youtube_id = env.CONFIG_YOUTUBE_ID;

					if (!behance_id || !behance_key || !dribbble_key || !youtube_id) {
						return new Response(JSON.stringify({
							error: 'Missing environment variable(s)',
						}), {
							status: 500,
							headers: { 'Content-Type': 'application/json' },
						});
					}

					const behanceResponse = await apiFetch(`https://api.behance.net/v2/users/${behance_id}/projects?api_key=${behance_key}`);
					let behanceData = [];

					if (behanceResponse.ok) {
						const data = await behanceResponse.json();
						behanceData = data.projects.map(p => ({
							id: p.id,
							title: p.name,
							image: p.covers[404],
							url: p.url,
						}));
					} else {
						const text = await behanceResponse.text();
						console.error(`Behance API returned ${behanceResponse.status}: ${text}`);
					}

					const dribbbleResponse = await apiFetch(`https://api.dribbble.com/v2/user/shots?access_token=${dribbble_key}`);
					let dribbbleData = [];

					if (dribbbleResponse.ok) {
						const data = await dribbbleResponse.json();
						dribbbleData = data.map(p => ({
							id: p.id,
							title: p.title,
							image: p.images.normal,
							url: p.html_url,
						}));
					} else {
						const text = await dribbbleResponse.text();
						console.error(`Dribbble API returned ${dribbbleResponse.status}: ${text}`);
					}

					if (!behanceData.length && !dribbbleData.length) {
						return new Response(JSON.stringify({
							error: 'Failed to fetch all data',
						}), {
							status: 500,
							headers: { 'Content-Type': 'application/json' },
						});
					}

					return new Response(JSON.stringify({
						behance: behanceData,
						dribbble: dribbbleData,
					}), { headers: { 'Content-Type': 'application/json' } });

				} catch (e) {
					return new Response(JSON.stringify({
						error: e.message,
					}), {
						status: 500,
						headers: { 'Content-Type': 'application/json' },
					});
				}

			case 'DELETE':
				return new Response(null, { status: 204 });

			default:
				return new Response(JSON.stringify({ error: 'Method not allowed' }), {
					status: 405,
					headers: { 'Content-Type': 'application/json' },
				});
		}
	},
};
