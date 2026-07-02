'use strict';

const settings = require('./settings');

// ── Redis setup (env-var driven, graceful degradation) ─────────────────────────
let client       = null;
let redisReady   = false;
let redisEnabled = false;

function buildRedisConfig() {
    // Standard Redis URL (Heroku Redis, Railway, Render, Redis Cloud all use this)
    if (process.env.REDIS_URL) return { url: process.env.REDIS_URL };

    // Individual vars fallback (Redis Cloud / custom)
    if (process.env.REDIS_HOST) {
        return {
            username: process.env.REDIS_USERNAME || 'default',
            password: process.env.REDIS_PASSWORD  || undefined,
            socket: {
                host: process.env.REDIS_HOST,
                port: parseInt(process.env.REDIS_PORT || '6379', 10),
                tls:  process.env.REDIS_TLS === 'true',
            },
        };
    }

    return null;
}

const redisCfg = buildRedisConfig();

if (redisCfg) {
    try {
        const { createClient } = require('redis');
        client = createClient(redisCfg);
        client.on('error', (err) => {
            console.error('[Redis] Client Error:', err.message);
            redisReady = false;
        });
        redisEnabled = true;
    } catch (e) {
        console.warn('[Redis] Failed to initialise client:', e.message);
    }
} else {
    console.warn('[Redis] No REDIS_URL / REDIS_HOST env var found — rate limiting disabled.');
}

async function ensureRedis() {
    if (!redisEnabled || !client) return false;
    if (redisReady) return true;
    try {
        await client.connect();
        redisReady = true;
        console.log('[Redis] Connected');
        return true;
    } catch (e) {
        console.error('[Redis] Connection failed:', e.message);
        return false;
    }
}

function periodToSeconds(period) {
    return { minute: 60, hour: 3600, day: 86400 }[period] ?? 86400;
}

// ── Wrapper ────────────────────────────────────────────────────────────────────
function wrap(runFn, options = {}) {
    const messages = {
        missingKey:   'Missing API key parameter.',
        invalidKey:   'Invalid or disabled API key.',
        limitReached: 'Rate limit reached. Please contact the owner for a higher-limit key.',
        ...options.messages,
    };

    return async function (req, res) {
        // Bypass: noLimit endpoints or requireApikey is off globally
        if (options.bypass || !settings.requireApikey) return runFn(req, res);

        const key     = req.query.apikey;
        if (!key) return res.status(400).json({ status: false, error: messages.missingKey });

        const keyData = settings.apikeys[key];
        if (!keyData || !keyData.enabled)
            return res.status(401).json({ status: false, error: messages.invalidKey });

        // If Redis not available, allow the request (degrade gracefully)
        const ok = await ensureRedis();
        if (!ok) return runFn(req, res);

        try {
            const [limitCount, period] = (keyData.rateLimit || '100/day').split('/');
            const max      = parseInt(limitCount, 10) || 100;
            const ttl      = periodToSeconds(period);
            const redisKey = `rate:${key}`;

            let count = parseInt(await client.get(redisKey), 10) || 0;

            if (count >= max) {
                const ttlRemaining = await client.ttl(redisKey);
                return res.status(429).json({
                    status:            false,
                    error:             messages.limitReached,
                    resetInSeconds:    ttlRemaining,
                    rateLimit:         `${max}/${period}`,
                    requestsRemaining: 0,
                });
            }

            if (count === 0) await client.set(redisKey, 1, { EX: ttl });
            else             await client.incr(redisKey);

        } catch (err) {
            // Redis error mid-request — let the call through rather than block the user
            console.error('[Redis] Rate-limit check failed:', err.message);
        }

        return runFn(req, res);
    };
}

module.exports = { wrap };
