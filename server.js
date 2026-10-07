'use strict';
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const required = ['ADMIN_USERNAME', 'ADMIN_PASSWORD', 'SESSION_SECRET'];
const missing = required.filter(k => !process.env[k]);
if (missing.length) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  console.error('Set them in your hosting dashboard or .env file. Do not commit .env.');
  process.exit(1);
}
if (process.env.SESSION_SECRET.length < 32) {
  console.error('SESSION_SECRET must be at least 32 characters.'); process.exit(1);
}
const app = express();
const dataDir = path.resolve(process.env.DATA_DIR || './data');
fs.mkdirSync(dataDir, { recursive: true });
const db = new sqlite3.Database(path.join(dataDir, 'website.sqlite'));
db.serialize(() => {
  db.run('PRAGMA journal_mode = WAL');
  db.run('CREATE TABLE IF NOT EXISTS content (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
});
const adminPasswordHash = bcrypt.hashSync(process.env.ADMIN_PASSWORD, 12);
app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY === '1' ? 1 : false);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '20mb' }));
app.use(session({
  name: 'gmit_admin_session',
  store: new SQLiteStore({ db: 'sessions.sqlite', dir: dataDir, concurrentDB: true }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', maxAge: 2 * 60 * 60 * 1000 }
}));
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: true, legacyHeaders: false, message: { error: 'Terlalu banyak percobaan login. Coba lagi 15 menit.' } });
const requireAdmin = (req, res, next) => req.session?.isAdmin ? next() : res.status(401).json({ error: 'Login admin diperlukan.' });
const reservedKeys = new Set(['gmit_kharisma_admin_session_v1']);
app.post('/api/login', loginLimiter, async (req, res) => {
  const username = String(req.body?.username || '');
  const password = String(req.body?.password || '');
  const validUser = username.length === process.env.ADMIN_USERNAME.length && require('crypto').timingSafeEqual(Buffer.from(username), Buffer.from(process.env.ADMIN_USERNAME));
  const validPass = await bcrypt.compare(password, adminPasswordHash);
  if (!validUser || !validPass) return res.status(401).json({ error: 'Username atau password salah.' });
  req.session.regenerate(err => {
    if (err) return res.status(500).json({ error: 'Tidak dapat membuat sesi login.' });
    req.session.isAdmin = true;
    req.session.save(saveErr => saveErr ? res.status(500).json({ error: 'Tidak dapat menyimpan sesi.' }) : res.json({ ok: true }));
  });
});
app.get('/api/me', (req, res) => res.json({ authenticated: Boolean(req.session?.isAdmin) }));
app.post('/api/logout', (req, res) => req.session.destroy(() => { res.clearCookie('gmit_admin_session'); res.json({ ok: true }); }));
app.get('/api/content', (req, res) => {
  db.all('SELECT key, value FROM content', [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Gagal membaca database.' });
    const content = {}; rows.forEach(row => { content[row.key] = row.value; });
    res.set('Cache-Control', 'no-store'); res.json({ content });
  });
});
app.put('/api/content/:key', requireAdmin, (req, res) => {
  const key = String(req.params.key || ''); const value = req.body?.value;
  if (!/^[a-zA-Z0-9_:-]{1,160}$/.test(key) || reservedKeys.has(key)) return res.status(400).json({ error: 'Kunci data tidak valid.' });
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > 15 * 1024 * 1024) return res.status(413).json({ error: 'Ukuran data tidak valid atau terlalu besar.' });
  db.run('INSERT INTO content(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP', [key, value], err => err ? res.status(500).json({ error: 'Gagal menyimpan data.' }) : res.json({ ok: true }));
});
app.delete('/api/content/:key', requireAdmin, (req, res) => {
  const key = String(req.params.key || '');
  if (!/^[a-zA-Z0-9_:-]{1,160}$/.test(key) || reservedKeys.has(key)) return res.status(400).json({ error: 'Kunci data tidak valid.' });
  db.run('DELETE FROM content WHERE key = ?', [key], err => err ? res.status(500).json({ error: 'Gagal menghapus data.' }) : res.json({ ok: true }));
});
app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use(express.static(__dirname, { index: 'index.html', extensions: ['html'] }));
app.use((err, _req, res, _next) => { console.error(err); res.status(500).json({ error: 'Terjadi kesalahan pada server.' }); });
const port = Number(process.env.PORT || 3000);
app.listen(port, '0.0.0.0', () => console.log(`Website running on port ${port}`));
