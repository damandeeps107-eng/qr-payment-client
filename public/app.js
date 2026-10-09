let currentRequestId = null;
let currentSettings = null;
let pollTimer = null;

document.addEventListener('DOMContentLoaded', async () => {
  lucide.createIcons();
  await loadSettings();

  const requestForm = document.getElementById('request-qr-form');
  requestForm.addEventListener('submit', handleQrRequest);

  const utrForm = document.getElementById('utr-submit-form');
  utrForm.addEventListener('submit', handleUtrSubmit);
});

async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();
    if (data.success) {
      currentSettings = data.settings;
      document.getElementById('merchant-name-header').innerText = currentSettings.payeeName;
    }
  } catch (err) {
    showToast('Failed to load settings', 'error');
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

  try {
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i data-lucide="loader" class="spin"></i> Sending Request...';
    lucide.createIcons();

    const res = await fetch('/api/request-qr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientPhone, clientName, amount, serviceNote })
    });

    const data = await res.json();
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i data-lucide="send"></i> Request QR Code From Admin';
    lucide.createIcons();

    if (data.success) {
      currentRequestId = data.request.id;
      showWaitingScreen();
      startPollingRequestStatus();
    } else {
      showToast(data.message || 'Error submitting request', 'error');
    }
  } catch (err) {
    showToast('Server error while requesting QR code.', 'error');
  }
}

function showWaitingScreen() {
  document.getElementById('step-request-card').style.display = 'none';
  document.getElementById('step-waiting-card').style.display = 'block';
  document.getElementById('step-qr-display-card').style.display = 'none';
}

function startPollingRequestStatus() {
  if (pollTimer) clearInterval(pollTimer);

  pollTimer = setInterval(async () => {
    if (!currentRequestId) return;

    try {
      const res = await fetch(`/api/request-status/${currentRequestId}`);
      const data = await res.json();

      if (data.success && data.request) {
        const reqItem = data.request;

        if (reqItem.status === 'QR Sent' && reqItem.assignedQrUrl) {
          clearInterval(pollTimer);
          showQrReceivedScreen(reqItem, data.settings);
        }
      }
    } catch (err) {
      console.error('Polling error:', err);
    }
  }, 2000);
}

function showQrReceivedScreen(reqItem, settings) {
  document.getElementById('step-waiting-card').style.display = 'none';
  document.getElementById('step-qr-display-card').style.display = 'block';

  document.getElementById('qr-payee-title').innerText = settings.payeeName || 'Inspire Technologies';
  document.getElementById('qr-display-amount').innerText = `₹ ${parseFloat(reqItem.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  document.getElementById('upi-id-display').innerText = settings.upiId || 'payment@upi';

  const assignedImg = document.getElementById('assigned-qr-img');
  assignedImg.src = reqItem.assignedQrUrl;

  showToast('Payment QR Code received from Admin!', 'success');
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
  const file = document.getElementById('utrScreenshotInput').files[0];

  if (!utr) {
    showToast('Please enter the 12-digit UTR number', 'error');
    return;
  }

  const formData = new FormData();
  formData.append('requestId', currentRequestId);
  formData.append('utr', utr);
  if (file) formData.append('screenshot', file);

  try {
    const res = await fetch('/api/submit-utr', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();

    if (data.success) {
      closeUtrModal();
      showToast('Payment proof submitted successfully! Admin will verify soon.', 'success');
    } else {
      showToast(data.message || 'Error submitting UTR', 'error');
    }
  } catch (err) {
    showToast('Server error', 'error');
  }
}

function copyUpiId() {
  if (currentSettings && currentSettings.upiId) {
    navigator.clipboard.writeText(currentSettings.upiId);
    showToast('UPI ID copied to clipboard!', 'success');
  }
}

function showToast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
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
