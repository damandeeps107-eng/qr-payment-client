const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const UPLOADS_DIR = process.env.VERCEL ? '/tmp' : path.join(__dirname, '..', 'uploads');
const DATA_DIR = process.env.VERCEL ? '/tmp' : path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

try {
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
} catch (e) {}

app.use('/uploads', express.static(UPLOADS_DIR));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname) || '.png';
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

const defaultDB = {
  settings: {
    upiId: 'payment.express@upi',
    payeeName: 'Inspire Technologies',
    adminPin: '1234',
    defaultQrImageUrl: '',
    bankDetails: {
      accountName: 'Inspire Technologies Pvt Ltd',
      accountNumber: '987654321012',
      ifscCode: 'HDFC0001234',
      bankName: 'HDFC Bank'
    }
  },
  requests: []
};

let memoryDB = null;

function readDB() {
  try {
    if (memoryDB) return memoryDB;
    if (!fs.existsSync(DB_FILE)) {
      memoryDB = { ...defaultDB };
      try { fs.writeFileSync(DB_FILE, JSON.stringify(defaultDB, null, 2)); } catch(e){}
      return memoryDB;
    }
    const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    if (!Array.isArray(db.requests)) db.requests = [];
    if (!db.settings) db.settings = defaultDB.settings;
    memoryDB = db;
    return db;
  } catch (err) {
    return memoryDB || defaultDB;
  }
}

function writeDB(data) {
  memoryDB = data;
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
  } catch (err) {}
}

// Routes
app.get('/api/settings', (req, res) => {
  const db = readDB();
  const publicSettings = { ...db.settings };
  delete publicSettings.adminPin;
  res.json({ success: true, settings: publicSettings });
});

app.post('/api/admin/login', (req, res) => {
  const { pin } = req.body;
  const db = readDB();
  if (pin === db.settings.adminPin) {
    res.json({ success: true, message: 'Login successful' });
  } else {
    res.status(401).json({ success: false, message: 'Invalid Admin PIN' });
  }
});

app.post('/api/request-qr', (req, res) => {
  const { clientPhone, clientName, amount, serviceNote } = req.body;
  if (!clientPhone || !amount) {
    return res.status(400).json({ success: false, message: 'Mobile number and Amount are required.' });
  }

  const db = readDB();
  const requestId = 'REQ-' + Math.floor(100000 + Math.random() * 900000);

  const newRequest = {
    id: requestId,
    clientName: (clientName || 'Client').trim(),
    clientPhone: clientPhone.trim(),
    serviceNote: (serviceNote || 'Payment Request').trim(),
    amount: parseFloat(amount),
    status: 'Pending Admin QR',
    assignedQrUrl: '',
    utr: '',
    screenshotUrl: '',
    date: new Date().toISOString(),
    adminNote: ''
  };

  db.requests.unshift(newRequest);
  writeDB(db);

  res.json({
    success: true,
    message: 'QR Request Sent to Admin.',
    request: newRequest
  });
});

app.get('/api/request-status/:id', (req, res) => {
  const db = readDB();
  const reqItem = db.requests.find(r => r.id === req.params.id);
  if (!reqItem) {
    return res.status(404).json({ success: false, message: 'Request not found.' });
  }
  res.json({
    success: true,
    request: reqItem,
    settings: {
      upiId: db.settings.upiId,
      payeeName: db.settings.payeeName,
      bankDetails: db.settings.bankDetails
    }
  });
});

app.get('/api/admin/requests', (req, res) => {
  const pin = req.headers['x-admin-pin'];
  const db = readDB();
  if (pin !== db.settings.adminPin) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  res.json({ success: true, requests: db.requests, settings: db.settings });
});

app.post('/api/admin/attach-qr/:id', upload.single('qrImage'), (req, res) => {
  const pin = req.body.pin || req.headers['x-admin-pin'];
  const db = readDB();
  if (pin !== db.settings.adminPin) {
    return res.status(401).json({ success: false, message: 'Unauthorized PIN' });
  }

  const reqItem = db.requests.find(r => r.id === req.params.id);
  if (!reqItem) return res.status(404).json({ success: false, message: 'Request not found' });

  let qrUrl = '';
  if (req.file) {
    qrUrl = `/uploads/${req.file.filename}`;
  } else if (req.body.existingQrUrl) {
    qrUrl = req.body.existingQrUrl;
  } else if (db.settings.defaultQrImageUrl) {
    qrUrl = db.settings.defaultQrImageUrl;
  }

  if (!qrUrl) return res.status(400).json({ success: false, message: 'Please select a QR image.' });

  reqItem.assignedQrUrl = qrUrl;
  reqItem.status = 'QR Sent';
  writeDB(db);

  res.json({ success: true, message: `Payment QR Code sent to ${reqItem.clientName}!`, request: reqItem });
});

app.post('/api/admin/upload-default-qr', upload.single('qrImage'), (req, res) => {
  const { pin } = req.body;
  const db = readDB();
  if (pin !== db.settings.adminPin) return res.status(401).json({ success: false, message: 'Unauthorized' });
  if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

  const qrUrl = `/uploads/${req.file.filename}`;
  db.settings.defaultQrImageUrl = qrUrl;
  writeDB(db);

  res.json({ success: true, message: 'Default QR Image saved!', qrImageUrl: qrUrl });
});

app.post('/api/admin/settings', (req, res) => {
  const { pin, upiId, payeeName, bankDetails, newPin } = req.body;
  const db = readDB();
  if (pin !== db.settings.adminPin) return res.status(401).json({ success: false, message: 'Unauthorized' });

  if (upiId) db.settings.upiId = upiId.trim();
  if (payeeName) db.settings.payeeName = payeeName.trim();
  if (bankDetails) db.settings.bankDetails = bankDetails;
  if (newPin && newPin.trim().length >= 4) db.settings.adminPin = newPin.trim();

  writeDB(db);
  res.json({ success: true, message: 'Settings saved!', settings: db.settings });
});

app.post('/api/submit-utr', upload.single('screenshot'), (req, res) => {
  const { requestId, utr } = req.body;
  if (!requestId || !utr) return res.status(400).json({ success: false, message: 'Missing fields' });

  const db = readDB();
  const reqItem = db.requests.find(r => r.id === requestId);
  if (!reqItem) return res.status(404).json({ success: false, message: 'Request not found' });

  reqItem.utr = utr.trim();
  if (req.file) reqItem.screenshotUrl = `/uploads/${req.file.filename}`;
  reqItem.status = 'Payment Submitted';
  writeDB(db);

  res.json({ success: true, message: 'UTR submitted!', request: reqItem });
});

app.post('/api/admin/requests/:id/status', (req, res) => {
  const { pin, status, adminNote } = req.body;
  const db = readDB();
  if (pin !== db.settings.adminPin) return res.status(401).json({ success: false, message: 'Unauthorized' });

  const reqItem = db.requests.find(r => r.id === req.params.id);
  if (!reqItem) return res.status(404).json({ success: false, message: 'Not found' });

  reqItem.status = status;
  if (adminNote !== undefined) reqItem.adminNote = adminNote;
  writeDB(db);

  res.json({ success: true, message: `Status updated to ${status}`, request: reqItem });
});

app.delete('/api/admin/requests/:id', (req, res) => {
  const pin = req.headers['x-admin-pin'];
  const db = readDB();
  if (pin !== db.settings.adminPin) return res.status(401).json({ success: false, message: 'Unauthorized' });

  db.requests = db.requests.filter(r => r.id !== req.params.id);
  writeDB(db);
  res.json({ success: true, message: 'Deleted' });
});

module.exports = app;
