module.exports = {
    name: 'Ytmp4',
    desc: 'Open a prefilled SaveFrom page to download a YouTube video as MP4',
    category: 'Downloader',
    params: ['apikey', 'url'],
    async run(req, res) {
        const inputUrl = req.query.url;
        if (!inputUrl) return res.status(400).json({ status: false, error: 'url is required' });

        let videoId;
        try {
            videoId = extractId(inputUrl);
        } catch (e) {
            return res.status(400).json({ status: false, error: e.message });
        }

        const source = `https://www.youtube.com/watch?v=${videoId}`;
        const saveFromUrl = new URL('https://en1.savefrom.net/1-youtube-video-downloader-22wW/');
        saveFromUrl.searchParams.set('url', source);

        return res.json({
            status: true,
            title: `YouTube video ${videoId}`,
            downloadUrl: saveFromUrl.toString(),
            thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            source,
            format: 'mp4',
            duration: null,
            downloadMode: 'browser',
        });
    }
};

const YT_ID_REGEX = /(?:youtu\.be\/|youtube\.com\/(?:shorts\/|live\/|v\/|embed\/|watch\?(?:.*&)?v=)|music\.youtube\.com\/(?:watch\?(?:.*&)?v=))([a-zA-Z0-9_-]{11})/;

function extractId(url) {
    const match = String(url).match(YT_ID_REGEX);
    if (!match) throw new Error('Invalid YouTube URL');
    return match[1];
}
