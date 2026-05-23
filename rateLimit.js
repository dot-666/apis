const { createClient } = require('redis');
const settings = require('./settings');

const client = createClient({
    username: 'default',
    password: 'xR5oX4ic7EDkIYKNhyISZmQmPR71fEbB',
    socket: {
        host: 'redis-18464.c124.us-central1-1.gce.redns.redis-cloud.com',
        port: 18464,
    },
});

client.on('error', (err) => console.error('[Redis] Client Error:', err));

let redisReady = false;
async function ensureRedis() {
    if (!redisReady) {
        await client.connect();
        redisReady = true;
        console.log('[Redis] Connected');
    }
}

function periodToSeconds(period) {
    const mapping = { minute: 60, hour: 3600, day: 86400 };
    return mapping[period] || mapping.day;
}

/**
 * Advanced API Key & Rate Limit Wrapper (JSON-only)
 * @param {Function} runFn - original plugin run function
 * @param {Object} options - optional advanced settings
 */
function wrap(runFn, options = {}) {
    const messages = {
        missingKey: 'Missing API key parameter.',
        invalidKey: 'Invalid or disabled API key.',
        limitReached: 'Rate limit reached. Please contact the owner to purchase a higher limit API key.',
        ...options.messages
    };

    return async function (req, res) {
        console.log('[Wrapper] Called:', req.path, 'API key:', req.query.apikey);

        if (!settings.requireApikey) return runFn(req, res);

        try {
            await ensureRedis();

            const key = req.query.apikey;
            if (!key) return res.status(400).json({ status: false, error: messages.missingKey });

            const keyData = settings.apikeys[key];
            if (!keyData || !keyData.enabled) return res.status(401).json({ status: false, error: messages.invalidKey });

            const [limitCount, period] = keyData.rateLimit?.split('/') || ['100', 'day'];
            const max = parseInt(limitCount, 10) || 100;
            const ttl = periodToSeconds(period);

            const redisKey = `rate:${key}`;
            let count = parseInt(await client.get(redisKey)) || 0;

            if (count >= max) {
                const ttlRemaining = await client.ttl(redisKey);
                return res.status(429).json({
                    status: false,
                    error: messages.limitReached,
                    resetInSeconds: ttlRemaining,
                    rateLimit: `${max}/${period}`,
                    requestsRemaining: 0,
                });
            }

            if (count === 0) {
                await client.set(redisKey, 1, { EX: ttl });
                count = 1;
            } else {
                count = await client.incr(redisKey);
            }

            const requestsRemaining = max - count;

            // Optional soft-limit warning
            if (options.softLimitWarning && requestsRemaining <= options.softLimitWarning) {
                console.log(`[Wrapper] Warning: Approaching rate limit. ${requestsRemaining} requests left.`);
            }

        } catch (err) {
            console.error('[Redis] Error:', err);
            return res.status(500).json({ status: false, error: 'Internal Server Error' });
        }

        return runFn(req, res);
    };
}

module.exports = { wrap };
