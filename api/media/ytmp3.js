const axios    = require('axios');
const savetube = require('../../lib/savetube');

module.exports = {
    name: 'Ytmp3',
    desc: 'Scrape YouTube Music and get a direct playable audio stream',
    category: 'Downloader',
    params: ['apikey', 'url'],
    async run(req, res) {
        const { url } = req.query;
        if (!url) return res.status(400).json({ status: false, error: 'url is required' });
        try {
            res.json(await ytmp3(url));
        } catch (e) {
            res.status(500).json({ status: false, error: e.message });
        }
    }
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const YT_ID_REGEX = /(?:youtu\.be\/|youtube\.com\/(?:shorts\/|live\/|v\/|embed\/|watch\?(?:.*&)?v=)|music\.youtube\.com\/(?:watch\?(?:.*&)?v=))([a-zA-Z0-9_-]{11})/;

function extractId(url) {
    const m = url.match(YT_ID_REGEX);
    if (!m) throw new Error('Invalid YouTube or YouTube Music URL');
    return m[1];
}

function isMusicUrl(url) { return /music\.youtube\.com/i.test(url); }

function formatDuration(seconds) {
    const s = parseInt(seconds) || 0;
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ── Scrape music.youtube.com for rich music metadata ─────────────────────────

async function scrapeMetadata(videoId) {
    const meta = { title: null, artist: null, album: null, thumbnail: null, duration: null };
    try {
        const { data: html } = await axios.get(
            `https://music.youtube.com/watch?v=${videoId}`,
            { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36', 'Accept-Language': 'en-US,en;q=0.9' }, timeout: 12000, decompress: true }
        );

        const prMatch = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;?\s*(?:var\s|<\/script>)/s);
        if (prMatch) {
            try {
                const vd = JSON.parse(prMatch[1])?.videoDetails;
                if (vd) {
                    meta.title    = vd.title  || null;
                    meta.artist   = vd.author || null;
                    meta.duration = vd.lengthSeconds ? formatDuration(vd.lengthSeconds) : null;
                    const thumbs  = vd.thumbnail?.thumbnails || [];
                    if (thumbs.length) meta.thumbnail = thumbs[thumbs.length - 1].url;
                }
            } catch (_) {}
        }

        const ydMatch = html.match(/ytInitialData\s*=\s*(\{.+?\})\s*;?\s*(?:var\s|<\/script>)/s);
        if (ydMatch) {
            try {
                const tabs = JSON.parse(ydMatch[1])?.contents
                    ?.singleColumnMusicWatchNextResultsRenderer?.tabbedRenderer
                    ?.watchNextTabbedResultsRenderer?.tabs || [];
                for (const tab of tabs) {
                    const content = tab?.tabRenderer?.content?.musicQueueRenderer?.content
                        ?.playlistPanelRenderer?.contents?.[0]?.playlistPanelVideoRenderer;
                    if (!content) continue;
                    const titleRuns = content?.title?.runs;
                    if (titleRuns?.[0]?.text) meta.title = titleRuns[0].text;
                    const parts = (content?.longBylineText?.runs || [])
                        .map(r => r.text).filter(t => t && t.trim() !== '•' && t.trim() !== '');
                    if (parts[0]) meta.artist = parts[0];
                    if (parts[1]) meta.album  = parts[1];
                    break;
                }
            } catch (_) {}
        }

        if (!meta.title) {
            const m = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i)
                   || html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:title"/i);
            if (m) meta.title = m[1].replace(/ - YouTube Music$/, '').trim();
        }
        if (!meta.thumbnail) {
            const m = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i)
                   || html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:image"/i);
            if (m) meta.thumbnail = m[1];
        }
    } catch (_) {}
    return meta;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function ytmp3(rawUrl) {
    const videoId   = extractId(rawUrl);
    const fromMusic = isMusicUrl(rawUrl);

    const [cdnData, meta] = await Promise.all([
        savetube.getAudioUrl(videoId),
        fromMusic ? scrapeMetadata(videoId) : Promise.resolve({ title: null, artist: null, album: null, thumbnail: null, duration: null }),
    ]);

    const title     = meta.title     || cdnData.title     || 'Unknown Title';
    const artist    = meta.artist    || null;
    const duration  = meta.duration  || (cdnData.duration ? formatDuration(cdnData.duration) : null);
    const thumbnail = meta.thumbnail || cdnData.thumbnail || `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;

    const result = {
        status:      true,
        title,
        downloadUrl: cdnData.downloadUrl,
        thumbnail,
        source: fromMusic
            ? `https://music.youtube.com/watch?v=${videoId}`
            : `https://www.youtube.com/watch?v=${videoId}`,
        format:   'mp3',
        duration,
    };

    if (artist)     result.artist = artist;
    if (meta.album) result.album  = meta.album;

    return result;
}
