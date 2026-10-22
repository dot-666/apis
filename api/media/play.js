const yts      = require('yt-search');
const savetube = require('../../lib/savetube');

module.exports = {
    name: 'YouTubePlay',
    desc: 'Search YouTube and get a direct MP3 link',
    category: 'Downloader',
    params: ['apikey', 'query'],
    async run(req, res) {
        const { query } = req.query;
        if (!query) return res.status(400).json({ status: false, error: "Missing 'query'" });
        try {
            const search = await yts(query);
            if (!search.videos.length) return res.status(404).json({ status: false, error: 'No results found' });

            const video = search.videos[0];
            const idMatch = video.url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
            const videoId = idMatch?.[1];
            if (!videoId) throw new Error('Could not extract video ID');

            const cdnData = await savetube.getAudioUrl(videoId);
            const downloadUrl = cdnData.downloadUrl?.replace(/cdn\d+\.savetube\.vip/, 'cdn405.savetube.vip');

            res.json({
                status:      true,
                title:       cdnData.title    || video.title,
                downloadUrl,
                thumbnail:   `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                duration:    video.timestamp,
                source:      video.url,
                format:      'mp3',
            });
        } catch (e) {
            res.status(500).json({ status: false, error: e.message });
        }
    }
};
