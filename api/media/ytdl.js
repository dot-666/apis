const axios = require('axios');

module.exports = {
    name: 'YouTubeDL',
    desc: 'Convert a YouTube video to a direct MP3 download link',
    category: 'Downloader',
    params: ['apikey', 'url'],
    async run(req, res) {
        const { url } = req.query;
        if (!url) return res.status(400).json({ status: false, error: 'url is required' });

        try {
            const result = await youtubeDL(url);
            res.json(result);
        } catch (e) {
            res.status(500).json({ status: false, error: e.message });
        }
    }
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const HEADERS = {
    'Accept':       'application/json, text/plain, */*',
    'Content-Type': 'application/json',
    'User-Agent':   'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Referer':      'https://id.ytmp3.mobi/',
};

const YT_REGEX = /(?:youtu\.be\/|youtube\.com\/(?:shorts\/|live\/|v\/|embed\/|watch\?(?:.*&)?v=)|music\.youtube\.com\/(?:watch\?(?:.*&)?v=))([a-zA-Z0-9_-]{11})/;

function extractId(url) {
    const m = url.match(YT_REGEX);
    if (!m) throw new Error('Invalid YouTube URL');
    return m[1];
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function youtubeDL(rawUrl) {
    const id   = extractId(rawUrl);
    const rand = Math.random();

    // Step 1: init — get a convert endpoint
    const { data: init } = await axios.get(
        `https://d.ymcdn.org/api/v1/init?p=y&23=1llum1n471&_=${rand}`,
        { headers: HEADERS, timeout: 12000 }
    );
    if (!init.convertURL) throw new Error('Init failed — no convertURL');

    // Step 2: start MP3 conversion
    const { data: conv } = await axios.get(
        `${init.convertURL}&v=${id}&f=mp3&_=${rand}`,
        { headers: HEADERS, timeout: 12000 }
    );
    if (!conv.downloadURL || !conv.progressURL) throw new Error('Conversion failed — no download/progress URL');

    let title = conv.title || '';

    // Step 3: wait for conversion to complete (progress >= 3)
    for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 700));
        const { data: prog } = await axios.get(conv.progressURL, { headers: HEADERS, timeout: 10000 });
        if (prog.error && prog.error !== 0) throw new Error(`Conversion error: ${prog.error}`);
        if (prog.progress >= 3) {
            title = prog.title || title;
            break;
        }
        if (i === 29) throw new Error('Conversion timed out');
    }

    return {
        status:    true,
        title,
        url:       conv.downloadURL,
        thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        format:    'mp3',
        source:    `https://www.youtube.com/watch?v=${id}`,
    };
}
