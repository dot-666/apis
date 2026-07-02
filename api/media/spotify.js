const axios    = require('axios');
const yts      = require('yt-search');
const savetube = require('../../lib/savetube');

module.exports = {
    name: 'Spotify',
    desc: 'Get a direct playable audio stream from a Spotify track link',
    category: 'Downloader',
    params: ['apikey', 'url'],
    async run(req, res) {
        const { url } = req.query;
        if (!url) return res.status(400).json({ status: false, error: 'url is required' });
        try {
            res.json(await spotify(url));
        } catch (e) {
            res.status(500).json({ status: false, error: e.message });
        }
    }
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const SPOTIFY_REGEX = /open\.spotify\.com\/track\/([A-Za-z0-9]+)/;

function extractTrackId(url) {
    const m = url.match(SPOTIFY_REGEX);
    if (!m) throw new Error('Invalid Spotify track URL');
    return m[1];
}

function formatDuration(seconds) {
    const s = parseInt(seconds) || 0;
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ── Scrape Spotify page for metadata (bot UA gets server-rendered og: tags) ──

async function scrapeSpotifyMeta(trackId) {
    const { data: html } = await axios.get(
        `https://open.spotify.com/track/${trackId}`,
        { headers: { 'User-Agent': 'Twitterbot/1.0', 'Accept-Language': 'en-US,en;q=0.9' }, timeout: 12000 }
    );

    const get = prop =>
        html.match(new RegExp(`<meta[^>]+property="${prop}"[^>]+content="([^"]+)"`))?.[1] ||
        html.match(new RegExp(`<meta[^>]+content="([^"]+)"[^>]+property="${prop}"`))?.[1] || null;

    const title = get('og:title');
    const desc  = get('og:description'); // "Artist · Album · Song · Year"
    const image = get('og:image');

    let artist = null, album = null;
    if (desc) {
        const parts = desc.split('·').map(p => p.trim()).filter(Boolean);
        if (parts[0] && !/^\d{4}$/.test(parts[0]) && !['song','single'].includes(parts[0].toLowerCase()))
            artist = parts[0];
        if (parts[1] && !/^\d{4}$/.test(parts[1]) && !['song','single'].includes(parts[1].toLowerCase()))
            album = parts[1];
    }

    return { title, artist, album, thumbnail: image };
}

// ── Get high-res thumbnail from Spotify oEmbed ────────────────────────────────

async function getOembedThumb(trackId) {
    try {
        const { data } = await axios.get(
            `https://open.spotify.com/oembed?url=https://open.spotify.com/track/${trackId}`,
            { timeout: 8000 }
        );
        return data.thumbnail_url || null;
    } catch (_) { return null; }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function spotify(rawUrl) {
    const trackId = extractTrackId(rawUrl);

    const [meta, oembedThumb] = await Promise.all([
        scrapeSpotifyMeta(trackId),
        getOembedThumb(trackId),
    ]);

    if (!meta.title) throw new Error('Could not retrieve track metadata from Spotify');

    const thumbnail = oembedThumb || meta.thumbnail || null;

    // Search YouTube for the best match
    const query   = meta.artist ? `${meta.title} ${meta.artist}` : meta.title;
    const ytRes   = await yts({ query, category: 'music' });
    const ytVideo = ytRes.videos?.[0];
    if (!ytVideo) throw new Error('No YouTube match found for: ' + query);

    // Get the YouTube video ID and fetch audio from savetube CDN
    const ytIdMatch = ytVideo.url.match(/[?&]v=([a-zA-Z0-9_-]{11})|youtu\.be\/([a-zA-Z0-9_-]{11})/);
    const videoId   = ytIdMatch?.[1] || ytIdMatch?.[2];
    if (!videoId) throw new Error('Could not extract YouTube video ID');

    const cdnData = await savetube.getAudioUrl(videoId);

    const result = {
        status:      true,
        title:       meta.title,
        downloadUrl: cdnData.downloadUrl,
        thumbnail:   cdnData.thumbnail || thumbnail,
        source:      `https://open.spotify.com/track/${trackId}`,
        format:      'mp3',
        duration:    cdnData.duration ? formatDuration(cdnData.duration) : null,
    };

    if (meta.artist) result.artist = meta.artist;
    if (meta.album)  result.album  = meta.album;

    return result;
}
