const MASTER_INDEX_ID = "ff808181a09d98f701a11ecd111827bb";
const CLOUD_API_BASE = "https://api.restful-api.dev/objects";

let currentCloudId = localStorage.getItem('active_cloud_id') || null;
let currentRequestId = localStorage.getItem('active_qr_request_id') || null;
let pollTimer = null;
let merchantSettings = {
  payeeName: 'Inspire Technologies',
  upiId: 'payment.express@upi'
};

document.addEventListener('DOMContentLoaded', () => {
  try { lucide.createIcons(); } catch(e){}

  const requestForm = document.getElementById('request-qr-form');
  if (requestForm) requestForm.addEventListener('submit', handleQrRequest);

  const utrForm = document.getElementById('utr-submit-form');
  if (utrForm) utrForm.addEventListener('submit', handleUtrSubmit);

  // Restore active session if client refreshed or closed tab
  if (currentCloudId) {
    showWaitingScreen();
    startPollingCloudStatus(currentCloudId);
  }
});

function handleQrRequest(e) {
  e.preventDefault();

  const clientPhone = document.getElementById('clientPhone').value.trim();
  const clientName = document.getElementById('clientName').value.trim();
  const amount = document.getElementById('amount').value.trim();
  const serviceNote = document.getElementById('serviceNote').value.trim();

  if (!clientPhone || !amount) {
    showToast('Mobile number & Amount required.', 'error');
    return;
  }

  const reqId = 'REQ-' + Math.floor(100000 + Math.random() * 900000);
  const requestPayload = {
    name: reqId,
    data: {
      id: reqId,
      clientName: clientName || 'Client',
      clientPhone,
      amount: parseFloat(amount),
      serviceNote: serviceNote || 'Payment Request',
      status: 'Pending Admin QR', // Strictly Pending Admin QR!
      assignedQrUrl: '', // NO QR attached yet!
      utr: '',
      screenshotUrl: '',
      date: new Date().toISOString()
    }
  };

  currentRequestId = reqId;
  localStorage.setItem('active_qr_request_id', currentRequestId);

  // 1. Instantly transition UI to Waiting Screen (100% Guaranteed smooth experience)
  showWaitingScreen();
  showToast('Request sent to Admin! Waiting for Admin to send QR...', 'success');

  // 2. Background non-blocking Cloud API Sync
  createCloudRequestBackground(requestPayload);
}

async function createCloudRequestBackground(requestPayload) {
  try {
    const res = await fetch(CLOUD_API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestPayload)
    });
    const createdObj = await res.json();

    if (createdObj && createdObj.id) {
      currentCloudId = createdObj.id;
      localStorage.setItem('active_cloud_id', currentCloudId);

      // Append to Master Index
      await appendToMasterIndex(currentCloudId);

      // Start Cloud Polling
      startPollingCloudStatus(currentCloudId);
    }
  } catch (err) {
    console.error('Background cloud sync:', err);
  }
}

async function appendToMasterIndex(cloudId) {
  try {
    const res = await fetch(`${CLOUD_API_BASE}/${MASTER_INDEX_ID}`);
    const masterObj = await res.json();
    let requestsList = (masterObj && masterObj.data && Array.isArray(masterObj.data.requests)) ? masterObj.data.requests : [];

    if (!requestsList.includes(cloudId)) {
      requestsList.unshift(cloudId);
    }

    await fetch(`${CLOUD_API_BASE}/${MASTER_INDEX_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'QR_DISPATCHER_MASTER_INDEX',
        data: { requests: requestsList }
      })
    });
  } catch (err) {}
}

function showWaitingScreen() {
  const reqCard = document.getElementById('step-request-card');
  const waitCard = document.getElementById('step-waiting-card');
  const qrCard = document.getElementById('step-qr-display-card');

  if (reqCard) reqCard.style.display = 'none';
  if (waitCard) waitCard.style.display = 'block';
  if (qrCard) qrCard.style.display = 'none';
  try { lucide.createIcons(); } catch(e){}
}

function startPollingCloudStatus(cloudId) {
  if (pollTimer) clearInterval(pollTimer);

  pollTimer = setInterval(async () => {
    if (!cloudId) return;
    try {
      const res = await fetch(`${CLOUD_API_BASE}/${cloudId}`);
      const obj = await res.json();

      if (obj && obj.data) {
        const reqData = obj.data;

        // ONLY transition to QR Screen IF Admin has attached a specific QR image!
        if (reqData.status === 'QR Sent' && reqData.assignedQrUrl && reqData.assignedQrUrl.length > 0) {
          clearInterval(pollTimer);
          showQrReceivedScreen(reqData);
        }
      }
    } catch (err) {}
  }, 2000);
}

function showQrReceivedScreen(reqData) {
  const waitCard = document.getElementById('step-waiting-card');
  const reqCard = document.getElementById('step-request-card');
  const qrCard = document.getElementById('step-qr-display-card');

  if (waitCard) waitCard.style.display = 'none';
  if (reqCard) reqCard.style.display = 'none';
  if (qrCard) qrCard.style.display = 'block';

  document.getElementById('qr-payee-title').innerText = merchantSettings.payeeName;
  document.getElementById('qr-display-amount').innerText = `₹ ${parseFloat(reqData.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  document.getElementById('upi-id-display').innerText = merchantSettings.upiId;

  // DISPLAY ONLY THE SPECIFIC QR IMAGE SENT BY ADMIN
  const assignedImg = document.getElementById('assigned-qr-img');
  if (assignedImg) {
    assignedImg.src = reqData.assignedQrUrl;
    assignedImg.style.display = 'inline-block';
  }

  const upiUri = `upi://pay?pa=${encodeURIComponent(merchantSettings.upiId)}&pn=${encodeURIComponent(merchantSettings.payeeName)}&am=${reqData.amount}&cu=INR&tn=${encodeURIComponent(reqData.serviceNote || 'Payment')}`;

  if (document.getElementById('gpay-btn')) document.getElementById('gpay-btn').href = upiUri;
  if (document.getElementById('phonepe-btn')) document.getElementById('phonepe-btn').href = upiUri;
  if (document.getElementById('paytm-btn')) document.getElementById('paytm-btn').href = upiUri;
  if (document.getElementById('bhim-btn')) document.getElementById('bhim-btn').href = upiUri;

  showToast('Payment QR Code received from Admin!', 'success');
  try { lucide.createIcons(); } catch(e){}
}

function clearSavedSession() {
  if (pollTimer) clearInterval(pollTimer);
  localStorage.removeItem('active_cloud_id');
  localStorage.removeItem('active_qr_request_id');
  currentCloudId = null;
  currentRequestId = null;

  if (document.getElementById('step-waiting-card')) document.getElementById('step-waiting-card').style.display = 'none';
  document.getElementById('step-qr-display-card').style.display = 'none';
  document.getElementById('step-request-card').style.display = 'block';

  if (window.history.replaceState) {
    window.history.replaceState(null, null, window.location.pathname);
  }
}

function openUtrModal() {
  document.getElementById('utrModal').classList.add('show');
}

function closeUtrModal() {
  document.getElementById('utrModal').classList.remove('show');
}

async function handleUtrSubmit(e) {
  e.preventDefault();

  if (!currentCloudId) return;

  const utr = document.getElementById('utrInput').value.trim();
  const fileInput = document.getElementById('utrScreenshotInput');

  if (!utr) {
    showToast('Please enter the 12-digit UTR number', 'error');
    return;
  }

  let screenshotUrl = '';
  if (fileInput && fileInput.files[0]) {
    screenshotUrl = await fileToDataUrl(fileInput.files[0]);
  }

  try {
    const res = await fetch(`${CLOUD_API_BASE}/${currentCloudId}`);
    const obj = await res.json();
    if (obj && obj.data) {
      const updatedData = { ...obj.data, utr, screenshotUrl, status: 'Payment Submitted' };
      await fetch(`${CLOUD_API_BASE}/${currentCloudId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: obj.name, data: updatedData })
      });
    }

    closeUtrModal();
    showToast('Payment UTR submitted! Admin will verify soon.', 'success');
  } catch (err) {
    showToast('Error submitting UTR', 'error');
  }
}

function fileToDataUrl(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.readAsDataURL(file);
  });
}

function copyUpiId() {
  if (merchantSettings.upiId) {
    navigator.clipboard.writeText(merchantSettings.upiId);
    showToast('UPI ID copied to clipboard!', 'success');
  }
}

function showToast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  if (type === 'error') toast.style.borderLeftColor = '#ef4444';
  if (type === 'success') toast.style.borderLeftColor = '#10b981';

  toast.innerHTML = `<span>${msg}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 4000);
}
