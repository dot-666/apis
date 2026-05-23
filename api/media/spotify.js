const { execFile } = require('child_process');
const axios         = require('axios');
const { promisify } = require('util');
const yts           = require('yt-search');

const execFileAsync = promisify(execFile);

module.exports = {
    name: 'Spotify',
    desc: 'Get a direct playable audio stream from a Spotify track link',
    category: 'Downloader',
    params: ['apikey', 'url'],
    async run(req, res) {
        const { url } = req.query;
        if (!url) return res.status(400).json({ status: false, error: 'url is required' });

        try {
            const result = await spotify(url);
            const base = `${req.protocol}://${req.get('host')}`;
            result.url = `${base}/stream?url=${encodeURIComponent(result.url)}`;
            res.json(result);
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

// ── Scrape Spotify page for track metadata ────────────────────────────────────
// Uses a social-bot User-Agent to get server-rendered og: tags

async function scrapeSpotifyMeta(trackId) {
    const { data: html } = await axios.get(
        `https://open.spotify.com/track/${trackId}`,
        {
            headers: {
                'User-Agent':      'Twitterbot/1.0',
                'Accept-Language': 'en-US,en;q=0.9',
            },
            timeout: 12000,
        }
    );

    const get = (prop) =>
        html.match(new RegExp(`<meta[^>]+property="${prop}"[^>]+content="([^"]+)"`))?.[1] ||
        html.match(new RegExp(`<meta[^>]+content="([^"]+)"[^>]+property="${prop}"`))?.[1] ||
        null;

    const title = get('og:title');
    const desc  = get('og:description'); // "Artist · Album · Song · Year"
    const image = get('og:image');

    // Parse description: "Ed Sheeran · ÷ (Deluxe) · Song · 2017"
    let artist = null, album = null;
    if (desc) {
        const parts = desc.split('·').map(p => p.trim()).filter(Boolean);
        // parts[0] = artist, parts[1] = album (skip "Song" / "Single" entries)
        if (parts[0] && !/^\d{4}$/.test(parts[0]) && parts[0].toLowerCase() !== 'song' && parts[0].toLowerCase() !== 'single') {
            artist = parts[0];
        }
        if (parts[1] && parts[1].toLowerCase() !== 'song' && parts[1].toLowerCase() !== 'single' && !/^\d{4}$/.test(parts[1])) {
            album = parts[1];
        }
    }

    return { title, artist, album, thumbnail: image };
}

// ── Get thumbnail from Spotify oEmbed (higher quality) ───────────────────────

async function getOembedThumb(trackId) {
    try {
        const { data } = await axios.get(
            `https://open.spotify.com/oembed?url=https://open.spotify.com/track/${trackId}`,
            { timeout: 8000 }
        );
        return data.thumbnail_url || null;
    } catch (_) {
        return null;
    }
}

// ── Search YouTube for best match and get audio stream ───────────────────────

async function searchYouTube(query) {
    const result = await yts({ query, category: 'music' });
    const videos = result.videos || [];
    if (!videos.length) throw new Error('No YouTube match found for: ' + query);
    return videos[0];
}

async function getAudioStream(youtubeUrl) {
    const { stdout } = await execFileAsync('yt-dlp', [
        '--no-playlist',
        '--format', 'bestaudio[ext=webm]/bestaudio[ext=m4a]/bestaudio',
        '--dump-json',
        '--no-warnings',
        '--quiet',
        youtubeUrl,
    ], { timeout: 30000 });

    const info = JSON.parse(stdout.trim());
    if (!info.url) throw new Error('yt-dlp did not return a stream URL');

    return {
        url:      info.url,
        ext:      info.ext   || 'webm',
        bitrate:  info.abr   || info.tbr || null,
        duration: info.duration != null ? formatDuration(info.duration) : null,
    };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function spotify(rawUrl) {
    const trackId = extractTrackId(rawUrl);

    // Fetch Spotify metadata + oEmbed thumbnail in parallel
    const [meta, oembedThumb] = await Promise.all([
        scrapeSpotifyMeta(trackId),
        getOembedThumb(trackId),
    ]);

    if (!meta.title) throw new Error('Could not retrieve track metadata from Spotify');

    const title     = meta.title;
    const artist    = meta.artist || null;
    const album     = meta.album  || null;
    const thumbnail = oembedThumb || meta.thumbnail || null;

    // Search YouTube: "Title Artist" for best match
    const query     = artist ? `${title} ${artist}` : title;
    const ytVideo   = await searchYouTube(query);

    // Get audio stream from YouTube match
    const stream = await getAudioStream(ytVideo.url);

    const result = {
        status:    true,
        title,
        url:       stream.url,
        thumbnail,
        source:    `https://open.spotify.com/track/${trackId}`,
        format:    stream.ext,
        bitrate:   stream.bitrate ? `${Math.round(stream.bitrate)}kbps` : null,
        duration:  stream.duration,
    };

    if (artist) result.artist = artist;
    if (album)  result.album  = album;

    return result;
}
