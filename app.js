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
  lucide.createIcons();

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

async function handleQrRequest(e) {
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

  const submitBtn = e.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Sending Request...';
  lucide.createIcons();

  try {
    // 1. Create Cloud Object on Central Cloud Database
    const res = await fetch(CLOUD_API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestPayload)
    });
    const createdObj = await res.json();

    if (createdObj && createdObj.id) {
      currentCloudId = createdObj.id;
      currentRequestId = reqId;
      localStorage.setItem('active_cloud_id', currentCloudId);
      localStorage.setItem('active_qr_request_id', currentRequestId);

      // 2. Append to Master Index so Admin Panel sees it live
      await appendToMasterIndex(currentCloudId);

      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i data-lucide="send"></i> Request QR Code From Admin';
      lucide.createIcons();

      // Show Waiting Screen ONLY
      showWaitingScreen();
      startPollingCloudStatus(currentCloudId);
      showToast('Request sent to Admin! Waiting for Admin to send QR...', 'info');
    } else {
      throw new Error('Failed to create cloud request');
    }
  } catch (err) {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i data-lucide="send"></i> Request QR Code From Admin';
    lucide.createIcons();
    showToast('Network error sending request. Please try again.', 'error');
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
  } catch (err) {
    console.error('Master Index update error:', err);
  }
}

function showWaitingScreen() {
  document.getElementById('step-request-card').style.display = 'none';
  if (document.getElementById('step-waiting-card')) document.getElementById('step-waiting-card').style.display = 'block';
  document.getElementById('step-qr-display-card').style.display = 'none';
}

function startPollingCloudStatus(cloudId) {
  if (pollTimer) clearInterval(pollTimer);

  pollTimer = setInterval(async () => {
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
    } catch (err) {
      console.error('Polling cloud error:', err);
    }
  }, 2000);
}

function showQrReceivedScreen(reqData) {
  if (document.getElementById('step-waiting-card')) document.getElementById('step-waiting-card').style.display = 'none';
  document.getElementById('step-request-card').style.display = 'none';
  
  const displayCard = document.getElementById('step-qr-display-card');
  displayCard.style.display = 'block';

  document.getElementById('qr-payee-title').innerText = merchantSettings.payeeName;
  document.getElementById('qr-display-amount').innerText = `₹ ${parseFloat(reqData.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  document.getElementById('upi-id-display').innerText = merchantSettings.upiId;

  // DISPLAY ONLY THE SPECIFIC QR IMAGE SENT BY ADMIN
  const assignedImg = document.getElementById('assigned-qr-img');
  assignedImg.src = reqData.assignedQrUrl;
  assignedImg.style.display = 'inline-block';

  const upiUri = `upi://pay?pa=${encodeURIComponent(merchantSettings.upiId)}&pn=${encodeURIComponent(merchantSettings.payeeName)}&am=${reqData.amount}&cu=INR&tn=${encodeURIComponent(reqData.serviceNote || 'Payment')}`;

  if (document.getElementById('gpay-btn')) document.getElementById('gpay-btn').href = upiUri;
  if (document.getElementById('phonepe-btn')) document.getElementById('phonepe-btn').href = upiUri;
  if (document.getElementById('paytm-btn')) document.getElementById('paytm-btn').href = upiUri;
  if (document.getElementById('bhim-btn')) document.getElementById('bhim-btn').href = upiUri;
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
