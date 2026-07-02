const axios = require('axios');

const TIKWM_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Referer': 'https://www.tikwm.com/',
};

module.exports = {
    name: 'Tiktokdl',
    desc: 'Download TikTok video (no watermark, HD, music)',
    category: 'Downloader',
    params: ['apikey', 'url'],
    async run(req, res) {
        const { url } = req.query;

        if (!url) {
            return res.status(400).json({
                status: false,
                error: "Parameter 'url' is required"
            });
        }

        try {
            const data = await fetchTiktok(url);
            res.status(200).json({ status: true, result: data });
        } catch (error) {
            console.error('TikTok error:', error.message);
            res.status(500).json({ status: false, error: error.message || 'Internal Server Error' });
        }
    }
};

async function fetchTiktok(url) {
    const response = await axios.get('https://www.tikwm.com/api/', {
        params: { url, hd: 1 },
        headers: TIKWM_HEADERS,
        timeout: 15000,
    });

    const body = response.data;

    if (!body || body.code !== 0) {
        throw new Error(body?.msg || 'TikWM returned an error for this URL');
    }

    const v = body.data;
    if (!v) throw new Error('No video data returned');

    return {
        title:        v.title        || null,
        duration:     v.duration     || null,
        cover:        v.cover        || null,
        origin_cover: v.origin_cover || null,
        no_watermark: v.play         || null,
        hd:           v.hdplay       || null,
        watermark:    v.wmplay       || null,
        music:        v.music        || null,
        music_info: v.music_info ? {
            title:  v.music_info.title  || null,
            author: v.music_info.author || null,
            cover:  v.music_info.cover  || null,
        } : null,
        author: v.author ? {
            id:       v.author.id       || null,
            username: v.author.unique_id || null,
            nickname: v.author.nickname  || null,
            avatar:   v.author.avatar    || null,
        } : null,
        stats: {
            plays:     v.play_count    || 0,
            likes:     v.digg_count    || 0,
            comments:  v.comment_count || 0,
            shares:    v.share_count   || 0,
            downloads: v.download_count || 0,
        },
    };
}
