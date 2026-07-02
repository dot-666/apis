const savetube = require('../../lib/savetube');

module.exports = {
    name: 'YouTubeDL',
    desc: 'Convert a YouTube video to a direct MP3 download link',
    category: 'Downloader',
    params: ['apikey', 'url'],
    async run(req, res) {
        const { url } = req.query;
        if (!url) return res.status(400).json({ status: false, error: 'url is required' });
        try {
            res.json(await youtubeDL(url));
        } catch (e) {
            res.status(500).json({ status: false, error: e.message });
        }
    }
};

const YT_REGEX = /(?:youtu\.be\/|youtube\.com\/(?:shorts\/|live\/|v\/|embed\/|watch\?(?:.*&)?v=)|music\.youtube\.com\/(?:watch\?(?:.*&)?v=))([a-zA-Z0-9_-]{11})/;

function extractId(url) {
    const m = url.match(YT_REGEX);
    if (!m) throw new Error('Invalid YouTube URL');
    return m[1];
}

async function youtubeDL(rawUrl) {
    const id      = extractId(rawUrl);
    const cdnData = await savetube.getAudioUrl(id);

    return {
        status:      true,
        title:       cdnData.title || 'Unknown Title',
        downloadUrl: cdnData.downloadUrl,
        thumbnail:   cdnData.thumbnail || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        format:      'mp3',
        source:      `https://www.youtube.com/watch?v=${id}`,
    };
}
