const axios = require('axios');

module.exports = {
    name: 'Tiktokdl',
    desc: 'Download TikTok video',
    category: 'Downloader',
    params: ['apikey','url'],
    async run(req, res) {
        const { url } = req.query;

        if (!url) {
            return res.status(400).json({
                status: false,
                error: "Parameter 'url' is required"
            });
        }

        try {
            const data = await tiktok(url);
            res.status(200).json({
                status: true,
                result: data
            });
        } catch (error) {
            console.error('Error fetching TikTok video:', error.message);
            res.status(500).json({
                status: false,
                error: 'Internal Server Error'
            });
        }
    }
};

async function tiktok(query) {
    try {
        const encodedParams = new URLSearchParams();
        encodedParams.set('url', query);
        encodedParams.set('hd', '1');

        const response = await axios.post('https://tikwm.com/api/', encodedParams, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'Cookie': 'current_language=en',
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36'
            }
        });

        const videos = response.data.data;
        return {
            title: videos.title,
            cover: videos.cover,
            origin_cover: videos.origin_cover,
            no_watermark: videos.play,
            watermark: videos.wmplay,
            music: videos.music
        };
    } catch (err) {
        throw new Error('Failed to fetch TikTok video.');
    }
}
