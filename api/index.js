const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Memory storage for Vercel serverless environment to prevent EROFS filesystem errors
const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// In-Memory Database for Vercel Serverless Function lifecycle
const db = {
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

// 1. Get Public Settings
app.get('/api/settings', (req, res) => {
  const publicSettings = { ...db.settings };
  delete publicSettings.adminPin;
  res.json({ success: true, settings: publicSettings });
});

// 2. Admin Login
app.post('/api/admin/login', (req, res) => {
  const { pin } = req.body;
  if (pin === db.settings.adminPin) {
    res.json({ success: true, message: 'Login successful' });
  } else {
    res.status(401).json({ success: false, message: 'Invalid Admin PIN' });
  }
});

// 3. Client Creates QR Request
app.post('/api/request-qr', (req, res) => {
  const { clientPhone, clientName, amount, serviceNote } = req.body;

  if (!clientPhone || !amount) {
    return res.status(400).json({ success: false, message: 'Mobile number and Amount are required.' });
  }

  const requestId = 'REQ-' + Math.floor(100000 + Math.random() * 900000);

  const newRequest = {
    id: requestId,
    clientName: (clientName || 'Client').trim(),
    clientPhone: clientPhone.trim(),
    serviceNote: (serviceNote || 'Payment Request').trim(),
    amount: parseFloat(amount),
    status: 'Pending Admin QR',
    assignedQrUrl: db.settings.defaultQrImageUrl || '',
    utr: '',
    screenshotUrl: '',
    date: new Date().toISOString(),
    adminNote: ''
  };

  db.requests.unshift(newRequest);

  res.json({
    success: true,
    message: 'QR Request Sent to Admin.',
    request: newRequest
  });
});

// 4. Client Polls Request Status Live
app.get('/api/request-status/:id', (req, res) => {
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

// 5. Admin Gets All Requests
app.get('/api/admin/requests', (req, res) => {
  const pin = req.headers['x-admin-pin'];
  if (pin !== db.settings.adminPin) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  res.json({ success: true, requests: db.requests, settings: db.settings });
});

// 6. Admin Attaches Custom QR Image for a Specific Request
app.post('/api/admin/attach-qr/:id', upload.single('qrImage'), (req, res) => {
  const pin = req.body.pin || req.headers['x-admin-pin'];
  if (pin !== db.settings.adminPin) {
    return res.status(401).json({ success: false, message: 'Unauthorized PIN' });
  }

  const reqItem = db.requests.find(r => r.id === req.params.id);
  if (!reqItem) {
    return res.status(404).json({ success: false, message: 'Request not found' });
  }

  let qrUrl = '';
  if (req.file) {
    const mime = req.file.mimetype || 'image/png';
    qrUrl = `data:${mime};base64,${req.file.buffer.toString('base64')}`;
  } else if (req.body.existingQrUrl) {
    qrUrl = req.body.existingQrUrl;
  } else if (db.settings.defaultQrImageUrl) {
    qrUrl = db.settings.defaultQrImageUrl;
  }

  if (!qrUrl) {
    return res.status(400).json({ success: false, message: 'Please select a QR image.' });
  }

  reqItem.assignedQrUrl = qrUrl;
  reqItem.status = 'QR Sent';

  res.json({
    success: true,
    message: `Payment QR Code sent to ${reqItem.clientName}!`,
    request: reqItem
  });
});

// 7. Admin Set Default Master Payment QR Image
app.post('/api/admin/upload-default-qr', upload.single('qrImage'), (req, res) => {
  const { pin } = req.body;
  if (pin !== db.settings.adminPin) return res.status(401).json({ success: false, message: 'Unauthorized' });
  if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

  const mime = req.file.mimetype || 'image/png';
  const qrUrl = `data:${mime};base64,${req.file.buffer.toString('base64')}`;
  db.settings.defaultQrImageUrl = qrUrl;

  res.json({ success: true, message: 'Default QR Image saved!', qrImageUrl: qrUrl });
});

// 8. Admin Update Settings
app.post('/api/admin/settings', (req, res) => {
  const { pin, upiId, payeeName, bankDetails, newPin } = req.body;
  if (pin !== db.settings.adminPin) return res.status(401).json({ success: false, message: 'Unauthorized' });

  if (upiId) db.settings.upiId = upiId.trim();
  if (payeeName) db.settings.payeeName = payeeName.trim();
  if (bankDetails) db.settings.bankDetails = bankDetails;
  if (newPin && newPin.trim().length >= 4) db.settings.adminPin = newPin.trim();

  res.json({ success: true, message: 'Settings saved!', settings: db.settings });
});

// 9. Client Submits UTR Payment Proof
app.post('/api/submit-utr', upload.single('screenshot'), (req, res) => {
  const { requestId, utr } = req.body;
  if (!requestId || !utr) return res.status(400).json({ success: false, message: 'Missing fields' });

  const reqItem = db.requests.find(r => r.id === requestId);
  if (!reqItem) return res.status(404).json({ success: false, message: 'Request not found' });

  reqItem.utr = utr.trim();
  if (req.file) {
    const mime = req.file.mimetype || 'image/png';
    reqItem.screenshotUrl = `data:${mime};base64,${req.file.buffer.toString('base64')}`;
  }
  reqItem.status = 'Payment Submitted';

  res.json({ success: true, message: 'UTR submitted!', request: reqItem });
});

// 10. Admin Approve / Reject Payment
app.post('/api/admin/requests/:id/status', (req, res) => {
  const { pin, status, adminNote } = req.body;
  if (pin !== db.settings.adminPin) return res.status(401).json({ success: false, message: 'Unauthorized' });

  const reqItem = db.requests.find(r => r.id === req.params.id);
  if (!reqItem) return res.status(404).json({ success: false, message: 'Not found' });

  reqItem.status = status;
  if (adminNote !== undefined) reqItem.adminNote = adminNote;

  res.json({ success: true, message: `Status updated to ${status}`, request: reqItem });
});

// 11. Admin Delete Request
app.delete('/api/admin/requests/:id', (req, res) => {
  const pin = req.headers['x-admin-pin'];
  if (pin !== db.settings.adminPin) return res.status(401).json({ success: false, message: 'Unauthorized' });

  db.requests = db.requests.filter(r => r.id !== req.params.id);
  res.json({ success: true, message: 'Deleted' });
});

module.exports = app;
