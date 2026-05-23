const axios = require('axios');
const cheerio = require('cheerio');

module.exports = {
    name: 'Facebook',
    desc: 'Download any Facebook video (reels, watch, stories, pages, groups)',
    category: 'Downloader',
    params: ['apikey', 'url'],
    async run(req, res) {
        const { url } = req.query;

        if (!url) {
            return res.status(400).json({
                status: false,
                error: "Parameter 'url' is required"
            });
        }

        if (!/facebook\.com|fb\.watch|fb\.com/i.test(url)) {
            return res.status(400).json({
                status: false,
                error: 'Invalid Facebook URL'
            });
        }

        try {
            const dl = new FacebookDL();
            const data = await dl.download(url);
            return res.status(200).json({ status: true, data });
        } catch (error) {
            return res.status(500).json({
                status: false,
                error: error.message || 'Failed to fetch video'
            });
        }
    }
};

class FacebookDL {
    constructor() {
        this.timeout = 15000;
    }

    // ─── Normalize any FB URL to a canonical form ──────────────────────────
    #normalizeUrl(url) {
        url = url.trim();

        // fb.watch short links → expand by following redirect
        // reel → /videos/ style works on mbasic
        // /watch/?v=ID → /video/ID
        url = url
            .replace('web.facebook.com', 'www.facebook.com')
            .replace('fb.com', 'www.facebook.com');

        return url;
    }

    // Build several URL variants to try
    #buildVariants(url) {
        const norm = this.#normalizeUrl(url);
        const mbasic = norm.replace('www.facebook.com', 'mbasic.facebook.com');
        const mobile = norm.replace('www.facebook.com', 'm.facebook.com');

        // Also try extracting video ID from URL
        const idMatch = norm.match(/(?:v=|\/videos?\/)(\d{10,})/);
        const reelMatch = norm.match(/\/reel\/(\d{10,})/);
        const watchMatch = norm.match(/watch.*v=(\d{10,})/);

        const videoId = idMatch?.[1] || reelMatch?.[1] || watchMatch?.[1];

        const extras = videoId
            ? [
                `https://mbasic.facebook.com/video/video.php?v=${videoId}`,
                `https://mbasic.facebook.com/watch/?v=${videoId}`,
                `https://mbasic.facebook.com/${videoId}`,
              ]
            : [];

        return [mbasic, mobile, ...extras];
    }

    // ─── Header factory ────────────────────────────────────────────────────
    #headers(referer = 'https://mbasic.facebook.com/') {
        return {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 12; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Referer': referer,
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'same-origin',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
        };
    }

    // ─── Comprehensive video URL extractor from raw HTML ──────────────────
    #extractFromHtml(html) {
        const decode = str => {
            try {
                return decodeURIComponent(
                    str.replace(/\\/g, '')
                       .replace(/&amp;/g, '&')
                       .replace(/\\u0025/g, '%')
                );
            } catch { return str.replace(/\\/g, '').replace(/&amp;/g, '&'); }
        };

        const videos = {};

        const patterns = [
            // Facebook internal video data keys
            { sd: /"sd_src_no_ratelimit"\s*:\s*"([^"]+)"/, hd: /"hd_src_no_ratelimit"\s*:\s*"([^"]+)"/ },
            { sd: /"sd_src"\s*:\s*"([^"]+)"/, hd: /"hd_src"\s*:\s*"([^"]+)"/ },
            { sd: /browser_native_sd_url['"]\s*:\s*['"]([^'"]+)['"]/, hd: /browser_native_hd_url['"]\s*:\s*['"]([^'"]+)['"]/ },
            { sd: /"playable_url"\s*:\s*"([^"]+)"/, hd: /"playable_url_quality_hd"\s*:\s*"([^"]+)"/ },
            { sd: /"sd_src_backup"\s*:\s*"([^"]+)"/, hd: /"hd_src_backup"\s*:\s*"([^"]+)"/ },
            // Reel / watch page formats
            { sd: /FBQualityLabel\\":(?:\\"|")360(?:\\"|")[^}]+?\\"src\\":(?:\\"|")([^'"\\]+)/, hd: /FBQualityLabel\\":(?:\\"|")720(?:\\"|")[^}]+?\\"src\\":(?:\\"|")([^'"\\]+)/ },
            // Generic mp4 fbcdn link in any attr
            { sd: /"(https:\/\/video[^"]*fbcdn[^"]*\.mp4[^"]*)"/, hd: null },
        ];

        for (const p of patterns) {
            if (!videos.sd && p.sd) {
                const m = html.match(p.sd);
                if (m?.[1]) videos.sd = decode(m[1]);
            }
            if (!videos.hd && p.hd) {
                const m = html.match(p.hd);
                if (m?.[1]) videos.hd = decode(m[1]);
            }
        }

        // Scan <video> and <source> tags
        if (!videos.sd) {
            const $ = cheerio.load(html);
            $('video, source').each((_, el) => {
                const src = $(el).attr('src') || $(el).attr('data-src') || '';
                if (!videos.sd && src && (src.includes('fbcdn') || src.includes('.mp4'))) {
                    videos.sd = src;
                }
            });
        }

        // Collect all fbcdn video links as a last resort
        if (!videos.sd && !videos.hd) {
            const allLinks = [...html.matchAll(/https:\\?\/\\?\/video[a-z0-9\-]*\.fbcdn\.net[^\s"'<>\\]+/g)]
                .map(m => m[0].replace(/\\/g, '').replace(/&amp;/g, '&'));
            if (allLinks[0]) videos.sd = allLinks[0];
            if (allLinks[1]) videos.hd = allLinks[1];
        }

        return videos;
    }

    // ─── Meta extraction ───────────────────────────────────────────────────
    #extractMeta(html) {
        const $ = cheerio.load(html);
        const title =
            $('meta[property="og:title"]').attr('content') ||
            $('meta[name="title"]').attr('content') ||
            $('h1, h2, strong').first().text().trim() ||
            'Facebook Video';
        const thumbnail =
            $('meta[property="og:image"]').attr('content') ||
            $('meta[property="og:image:url"]').attr('content') ||
            null;
        return { title, thumbnail };
    }

    // ─── Strategy 1: Scrape mbasic / mobile URL variants ──────────────────
    async #scrapeVariants(url) {
        const variants = this.#buildVariants(url);
        let lastErr = null;

        for (const variant of variants) {
            try {
                const { data: html } = await axios.get(variant, {
                    headers: this.#headers(variant),
                    timeout: this.timeout,
                    maxRedirects: 8,
                });
                const videos = this.#extractFromHtml(html);
                if (videos.sd || videos.hd) {
                    const { title, thumbnail } = this.#extractMeta(html);
                    return { title, thumbnail, videos };
                }
            } catch (e) { lastErr = e; }
        }

        throw lastErr || new Error('No video found from direct scrape');
    }

    // ─── Strategy 2: fb.watch shortlink resolver ──────────────────────────
    async #resolveFbWatch(url) {
        if (!/fb\.watch/i.test(url)) throw new Error('Not a fb.watch URL');

        const { request } = await axios.get(url, {
            headers: this.#headers(),
            timeout: this.timeout,
            maxRedirects: 10,
        });

        const resolvedUrl = request?.res?.responseUrl || url;
        return this.#scrapeVariants(resolvedUrl);
    }

    // ─── Strategy 3: getfvid.com ──────────────────────────────────────────
    async #tryGetFvid(url) {
        const { data: html } = await axios.post(
            'https://www.getfvid.com/downloader',
            new URLSearchParams({ url }),
            {
                headers: {
                    ...this.#headers('https://www.getfvid.com/'),
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Origin': 'https://www.getfvid.com',
                    'Accept': 'text/html,*/*',
                },
                timeout: this.timeout,
            }
        );

        const $ = cheerio.load(html);
        const videos = {};
        const { title, thumbnail } = this.#extractMeta(html);

        // getfvid labels links clearly
        $('a[href]').each((_, el) => {
            const href = $(el).attr('href') || '';
            const label = ($(el).text() + ' ' + ($(el).attr('class') || '')).toLowerCase();
            if (!href.startsWith('http')) return;
            if (label.includes('hd') || label.includes('high')) videos.hd = href;
            else if (label.includes('sd') || label.includes('normal') || label.includes('low')) videos.sd = href;
            else if ((href.includes('fbcdn') || href.includes('.mp4')) && !videos.sd) videos.sd = href;
        });

        // Also scan raw html for fbcdn links
        if (!videos.sd && !videos.hd) {
            const raw = this.#extractFromHtml(html);
            Object.assign(videos, raw);
        }

        return { title, thumbnail, videos };
    }

    // ─── Strategy 4: savefb.com ───────────────────────────────────────────
    async #trySaveFb(url) {
        const { data } = await axios.get('https://savefb.com/api/', {
            params: { url },
            headers: {
                ...this.#headers('https://savefb.com/'),
                'Accept': 'application/json, */*',
            },
            timeout: this.timeout,
        });

        if (!data || data.error) throw new Error('savefb returned error');

        return {
            title: data.title || 'Facebook Video',
            thumbnail: data.thumbnail || null,
            videos: { sd: data.sd || data.url || null, hd: data.hd || null },
        };
    }

    // ─── Main download orchestrator ────────────────────────────────────────
    async download(url) {
        url = this.#normalizeUrl(url);

        const strategies = [
            () => this.#scrapeVariants(url),
            ...((/fb\.watch/i.test(url)) ? [() => this.#resolveFbWatch(url)] : []),
            () => this.#tryGetFvid(url),
            () => this.#trySaveFb(url),
        ];

        let lastError = null;

        for (const strategy of strategies) {
            try {
                const result = await strategy();
                if (result?.videos?.sd || result?.videos?.hd) {
                    // Clean up empty keys
                    if (!result.videos.sd) delete result.videos.sd;
                    if (!result.videos.hd) delete result.videos.hd;
                    return result;
                }
            } catch (e) {
                lastError = e;
            }
        }

        throw new Error(
            'Could not extract video. The video may be private, age-restricted, or unavailable in this region. Make sure it is publicly accessible.'
        );
    }
}
