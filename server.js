var express = require('express');
var path = require('path');
var fs = require('fs');
var crypto = require('crypto');

var app = express();
var PORT = process.env.PORT || 3456;

// ---------- Data File ----------
var DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
var DATA_FILE = path.join(DATA_DIR, 'entries.json');

// ---------- Auth ----------
var JOURNAL_PASSWORD = process.env.JOURNAL_PASSWORD;
var AUTH_TOKEN = JOURNAL_PASSWORD
  ? crypto.createHash('sha256').update(JOURNAL_PASSWORD + ':journal-salt:v2').digest('hex')
  : null;

function parseCookies(req) {
  var c = req.headers.cookie;
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
  if (req.path === '/' || req.path === '/index.html') {
    return res.sendFile(path.join(__dirname, 'public', 'login.html'));
  }
  next();
}

// ---------- Storage ----------
function loadEntries() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
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
    saveEntries([
      { id: now + Math.random(), title: '你好，日志本', content: '今天开始用这个日志本记录生活。希望能坚持每天写一点，记录下生活中的小确幸和值得回忆的瞬间。', createdAt: fmt(now - 86400000), updatedAt: fmt(now - 86400000) },
      { id: now + Math.random() + 1, title: '周末的午后', content: '下午去了附近新开的那家咖啡馆，环境很棒，有阳光洒进来。点了一杯拿铁，读完了最近在看的书。窗外树影婆娑，店里放着轻音乐，时间好像慢了下来。', createdAt: fmt(now - 43200000), updatedAt: fmt(now - 43200000) }
    ]);
  }
}
ensureSampleData();

// ---------- Middleware ----------
app.use(express.json());
app.use(authMiddleware);
app.use(express.static(path.join(__dirname, 'public')));

// ---------- Auth Routes ----------
app.post('/api/login', function(req, res) {
  var password = req.body && req.body.password;
  if (!JOURNAL_PASSWORD) return res.json({ success: true });
  if (password === JOURNAL_PASSWORD) {
    var maxAge = 30 * 24 * 60 * 60;
    res.setHeader('Set-Cookie', 'auth_token=' + AUTH_TOKEN + '; Path=/; Max-Age=' + maxAge + '; SameSite=Lax');
    return res.json({ success: true });
  }
  return res.status(401).json({ error: '密码错误' });
});

app.post('/api/logout', function(req, res) {
  res.setHeader('Set-Cookie', 'auth_token=; Path=/; Max-Age=0');
  res.json({ success: true });
});

// ---------- API Routes ----------

// GET /api/entries
app.get('/api/entries', function(req, res) {
  var entries = loadEntries();
  entries.sort(function(a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
  res.json(entries);
});

// POST /api/entries
app.post('/api/entries', function(req, res) {
  var title = req.body && req.body.title;
  var content = req.body && req.body.content;
  if (!title || !title.trim()) return res.status(400).json({ error: '标题不能为空' });
  if (!content || !content.trim()) return res.status(400).json({ error: '内容不能为空' });

  var now = new Date();
  function pad(n) { return String(n).padStart(2, '0'); }
  var fmt = now.getFullYear() + '-' + pad(now.getMonth()+1) + '-' + pad(now.getDate()) + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes());

  var entry = {
    id: Date.now() + Math.random(),
    title: title.trim(),
    content: content.trim(),
    createdAt: fmt,
    updatedAt: fmt
  };

  var entries = loadEntries();
  entries.unshift(entry);
  saveEntries(entries);
  res.status(201).json(entry);
});

// DELETE /api/entries/:id
app.delete('/api/entries/:id', function(req, res) {
  var id = parseFloat(req.params.id);
  var password = req.body && req.body.password;

  // If password protection is enabled, verify password
  if (JOURNAL_PASSWORD) {
    if (!password) return res.status(403).json({ error: '需要密码验证' });
    if (password !== JOURNAL_PASSWORD) return res.status(403).json({ error: '密码错误' });
  }

  var entries = loadEntries();
  var idx = entries.findIndex(function(e) { return e.id === id; });
  if (idx === -1) return res.status(404).json({ error: '日记不存在' });

  entries.splice(idx, 1);
  saveEntries(entries);
  res.json({ success: true });
});

// Error handler
app.use(function(err, req, res, next) {
  console.error(err);
  res.status(500).json({ error: '服务器内部错误' });
});

app.listen(PORT, '0.0.0.0', function() {
  console.log('Journal Server started on port ' + PORT);
  if (JOURNAL_PASSWORD) {
    console.log('  Password protection: ON');
  } else {
    console.log('  Password protection: OFF (set JOURNAL_PASSWORD env var to enable)');
  }
});