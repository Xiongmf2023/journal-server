const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3456;

// ---------- Data File ----------
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const DATA_DIR = path.join(__dirname, 'data');

// Ensure directories exist
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DATA_FILE = path.join(DATA_DIR, 'entries.json');

// ---------- Auth ----------
const JOURNAL_PASSWORD = process.env.JOURNAL_PASSWORD;
const AUTH_TOKEN = JOURNAL_PASSWORD
  ? crypto.createHash('sha256').update(JOURNAL_PASSWORD + ':journal-salt:v2').digest('hex')
  : null;

function parseCookies(req) {
  const c = req.headers.cookie;
  if (!c) return {};
  return c.split(';').reduce(function(acc, cookie) {
    var parts = cookie.trim().split('=');
    acc[parts[0]] = decodeURIComponent(parts.slice(1).join('='));
    return acc;
  }, {});
}

function authMiddleware(req, res, next) {
  if (!JOURNAL_PASSWORD) return next();
  if (req.path === '/login.html' || req.path === '/api/login' || req.path === '/api/logout') return next();
  if (req.method === 'OPTIONS') return next();

  var cookies = parseCookies(req);
  if (cookies.auth_token === AUTH_TOKEN) return next();

  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  // For page requests, serve the login page instead of redirecting
  // (to handle SPA-style navigation)
  if (req.path === '/' || req.path === '/index.html') {
    return res.sendFile(path.join(__dirname, 'public', 'login.html'));
  }
  next();
}

// ---------- Storage Read/Write ----------
function loadEntries() {
  try {
    var raw = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (e) { return []; }
}

function saveEntries(entries) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(entries, null, 2), 'utf-8');
}

// Initialize 2 sample entries
function ensureSampleData() {
  var entries = loadEntries();
  if (entries.length === 0) {
    var now = Date.now();
    function fmt(ts) {
      var d = new Date(ts);
      function pad(n) { return String(n).padStart(2, '0'); }
      return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    }
    var samples = [
      { id: now + Math.random(), title: 'Hello, Journal!', content: 'Started using this journal app today. Hope to record little moments of life every day.', photo: null, createdAt: fmt(now - 86400000), updatedAt: fmt(now - 86400000) },
      { id: now + Math.random() + 1, title: 'Weekend Afternoon', content: 'Went to the new cafe nearby. Great atmosphere, sunlight streaming in. Finished the book I have been reading lately.', photo: null, createdAt: fmt(now - 43200000), updatedAt: fmt(now - 43200000) }
    ];
    saveEntries(samples);
  }
}
ensureSampleData();

// ---------- Middleware ----------
app.use(express.json());
app.use(authMiddleware);
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- Auth Routes ----------
// POST /api/login - Verify password and set auth cookie
app.post('/api/login', function(req, res) {
  var password = req.body && req.body.password;
  if (!JOURNAL_PASSWORD) {
    return res.json({ success: true, message: 'No password required' });
  }
  if (password === JOURNAL_PASSWORD) {
    // Set cookie that expires in 30 days
    var maxAge = 30 * 24 * 60 * 60 * 1000;
    res.setHeader('Set-Cookie', 'auth_token=' + AUTH_TOKEN + '; Path=/; Max-Age=' + (maxAge / 1000) + '; SameSite=Lax');
    return res.json({ success: true });
  }
  return res.status(401).json({ error: '密码错误' });
});

// POST /api/logout - Clear auth cookie
app.post('/api/logout', function(req, res) {
  res.setHeader('Set-Cookie', 'auth_token=; Path=/; Max-Age=0');
  res.json({ success: true });
});

// File upload config
var storage = multer.diskStorage({
  destination: function(req, file, cb) { cb(null, UPLOAD_DIR); },
  filename: function(req, file, cb) {
    var ext = path.extname(file.originalname) || '.jpg';
    cb(null, Date.now() + '-' + Math.random().toString(36).slice(2, 8) + ext);
  }
});
var upload = multer({
  storage: storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: function(req, file, cb) {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('仅支持图片文件'));
  }
});

// ---------- API Routes ----------

// GET /api/entries - Get all entries (sorted by time desc)
app.get('/api/entries', function(req, res) {
  var entries = loadEntries();
  entries.sort(function(a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
  res.json(entries);
});

// POST /api/entries - Create entry
app.post('/api/entries', upload.single('photo'), function(req, res) {
  var title = req.body.title;
  var content = req.body.content;
  if (!title || !title.trim()) return res.status(400).json({ error: '标题不能为空' });
  if (!content || !content.trim()) return res.status(400).json({ error: '内容不能为空' });

  var now = new Date();
  function pad(n) { return String(n).padStart(2, '0'); }
  var fmt = now.getFullYear() + '-' + pad(now.getMonth()+1) + '-' + pad(now.getDate()) + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes());

  var entry = {
    id: Date.now() + Math.random(),
    title: title.trim(),
    content: content.trim(),
    photo: req.file ? '/uploads/' + req.file.filename : null,
    createdAt: fmt,
    updatedAt: fmt
  };

  var entries = loadEntries();
  entries.unshift(entry);
  saveEntries(entries);

  res.status(201).json(entry);
});

// DELETE /api/entries/:id - Delete entry
app.delete('/api/entries/:id', function(req, res) {
  var id = parseFloat(req.params.id);
  var entries = loadEntries();
  var idx = entries.findIndex(function(e) { return e.id === id; });
  if (idx === -1) return res.status(404).json({ error: '日记不存在' });

  // Delete associated photo file
  var entry = entries[idx];
  if (entry.photo) {
    var filePath = path.join(__dirname, entry.photo);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }

  entries.splice(idx, 1);
  saveEntries(entries);
  res.json({ success: true });
});

// Error handler
app.use(function(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: '照片大小不能超过 8MB' });
    return res.status(400).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: '服务器内部错误' });
});

app.listen(PORT, '0.0.0.0', function() {
  console.log('Journal Server started');
  console.log('  http://localhost:' + PORT);
  if (JOURNAL_PASSWORD) {
    console.log('  Password protection: ON');
  } else {
    console.log('  Password protection: OFF (set JOURNAL_PASSWORD env var to enable)');
  }
  var os = require('os');
  var ifaces = os.networkInterfaces();
  Object.keys(ifaces).forEach(function(ifname) {
    ifaces[ifname].forEach(function(iface) {
      if (iface.family === 'IPv4' && !iface.internal) {
        console.log('  http://' + iface.address + ':' + PORT + '  (LAN)');
      }
    });
  });
});