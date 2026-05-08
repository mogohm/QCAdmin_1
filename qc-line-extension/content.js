// Intercept fetch ทุกตัวที่หน้า chat.line.biz ยิงออกไป
// เพื่อจับข้อความที่แอดมินส่ง แล้วบันทึก QC โดยอัตโนมัติ

(function () {
  const originalFetch = window.fetch;

  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);

    try {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
      const options = args[1] || {};
      const method = (options.method || 'GET').toUpperCase();

      // LINE OA ส่งข้อความผ่าน POST ไปที่ path ที่มีคำว่า message/send หรือ chat
      const isSendMessage =
        method === 'POST' &&
        (url.includes('/message/send') ||
          url.includes('/chat/send') ||
          url.includes('/v2/bot/message') ||
          url.includes('/sendMessage') ||
          url.includes('sendmessage'));

      if (isSendMessage && options.body) {
        let body = {};
        try {
          body = JSON.parse(
            typeof options.body === 'string'
              ? options.body
              : await new Response(options.body).text()
          );
        } catch (_) {}

        // ดึงข้อความจาก body (รองรับหลาย format)
        const msgText =
          body?.text ||
          body?.message?.text ||
          body?.messages?.[0]?.text ||
          body?.content ||
          null;

        // ดึง LINE user ID จาก: body หรือ URL ปัจจุบัน
        const lineUserId =
          body?.to ||
          body?.userId ||
          body?.recipientId ||
          getLineUserIdFromUrl();

        if (msgText && lineUserId) {
          logToQC(lineUserId, msgText);
        }
      }
    } catch (_) {}

    return response;
  };

  // ดัก XMLHttpRequest ด้วย (กรณี LINE ใช้ XHR แทน fetch)
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url) {
    this._qcMethod = method;
    this._qcUrl = url;
    return originalOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function (body) {
    try {
      const method = (this._qcMethod || '').toUpperCase();
      const url = this._qcUrl || '';
      const isSend =
        method === 'POST' &&
        (url.includes('/message/send') ||
          url.includes('/chat/send') ||
          url.includes('sendMessage'));

      if (isSend && body) {
        let parsed = {};
        try { parsed = JSON.parse(body); } catch (_) {}
        const msgText = parsed?.text || parsed?.message?.text || parsed?.messages?.[0]?.text;
        const lineUserId = parsed?.to || parsed?.userId || getLineUserIdFromUrl();
        if (msgText && lineUserId) logToQC(lineUserId, msgText);
      }
    } catch (_) {}
    return originalSend.apply(this, arguments);
  };

  // ดึง LINE User ID จาก URL เช่น https://chat.line.biz/U280c03c...
  function getLineUserIdFromUrl() {
    const m = window.location.pathname.match(/\/(U[a-f0-9]+)/i);
    return m ? m[1] : null;
  }

  // ส่งข้อมูลไป QC API
  async function logToQC(lineUserId, messageText) {
    const settings = await getSettings();
    if (!settings.apiUrl || !settings.adminId) {
      showBadge('⚙️ ตั้งค่า Extension ก่อน', 'warn');
      return;
    }

    try {
      const res = await originalFetch(`${settings.apiUrl}/api/admin/log-reply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': settings.apiKey || '',
        },
        body: JSON.stringify({
          line_user_id: lineUserId,
          admin_id: settings.adminId,
          text: messageText,
        }),
      });

      const data = await res.json();
      if (data.ok) {
        showBadge(`✅ QC บันทึกแล้ว (score: ${data.qc?.finalScore ?? '—'})`, 'ok');
      } else {
        showBadge(`⚠️ ${data.error || 'บันทึกไม่สำเร็จ'}`, 'warn');
      }
    } catch (e) {
      showBadge('❌ เชื่อมต่อ QC API ไม่ได้', 'error');
    }
  }

  function getSettings() {
    return new Promise(resolve => {
      chrome.storage.sync.get(
        { apiUrl: '', apiKey: '', adminId: '' },
        resolve
      );
    });
  }

  // แสดง toast notification มุมขวาล่าง
  let toastEl = null;
  function showBadge(msg, type = 'ok') {
    if (toastEl) toastEl.remove();

    toastEl = document.createElement('div');
    toastEl.textContent = msg;
    Object.assign(toastEl.style, {
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      zIndex: '999999',
      padding: '10px 16px',
      borderRadius: '8px',
      fontSize: '13px',
      fontFamily: 'sans-serif',
      fontWeight: '600',
      color: '#fff',
      boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
      background: type === 'ok' ? '#22c55e' : type === 'warn' ? '#f59e0b' : '#ef4444',
      transition: 'opacity 0.4s',
    });
    document.body.appendChild(toastEl);

    setTimeout(() => {
      if (toastEl) { toastEl.style.opacity = '0'; setTimeout(() => toastEl?.remove(), 400); }
    }, 4000);
  }
})();
