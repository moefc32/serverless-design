async function apiFetch(url, options = {}) {
    const defaultHeaders = {
        'User-Agent': 'Mfc Site Worker',
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

                    const [
                        behanceResponse,
                        dribbbleResponse
                    ] = await Promise.all([
                        apiFetch(`https://api.behance.net/v2/users/${behance_id}/projects?api_key=${behance_key}`),
                        apiFetch(`https://api.dribbble.com/v2/user/shots?access_token=${dribbble_key}`)
                    ]);

                    if (!behanceResponse.ok ||
                        !dribbbleResponse.ok
                    ) {
                        const [bText, dText] = await Promise.all([
                            behanceResponse.text(),
                            dribbbleResponse.text()
                        ]);

                        return new Response(JSON.stringify({
                            error: 'One or both APIs failed',
                            behance: bText,
                            dribbble: dText
                        }), {
                            status: 500,
                            headers: { 'Content-Type': 'application/json' },
                        });
                    }

                    const [behanceData, dribbbleData] = await Promise.all([
                        behanceResponse.json(),
                        dribbbleResponse.json()
                    ]);
                    const result = {
                        behance: [],
                        dribbble: [],
                    };

                    behanceData.projects.forEach((item) => {
                        result.behance.push({
                            id: item.id,
                            title: item.name,
                            image: item.covers[404],
                            url: item.url,
                        });
                    });

                    dribbbleData.forEach((item) => {
                        result.dribbble.push({
                            id: item.id,
                            title: item.title,
                            image: item.images.normal,
                            url: item.html_url,
                        });
                    });

                    return new Response(JSON.stringify(result), {
                        headers: { 'Content-Type': 'application/json' },
                    });
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
