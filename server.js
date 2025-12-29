// Minimal Express backend for NEMEC (SQLite + admin token)
// - Public: POST /api/users (register), POST /api/posts, GET /api/posts
// - Admin (requires Authorization: Bearer <TOKEN>): GET /api/users, DELETE /api/users/:id, admin import/export/backup

const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

// File-based JSON store (replaces sqlite3 native dependency)
const DATA_FILE = path.join(__dirname, 'data.json');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const BACKUPS_DIR = path.join(__dirname, 'backups');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });
// ensure data file exists
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({ users: [], posts: [] }, null, 2), 'utf8');

// Admin token
let ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
if (!ADMIN_TOKEN) {
  ADMIN_TOKEN = uuidv4();
  console.log('Generated ADMIN_TOKEN:', ADMIN_TOKEN);
} else {
  console.log('Using ADMIN_TOKEN from environment');
}

function loadData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) { return { users: [], posts: [] }; }
}
function saveData(data) { fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8'); }

async function initDb() {
  // no-op for JSON store (file created above). Keep for compatibility.
  return;
}

function saveDataUrlToFile(dataUrl, folder = UPLOAD_DIR) {
  if (!dataUrl || !dataUrl.includes(',')) return null;
  const parts = dataUrl.split(',');
  const meta = parts[0];
  const b64 = parts[1];
  const m = /data:(.*?);base64/.exec(meta);
  const mime = m ? m[1] : 'application/octet-stream';
  // strip non-ASCII characters from extension (use hex escapes to avoid embedded control chars)
  const ext = (mime.split('/')[1] || 'bin').replace(/[^\x00-\x7F]/g, '');
  const filename = `${uuidv4()}.${ext}`;
  const filepath = path.join(folder, filename);
  const buf = Buffer.from(b64, 'base64');
  fs.writeFileSync(filepath, buf);
  return '/uploads/' + filename;
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use('/uploads', express.static(UPLOAD_DIR));

// admin middleware
function requireAdmin(req, res, next) {
  const auth = (req.headers.authorization||'').trim();
  let token = '';
  if (auth.toLowerCase().startsWith('bearer ')) token = auth.slice(7).trim();
  else if (req.query && req.query.admin) token = req.query.admin;
  if (!token || token !== ADMIN_TOKEN) return res.status(401).json({ error: 'Unauthorized (admin token required)' });
  next();
}

// initialize DB
initDb().catch(e=>{ console.error('DB init failed', e); process.exit(1); });

// Public endpoints
app.post('/api/users', async (req, res) => {
  const body = req.body || {};
  if (!body.email || !body.name) return res.status(400).json({ error: 'name and email required' });
  try {
    const id = uuidv4();
    let profilePic = null; let productPic = null;
    if (body.profilePic && body.profilePic.startsWith('data:')) profilePic = saveDataUrlToFile(body.profilePic);
    else if (body.profilePic) profilePic = body.profilePic;
    if (body.productPic && body.productPic.startsWith('data:')) productPic = saveDataUrlToFile(body.productPic);
    else if (body.productPic) productPic = body.productPic;
    const data = loadData();
    const newUser = {
      id,
      name: body.name,
      email: body.email,
      phoneNumber: body.phoneNumber||'',
      department: body.department||'',
      service: body.service||'',
      description: body.description||'',
      profilePic: profilePic||'',
      productPic: productPic||'',
      registeredAt: Date.now()
    };
    // enforce unique email
    if (data.users.find(u=>u.email && u.email.toLowerCase() === (newUser.email||'').toLowerCase())) {
      return res.status(409).json({ error: 'User already exists' });
    }
    data.users.push(newUser);
    saveData(data);
    res.json(newUser);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/posts', async (req, res) => {
  const b = req.body || {};
  try {
    const id = uuidv4();
    let image=null, video=null, audio=null;
    if (b.image && b.image.startsWith('data:')) image = saveDataUrlToFile(b.image);
    else if (b.image) image = b.image;
    if (b.video && b.video.startsWith('data:')) video = saveDataUrlToFile(b.video);
    else if (b.video) video = b.video;
    if (b.audio && b.audio.startsWith('data:')) audio = saveDataUrlToFile(b.audio);
    else if (b.audio) audio = b.audio;
    const data = loadData();
    const newPost = {
      id,
      title: b.title||'',
      description: b.description||'',
      department: b.department||'',
      image: image||'',
      video: video||'',
      audio: audio||'',
      authorEmail: b.authorEmail||'',
      createdAt: Date.now()
    };
    data.posts.push(newPost);
    saveData(data);
    res.json(newPost);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/posts', async (req, res) => {
  try { const data = loadData(); const rows = (data.posts||[]).slice().sort((a,b)=>b.createdAt - a.createdAt); res.json(rows); } catch(e){ res.status(500).json({ error:'Server error' }); }
});

// Admin endpoints (protected)
app.get('/api/users', requireAdmin, async (req, res) => {
  try { const data = loadData(); const rows = (data.users||[]).slice().sort((a,b)=>b.registeredAt - a.registeredAt); res.json(rows); } catch(e){ res.status(500).json({ error:'Server error' }); }
});

app.delete('/api/users/:id', requireAdmin, async (req, res) => {
  const id = req.params.id;
  try {
    const data = loadData();
    const before = data.users.length;
    const lowered = (id||'').toLowerCase();
    data.users = data.users.filter(u => !(u.id === id || (u.email||'').toLowerCase() === lowered));
    const deleted = before - data.users.length;
    saveData(data);
    res.json({ deleted });
  } catch(e){ res.status(500).json({ error:'Server error' }); }
});

app.delete('/api/posts/:id', requireAdmin, async (req, res) => {
  const id = req.params.id;
  try {
    const data = loadData();
    const before = data.posts.length;
    data.posts = data.posts.filter(p => p.id !== id);
    const deleted = before - data.posts.length;
    saveData(data);
    res.json({ deleted });
  } catch(e){ res.status(500).json({ error:'Server error' }); }
});

// Admin export/import
app.get('/api/admin/export', requireAdmin, async (req, res) => {
  try {
    const data = loadData();
    res.json({ users: data.users||[], posts: data.posts||[] });
  } catch(e){ res.status(500).json({ error:'Server error' }); }
});

app.post('/api/admin/import', requireAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const users = Array.isArray(body.users) ? body.users : [];
    const posts = Array.isArray(body.posts) ? body.posts : [];
    // simple insert if not exists by email or id
    const data = loadData();
    for (const u of users) {
      try {
        const id = u.id || uuidv4();
        const exists = data.users.find(x => x.id === id || (x.email||'').toLowerCase() === (u.email||'').toLowerCase());
        if (!exists) {
          data.users.push({ id, name: u.name||'', email: u.email||'', phoneNumber: u.phoneNumber||'', department: u.department||'', service: u.service||'', description: u.description||'', profilePic: u.profilePic||'', productPic: u.productPic||'', registeredAt: u.registeredAt?Number(u.registeredAt):Date.now() });
        }
      } catch(e) { /* ignore single errors */ }
    }
    for (const p of posts) {
      try {
        const id = p.id || uuidv4();
        const exists = data.posts.find(x => x.id === id);
        if (!exists) {
          data.posts.push({ id, title: p.title||'', description: p.description||'', department: p.department||'', image: p.image||'', video: p.video||'', audio: p.audio||'', authorEmail: p.authorEmail||'', createdAt: p.createdAt?Number(p.createdAt):Date.now() });
        }
      } catch(e) { }
    }
    saveData(data);
    res.json({ imported:{ users: users.length, posts: posts.length } });
  } catch(e){ console.error(e); res.status(500).json({ error:'Server error' }); }
});

app.post('/api/admin/backup', requireAdmin, async (req, res) => {
  try {
    const ts = Date.now();
    const data = loadData();
    const out = { users: data.users||[], posts: data.posts||[] };
    const file = path.join(BACKUPS_DIR, `backup-${ts}.json`);
    fs.writeFileSync(file, JSON.stringify(out, null, 2), 'utf8');
    res.json({ backup: path.basename(file) });
  } catch(e){ console.error(e); res.status(500).json({ error:'Server error' }); }
});

// stats (admin-only)
app.get('/api/stats', requireAdmin, async (req, res) => {
  try {
    const data = loadData();
    res.json({ users: (data.users||[]).length, posts: (data.posts||[]).length });
  } catch(e){ res.status(500).json({ error:'Server error' }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('NEMEC backend running on port', PORT));

