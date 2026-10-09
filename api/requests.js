const fs = require('fs');
const path = require('path');

const DB_PATH = '/tmp/qr_live_requests.json';

function getRequests() {
  try {
    if (!fs.existsSync(DB_PATH)) return [];
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch (e) {
    return [];
  }
}

function saveRequests(list) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(list, null, 2));
  } catch (e) {}
}

module.exports = (req, res) => {
  // CORS Headers for cross-domain requests
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const list = getRequests();

  if (req.method === 'POST') {
    const { clientPhone, clientName, amount, serviceNote } = req.body || {};
    if (!clientPhone || !amount) {
      return res.status(400).json({ success: false, message: 'Missing phone or amount' });
    }

    const reqId = 'REQ-' + Math.floor(100000 + Math.random() * 900000);
    const newReq = {
      id: reqId,
      clientName: clientName || 'Client',
      clientPhone,
      amount: parseFloat(amount),
      serviceNote: serviceNote || 'Payment Request',
      status: 'Pending Admin QR',
      assignedQrUrl: '',
      utr: '',
      date: new Date().toISOString()
    };

    list.unshift(newReq);
    saveRequests(list);
    return res.status(200).json({ success: true, request: newReq });
  }

  if (req.method === 'GET') {
    const { id } = req.query;
    if (id) {
      const item = list.find(r => r.id === id);
      return res.status(200).json({ success: true, request: item || null });
    }
    return res.status(200).json({ success: true, requests: list });
  }

  if (req.method === 'PATCH' || req.method === 'PUT') {
    const { id, assignedQrUrl, status, utr, screenshotUrl } = req.body || {};
    const item = list.find(r => r.id === id);
    if (!item) return res.status(404).json({ success: false, message: 'Not found' });

    if (assignedQrUrl) item.assignedQrUrl = assignedQrUrl;
    if (status) item.status = status;
    if (utr) item.utr = utr;
    if (screenshotUrl) item.screenshotUrl = screenshotUrl;

    saveRequests(list);
    return res.status(200).json({ success: true, request: item });
  }

  return res.status(200).json({ success: true, requests: list });
};
