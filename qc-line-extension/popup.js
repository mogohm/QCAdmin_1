const apiUrlEl = document.getElementById('apiUrl');
const apiKeyEl = document.getElementById('apiKey');
const adminIdEl = document.getElementById('adminId');
const saveBtn = document.getElementById('saveBtn');
const loadBtn = document.getElementById('loadBtn');
const statusEl = document.getElementById('status');

// โหลดค่าที่บันทึกไว้
chrome.storage.sync.get({ apiUrl: '', apiKey: '', adminId: '' }, (s) => {
  apiUrlEl.value = s.apiUrl;
  apiKeyEl.value = s.apiKey;
  if (s.apiUrl) loadAdmins(s.apiUrl, s.apiKey, s.adminId);
});

loadBtn.addEventListener('click', () => {
  const url = apiUrlEl.value.trim().replace(/\/$/, '');
  const key = apiKeyEl.value.trim();
  if (!url) { showStatus('ใส่ URL ก่อน', false); return; }
  loadAdmins(url, key, '');
});

saveBtn.addEventListener('click', () => {
  const apiUrl = apiUrlEl.value.trim().replace(/\/$/, '');
  const apiKey = apiKeyEl.value.trim();
  const adminId = adminIdEl.value;
  if (!apiUrl) { showStatus('ใส่ URL ก่อน', false); return; }
  if (!adminId) { showStatus('เลือก Admin ก่อน', false); return; }
  chrome.storage.sync.set({ apiUrl, apiKey, adminId }, () => {
    showStatus('✅ บันทึกแล้ว — Extension พร้อมใช้', true);
  });
});

async function loadAdmins(url, key, selectedId) {
  loadBtn.textContent = '⏳ กำลังโหลด...';
  try {
    const res = await fetch(`${url}/api/admin/list`, {
      headers: key ? { 'x-api-key': key } : {},
    });
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) {
      showStatus('ไม่พบ Admin — Import ก่อนที่ Admin Console', false); return;
    }
    adminIdEl.innerHTML = '<option value="">— เลือก Admin ของคุณ —</option>' +
      data.map(a => `<option value="${a.id}"${a.id === selectedId ? ' selected' : ''}>${a.member_name}</option>`).join('');
    showStatus(`โหลดได้ ${data.length} Admin`, true);
  } catch (e) {
    showStatus('เชื่อมต่อ API ไม่ได้: ' + e.message, false);
  }
  loadBtn.textContent = '🔄 Load รายชื่อ Admin';
}

function showStatus(msg, ok) {
  statusEl.textContent = msg;
  statusEl.className = ok ? 'ok' : 'err';
}
