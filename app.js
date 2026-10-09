let currentRequest = null;
let qrcodeInstance = null;

// Settings (Persisted in localStorage)
let merchantSettings = JSON.parse(localStorage.getItem('qr_merchant_settings')) || {
  payeeName: 'Inspire Technologies',
  upiId: 'payment.express@upi',
  customQrUrl: ''
};

document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();
  renderMerchantHeader();

  const requestForm = document.getElementById('request-qr-form');
  if (requestForm) requestForm.addEventListener('submit', handleQrRequest);

  const utrForm = document.getElementById('utr-submit-form');
  if (utrForm) utrForm.addEventListener('submit', handleUtrSubmit);

  // Restore session from localStorage or URL query string ?req=REQ-XXXXXX
  const urlParams = new URLSearchParams(window.location.search);
  const paramReqId = urlParams.get('req');
  const savedReq = JSON.parse(localStorage.getItem('active_qr_request'));

  if (savedReq) {
    currentRequest = savedReq;
    showQrReceivedScreen(currentRequest);
  }
});

function renderMerchantHeader() {
  const headerEl = document.getElementById('merchant-name-header');
  if (headerEl) headerEl.innerText = merchantSettings.payeeName;
}

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

  currentRequest = {
    id: reqId,
    clientName: clientName || 'Client',
    clientPhone,
    amount: parseFloat(amount),
    serviceNote: serviceNote || 'Payment',
    date: new Date().toISOString()
  };

  // Save session in localStorage
  localStorage.setItem('active_qr_request', JSON.stringify(currentRequest));

  showToast('Payment QR Code generated!', 'success');
  showQrReceivedScreen(currentRequest);
}

function showQrReceivedScreen(req) {
  document.getElementById('step-request-card').style.display = 'none';
  if (document.getElementById('step-waiting-card')) document.getElementById('step-waiting-card').style.display = 'none';
  
  const displayCard = document.getElementById('step-qr-display-card');
  displayCard.style.display = 'block';

  document.getElementById('qr-payee-title').innerText = merchantSettings.payeeName;
  document.getElementById('qr-display-amount').innerText = `₹ ${parseFloat(req.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  document.getElementById('upi-id-display').innerText = merchantSettings.upiId;

  const upiUri = `upi://pay?pa=${encodeURIComponent(merchantSettings.upiId)}&pn=${encodeURIComponent(merchantSettings.payeeName)}&am=${req.amount}&cu=INR&tn=${encodeURIComponent(req.serviceNote || 'Payment')}`;

  const assignedImg = document.getElementById('assigned-qr-img');
  const qrBox = assignedImg.parentElement;

  if (merchantSettings.customQrUrl) {
    assignedImg.src = merchantSettings.customQrUrl;
    assignedImg.style.display = 'inline-block';
  } else {
    // Generate dynamic QR using QRCode canvas
    qrBox.innerHTML = '';
    const qrDiv = document.createElement('div');
    qrBox.appendChild(qrDiv);
    new QRCode(qrDiv, {
      text: upiUri,
      width: 220,
      height: 220,
      colorDark: "#0f172a",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.H
    });
  }

  // Update App Buttons
  if (document.getElementById('gpay-btn')) document.getElementById('gpay-btn').href = upiUri;
  if (document.getElementById('phonepe-btn')) document.getElementById('phonepe-btn').href = upiUri;
  if (document.getElementById('paytm-btn')) document.getElementById('paytm-btn').href = upiUri;
  if (document.getElementById('bhim-btn')) document.getElementById('bhim-btn').href = upiUri;
}

function clearSavedSession() {
  localStorage.removeItem('active_qr_request');
  currentRequest = null;

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

function handleUtrSubmit(e) {
  e.preventDefault();

  const utr = document.getElementById('utrInput').value.trim();
  if (!utr) {
    showToast('Please enter the 12-digit UTR number', 'error');
    return;
  }

  closeUtrModal();
  showToast('Payment UTR submitted successfully!', 'success');
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
