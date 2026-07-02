'use strict';

const express = require('express');
const fs      = require('fs');
const path    = require('path');
const set     = require('./settings');
const chalk   = require('chalk');

const app  = express();
const PORT = process.env.PORT || 5000;

const logger = {
    info:  (msg) => console.log(chalk.dim.blue('•')  + chalk.dim(' info  - ') + msg),
    ready: (msg) => console.log(chalk.dim.green('•') + chalk.dim(' ready - ') + msg),
    warn:  (msg) => console.log(chalk.dim.yellow('•')+ chalk.dim(' warn  - ') + msg),
    error: (msg) => console.log(chalk.dim.red('•')   + chalk.dim(' error - ') + msg),
};

// ── Core middleware ────────────────────────────────────────────────────────────
app.set('trust proxy', true);
app.set('json spaces', 2);

// CORS — allow any origin (public API)
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use('/', express.static(path.join(__dirname, 'docs')));

// ── Response envelope ──────────────────────────────────────────────────────────
app.use((req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = function (data) {
        if (data && typeof data === 'object') {
            return originalJson({
                status:     data.status,
                statusCode: res.statusCode || 200,
                creator:    set.author.toLowerCase(),
                ...data
            });
        }
        return originalJson(data);
    };
    next();
});

// ── Endpoint loader ────────────────────────────────────────────────────────────
function loadEndpointsFromDirectory(directory, baseRoute = '') {
    let endpoints = [];
    const fullPath = path.join(__dirname, directory);

    if (!fs.existsSync(fullPath)) {
        logger.warn(`Directory not found: ${fullPath}`);
        return endpoints;
    }

    logger.info(`Scanning directory: ${directory}...`);
    const { wrap } = require('./rateLimit');

    for (const item of fs.readdirSync(fullPath)) {
        const itemPath = path.join(fullPath, item);
        const stats    = fs.statSync(itemPath);

        if (stats.isDirectory()) {
            console.log('');
            logger.info(`Found subdirectory: ${item}`);
            endpoints = [
                ...endpoints,
                ...loadEndpointsFromDirectory(path.join(directory, item), `${baseRoute}/${item}`)
            ];
        } else if (stats.isFile() && item.endsWith('.js')) {
            try {
                const mod = require(itemPath);
                if (!mod || typeof mod.run !== 'function') continue;

                const endpointName = item.replace('.js', '');
                const endpointPath = `${baseRoute}/${endpointName}`;

                app.all(endpointPath, wrap(mod.run, { bypass: !!mod.noLimit }));

                const fullPathWithParams = mod.params?.length
                    ? endpointPath + '?' + mod.params.map(p => `${p}=`).join('&')
                    : endpointPath;

                const category = mod.category || 'Other';
                let cat = endpoints.find(e => e.name === category);
                if (!cat) { cat = { name: category, items: [] }; endpoints.push(cat); }

                cat.items.push({ [mod.name || endpointName]: { desc: mod.desc || '', path: fullPathWithParams } });
                logger.ready(`${chalk.green(endpointPath)} ${chalk.dim('(')}${chalk.cyan(category)}${chalk.dim(')')}`);
            } catch (err) {
                logger.error(`Failed to load ${itemPath}: ${err.message}`);
            }
        }
    }

    return endpoints;
}

// ── Routes ─────────────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'docs', 'index.html')));

logger.info('Starting server initialization...');
logger.info('Loading API endpoints...');
const allEndpoints = loadEndpointsFromDirectory('api');
console.log('');
logger.ready(`Loaded ${allEndpoints.reduce((n, c) => n + c.items.length, 0)} endpoints`);

app.get('/endpoints', (req, res) => {
    res.json({
        status:    true,
        count:     allEndpoints.reduce((n, c) => n + c.items.length, 0),
        endpoints: allEndpoints
    });
});

app.get('/set', (req, res) => res.json({ status: true, ...set }));

// ── Audio stream proxy ─────────────────────────────────────────────────────────
app.get('/stream', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'url is required' });

    const axios = require('axios');
    try {
        const upstream = await axios({
            method: 'get', url, responseType: 'stream',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36',
                ...(req.headers['range'] ? { Range: req.headers['range'] } : {}),
            },
            timeout: 30000,
        });
        res.setHeader('Content-Type',  upstream.headers['content-type']  || 'audio/webm');
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'no-cache');
        if (upstream.headers['content-length']) res.setHeader('Content-Length', upstream.headers['content-length']);
        if (upstream.headers['content-range'])  res.setHeader('Content-Range',  upstream.headers['content-range']);
        res.status(upstream.status === 206 ? 206 : 200);
        upstream.data.pipe(res);
        req.on('close', () => upstream.data.destroy());
    } catch (e) {
        if (!res.headersSent) res.status(502).json({ error: 'Stream proxy error: ' + e.message });
    }
});

// ── Error handlers ─────────────────────────────────────────────────────────────
app.use((req, res) => {
    logger.info(`404: ${req.method} ${req.path}`);
    res.status(404).sendFile(path.join(__dirname, 'docs', 'err', '404.html'));
});

app.use((err, req, res, _next) => {
    logger.error(`500: ${err.message}`);
    res.status(500).sendFile(path.join(__dirname, 'docs', 'err', '500.html'));
});

// ── Listen — skipped on Vercel / other serverless platforms ───────────────────
if (require.main === module) {
    app.listen(PORT, () => {
        console.log('');
        logger.ready('Server started successfully');
        logger.info(`Local:   ${chalk.cyan(`http://localhost:${PORT}`)}`);

        try {
            const { networkInterfaces } = require('os');
            const nets = networkInterfaces();
            for (const addrs of Object.values(nets)) {
                for (const net of addrs) {
                    if (net.family === 'IPv4' && !net.internal)
                        logger.info(`Network: ${chalk.cyan(`http://${net.address}:${PORT}`)}`);
                }
            }
        } catch { /* ignore */ }

        logger.info(chalk.dim('Ready for connections'));
    });
}

module.exports = app;
