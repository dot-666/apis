const axios = require('axios');
const crypto = require('crypto');
const yts = require('yt-search');

module.exports = {
    name: 'YouTubeDL',
    desc: 'Search YouTube and get MP3 links',
    category: 'Downloader',
    params: ['apikey', 'query'],

    async run(req, res) {
        try {
            const { query } = req.query;
            if (!query) return res.status(400).json({ status: false, error: "Missing 'query'" });

            const search = await yts(query);
            if (!search.videos.length) return res.status(404).json({ status: false, error: 'Video not found' });

            const url = search.videos[0].url;

            const id = extractId(url);
            const cdn = await getCDN();
            const info = await request(`https://${cdn}/v2/info`, { url: `https://youtube.com/watch?v=${id}` });
            const meta = decrypt(info.data);
            const mp3 = await request(`https://${cdn}/download`, { id, downloadType: 'audio', quality: '128', key: meta.key });

            res.json({
                status: true,
                result: {
                    title: meta.title,
                    duration: meta.duration,
                    thumbnail: meta.thumbnail,
                    mp3: mp3.data.downloadUrl
                }
            });
        } catch (e) {
            res.status(500).json({ status: false, error: e.message });
        }

        // Helper functions inside run closure
        function extractId(url) {
            const m = url.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/);
            if (!m) throw new Error('Invalid YouTube URL');
            return m[1];
        }

        async function getCDN() {
            const r = await request('/random-cdn', {}, 'get');
            return r.cdn;
        }

        async function request(endpoint, data = {}, method = 'post') {
            const r = await axios({
                method,
                url: endpoint.startsWith('http') ? endpoint : `https://media.savetube.me/api${endpoint}`,
                data: method === 'post' ? data : undefined,
                params: method === 'get' ? data : undefined
            });
            return r.data;
        }

        function decrypt(enc) {
            const keyHex = 'C5D58EF67A7584E4A29F6C35BBC4EB12';
            const buf = Buffer.from(enc, 'base64');
            const iv = buf.slice(0, 16);
            const data = buf.slice(16);
            const key = Buffer.from(keyHex, 'hex');

            const d = crypto.createDecipheriv('aes-128-cbc', key, iv);
            return JSON.parse(Buffer.concat([d.update(data), d.final()]).toString());
        }
    }
};
