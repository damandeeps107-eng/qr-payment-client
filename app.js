// Cloud Database REST Endpoint for Real-time Interconnection between Client & Admin
const CLOUD_DB_BASE = "https://qr-payment-live-default-rtdb.asia-southeast1.firebasedatabase.app";

let currentRequestId = null;
let pollTimer = null;
let merchantSettings = {
  payeeName: 'Inspire Technologies',
  upiId: 'payment.express@upi'
};

document.addEventListener('DOMContentLoaded', async () => {
  lucide.createIcons();
  await fetchMerchantSettings();

  const requestForm = document.getElementById('request-qr-form');
  if (requestForm) requestForm.addEventListener('submit', handleQrRequest);

  const utrForm = document.getElementById('utr-submit-form');
  if (utrForm) utrForm.addEventListener('submit', handleUtrSubmit);

  // Restore session if client refreshed or closed tab
  const savedReqId = localStorage.getItem('active_qr_request_id');
  if (savedReqId) {
    currentRequestId = savedReqId;
    checkAndPollRequestStatus(currentRequestId);
  }
});

async function fetchMerchantSettings() {
  try {
    const res = await fetch(`${CLOUD_DB_BASE}/settings.json`);
    const data = await res.json();
    if (data) {
      merchantSettings = { ...merchantSettings, ...data };
      const headerEl = document.getElementById('merchant-name-header');
      if (headerEl) headerEl.innerText = merchantSettings.payeeName;
    }
  } catch (err) {
    console.error('Settings fetch error:', err);
  }
}

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

  const requestData = {
    id: reqId,
    clientName: clientName || 'Client',
    clientPhone,
    amount: parseFloat(amount),
    serviceNote: serviceNote || 'Payment Request',
    status: 'Pending Admin QR',
    assignedQrUrl: '',
    utr: '',
    screenshotUrl: '',
    date: new Date().toISOString()
  };

  try {
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Requesting QR...';
    lucide.createIcons();

    // Post to Cloud Realtime DB so Admin Panel gets it instantly!
    const res = await fetch(`${CLOUD_DB_BASE}/requests/${reqId}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestData)
    });

    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i data-lucide="send"></i> Request QR Code From Admin';
    lucide.createIcons();

    if (res.ok) {
      currentRequestId = reqId;
      localStorage.setItem('active_qr_request_id', currentRequestId);
      showWaitingScreen();
      checkAndPollRequestStatus(currentRequestId);
      showToast('Request sent to Admin! Waiting for QR...', 'success');
    } else {
      showToast('Error connecting to server database.', 'error');
    }
  } catch (err) {
    showToast('Network error while requesting QR code.', 'error');
  }
}

function showWaitingScreen() {
  document.getElementById('step-request-card').style.display = 'none';
  if (document.getElementById('step-waiting-card')) document.getElementById('step-waiting-card').style.display = 'block';
  document.getElementById('step-qr-display-card').style.display = 'none';
}

function checkAndPollRequestStatus(reqId) {
  if (pollTimer) clearInterval(pollTimer);

  // Poll Cloud Realtime DB every 2 seconds
  pollTimer = setInterval(async () => {
    try {
      const res = await fetch(`${CLOUD_DB_BASE}/requests/${reqId}.json`);
      const reqItem = await res.json();

      if (reqItem) {
        if (reqItem.status === 'QR Sent' && reqItem.assignedQrUrl) {
          clearInterval(pollTimer);
          showQrReceivedScreen(reqItem);
        }
      }
    } catch (err) {
      console.error('Polling error:', err);
    }
  }, 2000);
}

function showQrReceivedScreen(reqItem) {
  if (document.getElementById('step-waiting-card')) document.getElementById('step-waiting-card').style.display = 'none';
  document.getElementById('step-request-card').style.display = 'none';
  
  const displayCard = document.getElementById('step-qr-display-card');
  displayCard.style.display = 'block';

  document.getElementById('qr-payee-title').innerText = merchantSettings.payeeName;
  document.getElementById('qr-display-amount').innerText = `₹ ${parseFloat(reqItem.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  document.getElementById('upi-id-display').innerText = merchantSettings.upiId;

  const assignedImg = document.getElementById('assigned-qr-img');
  assignedImg.src = reqItem.assignedQrUrl;
  assignedImg.style.display = 'inline-block';

  const upiUri = `upi://pay?pa=${encodeURIComponent(merchantSettings.upiId)}&pn=${encodeURIComponent(merchantSettings.payeeName)}&am=${reqItem.amount}&cu=INR&tn=${encodeURIComponent(reqItem.serviceNote || 'Payment')}`;

  if (document.getElementById('gpay-btn')) document.getElementById('gpay-btn').href = upiUri;
  if (document.getElementById('phonepe-btn')) document.getElementById('phonepe-btn').href = upiUri;
  if (document.getElementById('paytm-btn')) document.getElementById('paytm-btn').href = upiUri;
  if (document.getElementById('bhim-btn')) document.getElementById('bhim-btn').href = upiUri;
}

function clearSavedSession() {
  if (pollTimer) clearInterval(pollTimer);
  localStorage.removeItem('active_qr_request_id');
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

  if (!currentRequestId) return;

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
    const res = await fetch(`${CLOUD_DB_BASE}/requests/${currentRequestId}.json`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ utr, screenshotUrl, status: 'Payment Submitted' })
    });

    if (res.ok) {
      closeUtrModal();
      showToast('Payment UTR submitted! Admin will verify soon.', 'success');
    } else {
      showToast('Failed to submit UTR', 'error');
    }
  } catch (err) {
    showToast('Network error', 'error');
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
