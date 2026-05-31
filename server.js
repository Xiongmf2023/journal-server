const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3456;

// ---------- 鏁版嵁鏂囦欢 ----------
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const DATA_DIR = path.join(__dirname, 'data');

// 纭繚鐩綍瀛樺湪
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DATA_FILE = path.join(DATA_DIR, 'entries.json');

// ---------- 瀛樺偍璇诲啓 ----------
function loadEntries() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch { return []; }
}

function saveEntries(entries) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(entries, null, 2), 'utf-8');
}

// 鍒濆鍖?2 鏉＄ず渚嬫棩璁?function ensureSampleData() {
  const entries = loadEntries();
  if (entries.length === 0) {
    const now = Date.now();
    const fmt = (ts) => {
      const d = new Date(ts);
      const pad = n => String(n).padStart(2, '0');
      return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    };
    const samples = [
      { id: now + Math.random(), title: '浣犲ソ锛屾棩璁版湰', content: '浠婂ぉ寮€濮嬬敤杩欎釜鏃ヨ鏈褰曠敓娲汇€傚笇鏈涜嚜宸辫兘鍧氭寔姣忓ぉ鍐欎竴鐐癸紝璁板綍涓嬬敓娲讳腑鐨勫皬纭垢鍜屽€煎緱鍥炲繂鐨勭灛闂淬€?, photo: null, createdAt: fmt(now - 86400000), updatedAt: fmt(now - 86400000) },
      { id: now + Math.random() + 1, title: '鍛ㄦ湯鐨勫崍鍚?, content: '涓嬪崍鍘讳簡闄勮繎鏂板紑鐨勯偅瀹跺挅鍟￠锛岀幆澧冨緢妫掞紝鏈夐槼鍏夋磼杩涙潵銆傜偣浜嗕竴鏉嬁閾侊紝璇诲畬浜嗘渶杩戝湪鐪嬬殑涔︺€傜獥澶栨爲褰卞﹩濞戯紝搴楅噷鏀剧潃杞荤埖澹紝鏃堕棿濂藉儚鎱簡涓嬫潵銆?, photo: null, createdAt: fmt(now - 43200000), updatedAt: fmt(now - 43200000) }
    ];
    saveEntries(samples);
  }
}
ensureSampleData();

// ---------- 涓棿浠?----------
app.use(express.json());
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(path.join(__dirname, 'public')));

// 鏂囦欢涓婁紶閰嶇疆
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
    else cb(new Error('浠呮敮鎸佸浘鐗囨枃浠?));
  }
});

// ---------- API 璺敱 ----------

// GET /api/entries - 鑾峰彇鎵€鏈夋棩璁帮紙鎸夋椂闂村€掑簭锛?app.get('/api/entries', (req, res) => {
  const entries = loadEntries();
  entries.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(entries);
});

// POST /api/entries - 鍒涘缓鏃ヨ
app.post('/api/entries', upload.single('photo'), (req, res) => {
  const { title, content } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: '鏍囬涓嶈兘涓虹┖' });
  if (!content || !content.trim()) return res.status(400).json({ error: '鍐呭涓嶈兘涓虹┖' });

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

// DELETE /api/entries/:id - 鍒犻櫎鏃ヨ
app.delete('/api/entries/:id', (req, res) => {
  const id = parseFloat(req.params.id);
  let entries = loadEntries();
  const idx = entries.findIndex(e => e.id === id);
  if (idx === -1) return res.status(404).json({ error: '鏃ヨ涓嶅瓨鍦? });

  // 鍒犻櫎鍏宠仈鐓х墖鏂囦欢
  const entry = entries[idx];
  if (entry.photo) {
    const filePath = path.join(__dirname, entry.photo);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }

  entries.splice(idx, 1);
  saveEntries(entries);
  res.json({ success: true });
});

// 閿欒澶勭悊
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: '鐓х墖澶у皬涓嶈兘瓒呰繃 8MB' });
    return res.status(400).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: '鏈嶅姟鍣ㄥ唴閮ㄩ敊璇? });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('馃尶 涓汉鏃ュ織鏈湇鍔″櫒宸插惎鍔?);
  console.log('   http://localhost:' + PORT);
  // 鑾峰彇鏈満灞€鍩熺綉 IP
  const os = require('os');
  const ifaces = os.networkInterfaces();
  Object.keys(ifaces).forEach(ifname => {
    ifaces[ifname].forEach(iface => {
      if (iface.family === 'IPv4' && !iface.internal) {
        console.log('   http://' + iface.address + ':' + PORT + '  (灞€鍩熺綉)');
      }
    });
  });
});
// test