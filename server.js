const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3456;

// ===== Data Storage =====
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DATA_FILE = path.join(DATA_DIR, 'entries.json');

function loadEntries() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return [];
  }
}
function saveEntries(entries) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(entries, null, 2), 'utf8');
}

// ===== Auth =====
const JOURNAL_PASSWORD = process.env.JOURNAL_PASSWORD || '';
const AUTH_TOKEN = JOURNAL_PASSWORD
  ? crypto.createHash('sha256').update(JOURNAL_PASSWORD + ':journal-salt').digest('hex')
  : '';

function getCookies(req) {
  if (!req.headers.cookie) return {};
  const result = {};
  req.headers.cookie.split(';').forEach(c => {
    const p = c.trim().split('=');
    result[p[0]] = decodeURIComponent(p.slice(1).join('='));
  });
  return result;
}

function auth(req, res, next) {
  if (!JOURNAL_PASSWORD) return next();
  if (req.path === '/login.html' || req.path.startsWith('/api/login') || req.path.startsWith('/api/logout')) return next();
  if (req.method === 'OPTIONS') return next();

  const cookies = getCookies(req);
  if (cookies.auth_token === AUTH_TOKEN) return next();

  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (req.path === '/' || req.path === '/index.html') {
    return res.sendFile(path.join(__dirname, 'public', 'login.html'));
  }
  next();
}

// ===== Middleware =====
app.use(express.json({ limit: '10mb' }));
app.use(auth);
app.use(express.static(path.join(__dirname, 'public')));

// ===== Auth Routes =====
app.post('/api/login', (req, res) => {
  if (!JOURNAL_PASSWORD) return res.json({ success: true });

  const password = req.body && req.body.password;
  if (password === JOURNAL_PASSWORD) {
    const maxAge = 30 * 24 * 60 * 60;
    res.setHeader('Set-Cookie', `auth_token=${AUTH_TOKEN}; Path=/; Max-Age=${maxAge}; SameSite=Lax`);
    return res.json({ success: true });
  }
  return res.status(401).json({ error: '密码错误' });
});

app.post('/api/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'auth_token=; Path=/; Max-Age=0');
  return res.json({ success: true });
});

// ===== API Routes =====
// GET /api/entries - list all entries (newest first)
app.get('/api/entries', (req, res) => {
  const entries = loadEntries();
  entries.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(entries);
});

// POST /api/entries - create an entry
app.post('/api/entries', (req, res) => {
  const title = (req.body && req.body.title || '').trim();
  const content = (req.body && req.body.content || '').trim();

  if (!title) return res.status(400).json({ error: '标题不能为空' });
  if (!content) return res.status(400).json({ error: '内容不能为空' });

  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const fmt = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

  const entry = {
    id: Date.now() + Math.random(),
    title,
    content,
    createdAt: fmt,
    updatedAt: fmt,
  };

  const entries = loadEntries();
  entries.unshift(entry);
  saveEntries(entries);
  res.status(201).json(entry);
});

// DELETE /api/entries/:id - delete an entry (requires password)
app.delete('/api/entries/:id', (req, res) => {
  if (JOURNAL_PASSWORD) {
    const password = req.body && req.body.password;
    if (!password) return res.status(403).json({ error: '需要输入密码才能删除' });
    if (password !== JOURNAL_PASSWORD) return res.status(403).json({ error: '密码错误' });
  }

  const id = parseFloat(req.params.id);
  const entries = loadEntries();
  const idx = entries.findIndex(e => e.id === id);

  if (idx === -1) return res.status(404).json({ error: '日记不存在' });

  entries.splice(idx, 1);
  saveEntries(entries);
  res.json({ success: true });
});

// ===== Error Handler =====
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: '服务器内部错误' });
});

// ===== Sample Data =====
(function initSampleData() {
  const entries = loadEntries();
  if (entries.length > 0) return;

  const now = Date.now();
  const fmt = ts => {
    const d = new Date(ts);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  saveEntries([
    {
      id: now + Math.random(),
      title: '你好，日志本',
      content: '今天开始用这个日志本记录生活。希望能坚持每天写一点，记录生活中的小确幸和值得回忆的瞬间。',
      createdAt: fmt(now - 86400000),
      updatedAt: fmt(now - 86400000),
    },
    {
      id: now + Math.random() + 1,
      title: '周末的午后',
      content: '下午去了附近新开的那家咖啡馆，环境很棒，有阳光洒进来。点了一杯拿铁，读完了最近在看的书。窗外树影婆娑，店里放着轻音乐，时间好像慢了下来。',
      createdAt: fmt(now - 43200000),
      updatedAt: fmt(now - 43200000),
    },
  ]);
})();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Journal Server started on port ${PORT}`);
  console.log(`  Password protection: ${JOURNAL_PASSWORD ? 'ON' : 'OFF'}`);
});
