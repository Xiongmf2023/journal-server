const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3456;

// ---------- Data File ----------
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const DATA_DIR = path.join(__dirname, 'data');

// Ensure directories exist
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DATA_FILE = path.join(DATA_DIR, 'entries.json');

// ---------- Storage Read/Write ----------
function loadEntries() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch { return []; }
}

function saveEntries(entries) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(entries, null, 2), 'utf-8');
}

// Initialize 2 sample entries
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
      { id: now + Math.random(), title: 'Hello, Journal!', content: 'Started using this journal app today. Hope to record little moments of life every day.', photo: null, createdAt: fmt(now - 86400000), updatedAt: fmt(now - 86400000) },
      { id: now + Math.random() + 1, title: 'Weekend Afternoon', content: 'Went to the new cafe nearby. Great atmosphere, sunlight streaming in. Finished the book I have been reading lately.', photo: null, createdAt: fmt(now - 43200000), updatedAt: fmt(now - 43200000) }
    ];
    saveEntries(samples);
  }
}
ensureSampleData();

// ---------- Middleware ----------
app.use(express.json());
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(path.join(__dirname, 'public')));

// File upload config
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
    else cb(new Error('Images only'));
  }
});

// ---------- API Routes ----------

// GET /api/entries - Get all entries (sorted by time desc)
app.get('/api/entries', (req, res) => {
  const entries = loadEntries();
  entries.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(entries);
});

// POST /api/entries - Create entry
app.post('/api/entries', upload.single('photo'), (req, res) => {
  const { title, content } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'Title is required' });
  if (!content || !content.trim()) return res.status(400).json({ error: 'Content is required' });

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

// DELETE /api/entries/:id - Delete entry
app.delete('/api/entries/:id', (req, res) => {
  const id = parseFloat(req.params.id);
  let entries = loadEntries();
  const idx = entries.findIndex(e => e.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Entry not found' });

  // Delete associated photo file
  const entry = entries[idx];
  if (entry.photo) {
    const filePath = path.join(__dirname, entry.photo);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }

  entries.splice(idx, 1);
  saveEntries(entries);
  res.json({ success: true });
});

// Error handler
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Photo size must be under 8MB' });
    return res.status(400).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('Journal Server started');
  console.log('  http://localhost:' + PORT);
  const os = require('os');
  const ifaces = os.networkInterfaces();
  Object.keys(ifaces).forEach(ifname => {
    ifaces[ifname].forEach(iface => {
      if (iface.family === 'IPv4' && !iface.internal) {
        console.log('  http://' + iface.address + ':' + PORT + '  (LAN)');
      }
    });
  });
});