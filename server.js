const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3456;

// ---------- 数据文件 ----------
const DATA_FILE = path.join(DATA_DIR, 'entries.json');
const UPLOAD_DIR = path.join(__dirname, 'uploads');

// 确保目录存在
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ---------- 存储读写 ----------
function loadEntries() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch { return []; }
}

function saveEntries(entries) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(entries, null, 2), 'utf-8');
}

// 初始化 2 条示例日记
function ensureSampleData() {
  const entries = loadEntries();
  if (entries.length === 0) {
    const now = Date.now();
    const fmt = (ts) => {
      const d = new Date(ts);
      const pad = n => String(n).padStart(2, '0');
      return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    };
    const samples = [
      { id: now + Math.random(), title: '你好，日记本', content: '今天开始用这个日记本记录生活。希望自己能坚持每天写一点，记录下生活中的小确幸和值得回忆的瞬间。', photo: null, createdAt: fmt(now - 86400000), updatedAt: fmt(now - 86400000) },
      { id: now + Math.random() + 1, title: '周末的午后', content: '下午去了附近新开的那家咖啡馆，环境很棒，有阳光洒进来。点了一杯拿铁，读完了最近在看的书。窗外树影婆娑，店里放着轻爵士，时间好像慢了下来。', photo: null, createdAt: fmt(now - 43200000), updatedAt: fmt(now - 43200000) }
    ];
    saveEntries(samples);
  }
}
ensureSampleData();

// ---------- 中间件 ----------
app.use(express.json());
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(path.join(__dirname, 'public')));

// 文件上传配置
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, Date.now() + '-' + Math.random().toString(36).slice(2, 8) + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('仅支持图片文件'));
  }
});

// ---------- API 路由 ----------

// GET /api/entries - 获取所有日记（按时间倒序）
app.get('/api/entries', (req, res) => {
  const entries = loadEntries();
  entries.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(entries);
});

// POST /api/entries - 创建日记
app.post('/api/entries', upload.single('photo'), (req, res) => {
  const { title, content } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: '标题不能为空' });
  if (!content || !content.trim()) return res.status(400).json({ error: '内容不能为空' });

  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const fmt = now.getFullYear() + '-' + pad(now.getMonth()+1) + '-' + pad(now.getDate()) + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes());

  const entry = {
    id: Date.now() + Math.random(),
    title: title.trim(),
    content: content.trim(),
    photo: req.file ? '/uploads/' + req.file.filename : null,
    createdAt: fmt,
    updatedAt: fmt
  };

  const entries = loadEntries();
  entries.unshift(entry);
  saveEntries(entries);

  res.status(201).json(entry);
});

// DELETE /api/entries/:id - 删除日记
app.delete('/api/entries/:id', (req, res) => {
  const id = parseFloat(req.params.id);
  let entries = loadEntries();
  const idx = entries.findIndex(e => e.id === id);
  if (idx === -1) return res.status(404).json({ error: '日记不存在' });

  // 删除关联照片文件
  const entry = entries[idx];
  if (entry.photo) {
    const filePath = path.join(__dirname, entry.photo);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }

  entries.splice(idx, 1);
  saveEntries(entries);
  res.json({ success: true });
});

// 错误处理
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: '照片大小不能超过 8MB' });
    return res.status(400).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: '服务器内部错误' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('🌿 个人日志本服务器已启动');
  console.log('   http://localhost:' + PORT);
  // 获取本机局域网 IP
  const os = require('os');
  const ifaces = os.networkInterfaces();
  Object.keys(ifaces).forEach(ifname => {
    ifaces[ifname].forEach(iface => {
      if (iface.family === 'IPv4' && !iface.internal) {
        console.log('   http://' + iface.address + ':' + PORT + '  (局域网)');
      }
    });
  });
});