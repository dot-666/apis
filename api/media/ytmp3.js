const { execFile } = require('child_process');
const axios          = require('axios');
const { promisify }  = require('util');

const execFileAsync = promisify(execFile);

module.exports = {
    name: 'Ytmp3',
    desc: 'Scrape YouTube Music and get a direct playable audio stream',
    category: 'Downloader',
    params: ['apikey', 'url'],
    async run(req, res) {
        const { url } = req.query;
        if (!url) return res.status(400).json({ status: false, error: 'url is required' });

        try {
            const result = await ytmp3(url);
            const base = `${req.protocol}://${req.get('host')}`;
            result.url = `${base}/stream?url=${encodeURIComponent(result.url)}`;
            res.json(result);
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

function isMusicUrl(url) {
    return /music\.youtube\.com/i.test(url);
}

function formatDuration(seconds) {
    const s = parseInt(seconds) || 0;
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ── Get direct playable audio URL via yt-dlp subprocess ──────────────────────

async function getAudioStream(videoId) {
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;

    const { stdout } = await execFileAsync('yt-dlp', [
        '--no-playlist',
        '--format', 'bestaudio[ext=webm]/bestaudio[ext=m4a]/bestaudio',
        '--dump-json',
        '--no-warnings',
        '--quiet',
        watchUrl,
    ], { timeout: 30000 });

    const info = JSON.parse(stdout.trim());

    if (!info.url) throw new Error('yt-dlp did not return a stream URL');

    return {
        url:      info.url,
        ext:      info.ext      || 'webm',
        bitrate:  info.abr      || info.tbr || null,
        title:    info.title    || null,
        author:   info.uploader || info.channel || null,
        duration: info.duration != null ? formatDuration(info.duration) : null,
        thumbnail: info.thumbnail || `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
    };
}

// ── Scrape music.youtube.com for rich music metadata ─────────────────────────

async function scrapeMetadata(videoId) {
    const meta = { title: null, artist: null, album: null, thumbnail: null, duration: null };

    try {
        const { data: html } = await axios.get(
            `https://music.youtube.com/watch?v=${videoId}`,
            {
                headers: {
                    'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36',
                    'Accept':          'text/html,application/xhtml+xml',
                    'Accept-Language': 'en-US,en;q=0.9',
                },
                timeout: 12000,
                decompress: true,
            }
        );

        // ytInitialPlayerResponse → title, author, duration, thumbnail
        const prMatch = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;?\s*(?:var\s|<\/script>)/s);
        if (prMatch) {
            try {
                const pr = JSON.parse(prMatch[1]);
                const vd = pr?.videoDetails;
                if (vd) {
                    meta.title    = vd.title  || null;
                    meta.artist   = vd.author || null;
                    meta.duration = vd.lengthSeconds ? formatDuration(vd.lengthSeconds) : null;
                    const thumbs  = vd.thumbnail?.thumbnails || [];
                    if (thumbs.length) meta.thumbnail = thumbs[thumbs.length - 1].url;
                }
            } catch (_) {}
        }

        // ytInitialData → artist / album from playlist panel
        const ydMatch = html.match(/ytInitialData\s*=\s*(\{.+?\})\s*;?\s*(?:var\s|<\/script>)/s);
        if (ydMatch) {
            try {
                const yd = JSON.parse(ydMatch[1]);
                const tabs = yd?.contents
                    ?.singleColumnMusicWatchNextResultsRenderer
                    ?.tabbedRenderer
                    ?.watchNextTabbedResultsRenderer
                    ?.tabs || [];

                for (const tab of tabs) {
                    const content = tab?.tabRenderer?.content
                        ?.musicQueueRenderer?.content
                        ?.playlistPanelRenderer?.contents?.[0]
                        ?.playlistPanelVideoRenderer;
                    if (!content) continue;

                    const titleRuns = content?.title?.runs;
                    if (titleRuns?.[0]?.text) meta.title = titleRuns[0].text;

                    const runs  = content?.longBylineText?.runs || [];
                    const parts = runs.map(r => r.text).filter(t => t && t.trim() !== '•' && t.trim() !== '');
                    if (parts[0]) meta.artist = parts[0];
                    if (parts[1]) meta.album  = parts[1];
                    break;
                }
            } catch (_) {}
        }

        // og: tags as final fallback
        if (!meta.title) {
            const m = html.match(/<meta[^>]+content="([^"]+)"[^>]+(?:property|name)="og:title"/i)
                   || html.match(/<meta[^>]+(?:property|name)="og:title"[^>]+content="([^"]+)"/i);
            if (m) meta.title = m[1].replace(/ - YouTube Music$/, '').trim();
        }
        if (!meta.thumbnail) {
            const m = html.match(/<meta[^>]+content="([^"]+)"[^>]+(?:property|name)="og:image"/i)
                   || html.match(/<meta[^>]+(?:property|name)="og:image"[^>]+content="([^"]+)"/i);
            if (m) meta.thumbnail = m[1];
        }
    } catch (_) {
        // metadata scrape failing is non-fatal
    }

    return meta;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function ytmp3(rawUrl) {
    const videoId   = extractId(rawUrl);
    const fromMusic = isMusicUrl(rawUrl);

    // Fetch audio stream + music metadata in parallel
    const [stream, meta] = await Promise.all([
        getAudioStream(videoId),
        fromMusic
            ? scrapeMetadata(videoId)
            : Promise.resolve({ title: null, artist: null, album: null, thumbnail: null, duration: null }),
    ]);

    // Prefer music-page data; fall back to yt-dlp data
    const title     = meta.title     || stream.title     || 'Unknown Title';
    const artist    = meta.artist    || stream.author     || null;
    const duration  = meta.duration  || stream.duration   || null;
    const thumbnail = meta.thumbnail || stream.thumbnail  || `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;

    const source = fromMusic
        ? `https://music.youtube.com/watch?v=${videoId}`
        : `https://www.youtube.com/watch?v=${videoId}`;

    const result = {
        status:    true,
        title,
        url:       stream.url,
        thumbnail,
        source,
        format:    stream.ext,
        bitrate:   stream.bitrate ? `${Math.round(stream.bitrate)}kbps` : null,
        duration,
    };

    if (artist)     result.artist = artist;
    if (meta.album) result.album  = meta.album;

    return result;
}
