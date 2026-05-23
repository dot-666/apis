const express = require('express');
const router = express.Router();
const { createClient } = require('redis');

const client = createClient({
    username: 'default',
    password: 'xR5oX4ic7EDkIYKNhyISZmQmPR71fEbB',
    socket: {
        host: 'redis-18464.c124.us-central1-1.gce.redns.redis-cloud.com',
        port: 18464
    }
});

client.on('error', err => console.error('Redis Admin Error', err));

let redisReady = false;
async function ensureRedis() {
    if (!redisReady) {
        await client.connect();
        redisReady = true;
        console.log('Redis connected (admin)');
    }
}

// simple admin auth
const ADMIN_KEY = "super-secret-admin-key";

function checkAdmin(req, res) {
    const key = req.body.adminKey || req.query.adminKey;
    if (!key || key !== ADMIN_KEY) {
        res.status(403).json({ status:false, error:'Unauthorized' });
        return false;
    }
    return true;
}

// List keys
router.get('/keys', async (req,res)=>{
    if(!checkAdmin(req,res)) return;
    await ensureRedis();
    const all = await client.hGetAll('apikeys');
    const keys = Object.entries(all).map(([k,v])=>{
        const obj = JSON.parse(v);
        return { key:k, rateLimit: obj.rateLimit, enabled: obj.enabled };
    });
    res.json({ status:true, keys });
});

// Add key
router.post('/add-key', async (req,res)=>{
    if(!checkAdmin(req,res)) return;
    await ensureRedis();
    const { key, rateLimit, enabled } = req.body;
    if(!key || !rateLimit) return res.status(400).json({ status:false, error:'Missing key or rateLimit' });
    await client.hSet('apikeys', key, JSON.stringify({ rateLimit, enabled }));
    res.json({ status:true });
});

// Toggle key
router.post('/toggle-key', async (req,res)=>{
    if(!checkAdmin(req,res)) return;
    await ensureRedis();
    const { key } = req.body;
    const dataRaw = await client.hGet('apikeys', key);
    if(!dataRaw) return res.status(404).json({ status:false, error:'Key not found' });
    const data = JSON.parse(dataRaw);
    data.enabled = !data.enabled;
    await client.hSet('apikeys', key, JSON.stringify(data));
    res.json({ status:true });
});

// Delete key
router.post('/delete-key', async (req,res)=>{
    if(!checkAdmin(req,res)) return;
    await ensureRedis();
    const { key } = req.body;
    await client.hDel('apikeys', key);
    res.json({ status:true });
});

module.exports = router;
