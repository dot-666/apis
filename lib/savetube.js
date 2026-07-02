const axios  = require('axios');
const crypto = require('crypto');

const AES_KEY  = Buffer.from('C5D58EF67A7584E4A29F6C35BBC4EB12', 'hex');
const CDN_LIST = ['cdn403.savetube.vip', 'cdn400.savetube.vip', 'cdn401.savetube.vip'];
const HEADERS  = {
    'Content-Type': 'application/json',
    'origin':       'https://ytshorts.savetube.me',
    'referer':      'https://ytshorts.savetube.me/',
};

// CDN cache — reuse the fastest CDN for 5 minutes
let _cachedCdn   = null;
let _cacheExpiry = 0;

function decrypt(enc) {
    const buf = Buffer.from(enc, 'base64');
    const iv  = buf.slice(0, 16);
    const dc  = crypto.createDecipheriv('aes-128-cbc', AES_KEY, iv);
    return JSON.parse(Buffer.concat([dc.update(buf.slice(16)), dc.final()]).toString());
}

// Fetch meta — uses cached CDN when warm, races all CDNs when cold
async function getInfo(videoId) {
    if (_cachedCdn && Date.now() < _cacheExpiry) {
        try {
            const res = await axios.post(
                `https://${_cachedCdn}/v2/info`,
                { url: `https://youtube.com/watch?v=${videoId}` },
                { headers: HEADERS, timeout: 12000 }
            );
            const meta = decrypt(res.data.data);
            meta._cdn = _cachedCdn;
            return meta;
        } catch (_) {
            _cachedCdn = null; // cached CDN died — fall through to race
        }
    }

    // Race all CDNs simultaneously with the real request
    const meta = await Promise.any(
        CDN_LIST.map(async cdn => {
            const res = await axios.post(
                `https://${cdn}/v2/info`,
                { url: `https://youtube.com/watch?v=${videoId}` },
                { headers: HEADERS, timeout: 12000 }
            );
            const m = decrypt(res.data.data);
            m._cdn = cdn;
            return m;
        })
    );

    _cachedCdn   = meta._cdn;
    _cacheExpiry = Date.now() + 5 * 60 * 1000;
    return meta;
}

// ── Audio ─────────────────────────────────────────────────────────────────────
// Constructs the CDN URL directly from titleSlug — skips the /download round-trip
// Returns { downloadUrl, title, duration, thumbnail }
async function getAudioUrl(videoId, quality = '320') {
    const meta = await getInfo(videoId);
    const slug  = meta.titleSlug || meta.title?.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    if (!slug) throw new Error('savetube did not return a titleSlug');

    const downloadUrl = `https://${meta._cdn}/media/${videoId}/${slug}-${quality}-ytshorts.savetube.me.mp3`;

    return {
        downloadUrl,
        title:     meta.title     || null,
        duration:  meta.duration  || null,
        thumbnail: meta.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    };
}

// ── Video ─────────────────────────────────────────────────────────────────────
// Tries qualities in priority order until savetube returns a valid downloadUrl
// Returns { downloadUrl, title, duration, thumbnail, quality }
async function getVideoUrl(videoId) {
    const meta      = await getInfo(videoId);
    const available = (meta.video_formats || []).map(f => String(f.quality || f));
    const priority  = ['720', '480', '360', '1080'].filter(q => available.includes(q));
    const queue     = priority.length ? priority : available.length ? available : ['720'];

    let downloadUrl = null;
    let chosen      = null;
    for (const q of queue) {
        const dlRes = await axios.post(
            `https://${meta._cdn}/download`,
            { id: videoId, downloadType: 'video', quality: q, key: meta.key },
            { headers: HEADERS, timeout: 12000 }
        );
        downloadUrl = dlRes.data?.data?.downloadUrl;
        if (downloadUrl) { chosen = q; break; }
    }

    if (!downloadUrl) throw new Error('savetube did not return a downloadUrl');

    return {
        downloadUrl,
        title:     meta.title     || null,
        duration:  meta.duration  || null,
        thumbnail: meta.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        quality:   chosen,
    };
}

module.exports = { getAudioUrl, getVideoUrl };
