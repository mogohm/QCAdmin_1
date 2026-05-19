'use client';
import { useEffect, useState } from 'react';

const CATEGORIES = ['register', 'kyc', 'deposit', 'promotion', 'other'];

const blank = () => ({
  rule_code: '', rule_name: '', category: 'register',
  question_keywords: '', answer_keywords: '', weight: 1, is_active: true,
});

function parseKw(str) {
  if (!str) return [];
  try { const j = JSON.parse(str); if (Array.isArray(j)) return j; } catch {}
  return str.split(',').map(s => s.trim()).filter(Boolean);
}

function fmtKw(arr) {
  if (!arr || !arr.length) return '';
  return Array.isArray(arr) ? arr.join(', ') : String(arr);
}

function scoreClass(v) { return v >= 85 ? '#22c55e' : v >= 70 ? '#f59e0b' : '#ef4444'; }

export default function RulesPage() {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);       // null = closed, {} = add/edit
  const [editId, setEditId] = useState(null);   // null = add mode
  const [apiKey, setApiKey] = useState('');
  const [msg, setMsg] = useState(null);
  const [delConfirm, setDelConfirm] = useState(null);

  const load = async () => {
    setLoading(true);
    const r = await fetch('/api/config/rules').then(r => r.json()).catch(() => []);
    setRules(Array.isArray(r) ? r : []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => { setEditId(null); setForm(blank()); setMsg(null); };
  const openEdit = (rule) => {
    setEditId(rule.id);
    setForm({
      rule_code: rule.rule_code,
      rule_name: rule.rule_name,
      category: rule.category,
      question_keywords: fmtKw(rule.question_keywords),
      answer_keywords: fmtKw(rule.answer_keywords),
      weight: rule.weight ?? 1,
      is_active: rule.is_active,
    });
    setMsg(null);
  };

  const save = async () => {
    const body = {
      rule_code: form.rule_code.trim(),
      rule_name: form.rule_name.trim(),
      category: form.category,
      question_keywords: parseKw(form.question_keywords),
      answer_keywords: parseKw(form.answer_keywords),
      weight: parseFloat(form.weight) || 1,
      is_active: form.is_active,
    };
    if (!body.rule_code || !body.rule_name) { setMsg({ ok: false, text: 'กรุณากรอก Rule Code และ Rule Name' }); return; }

    let r;
    if (editId) {
      r = await fetch(`/api/config/rules/${editId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify(body),
      }).then(r => r.json());
    } else {
      r = await fetch('/api/config/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify(body),
      }).then(r => r.json());
    }

    if (r?.error) { setMsg({ ok: false, text: r.error }); return; }
    setMsg({ ok: true, text: editId ? 'อัปเดตแล้ว ✓' : 'เพิ่มแล้ว ✓' });
    setForm(null);
    load();
  };

  const toggleActive = async (rule) => {
    await fetch(`/api/config/rules/${rule.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ is_active: !rule.is_active }),
    });
    load();
  };

  const del = async (id) => {
    const r = await fetch(`/api/config/rules/${id}`, {
      method: 'DELETE',
      headers: { 'x-api-key': apiKey },
    }).then(r => r.json());
    if (r?.error) { setMsg({ ok: false, text: r.error }); return; }
    setDelConfirm(null);
    load();
  };

  const catColor = { register: '#3b82f6', kyc: '#8b5cf6', deposit: '#10b981', promotion: '#f59e0b', other: '#6b7280' };

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">QC<span>Admin</span></div>
        <nav className="nav">
          <a href="/">Dashboard</a>
          <a href="/admin">Admin Console</a>
          <a href="/scraper">Scraper</a>
          <a className="active" href="/rules">⚙️ QC Rules</a>
          <a href="/docs">Setup Docs</a>
          <a href="/PROJECT_DOCS.html" target="_blank">📄 Project Docs</a>
        </nav>
      </aside>
      <main className="main">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>⚙️ จัดการ QC Rules</h1>
        <span style={{ marginLeft: 'auto', fontSize: 13, color: '#6b7280' }}>{rules.length} rules</span>
      </div>

      {/* API Key + Add */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <input
          type="password" placeholder="Admin API Key (สำหรับแก้ไข/ลบ)"
          value={apiKey} onChange={e => setApiKey(e.target.value)}
          style={{ flex: 1, minWidth: 220, padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14 }}
        />
        <button onClick={openAdd} style={{ padding: '8px 20px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
          + เพิ่ม Rule
        </button>
      </div>

      {msg && (
        <div style={{ padding: '10px 16px', borderRadius: 8, marginBottom: 16, background: msg.ok ? '#dcfce7' : '#fee2e2', color: msg.ok ? '#166534' : '#991b1b' }}>
          {msg.text}
        </div>
      )}

      {/* Rules Table */}
      {loading ? (
        <div style={{ color: '#6b7280', textAlign: 'center', padding: 40 }}>กำลังโหลด...</div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,.08)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f1f5f9' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Rule Code</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>ชื่อ Rule</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Category</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>คำถาม (keywords)</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>คำตอบ (keywords)</th>
                <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600, color: '#374151' }}>Weight</th>
                <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600, color: '#374151' }}>สถานะ</th>
                <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600, color: '#374151' }}>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule, i) => (
                <tr key={rule.id} style={{ borderTop: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa', opacity: rule.is_active ? 1 : 0.5 }}>
                  <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontWeight: 600, color: '#1d4ed8' }}>{rule.rule_code}</td>
                  <td style={{ padding: '12px 16px' }}>{rule.rule_name}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ background: catColor[rule.category] || '#6b7280', color: '#fff', borderRadius: 6, padding: '2px 10px', fontSize: 12, fontWeight: 600 }}>
                      {rule.category}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', color: '#4b5563', maxWidth: 180 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {(Array.isArray(rule.question_keywords) ? rule.question_keywords : []).map((k, j) => (
                        <span key={j} style={{ background: '#e0f2fe', color: '#0369a1', borderRadius: 4, padding: '1px 6px', fontSize: 11 }}>{k}</span>
                      ))}
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px', color: '#4b5563', maxWidth: 180 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {(Array.isArray(rule.answer_keywords) ? rule.answer_keywords : []).map((k, j) => (
                        <span key={j} style={{ background: '#dcfce7', color: '#166534', borderRadius: 4, padding: '1px 6px', fontSize: 11 }}>{k}</span>
                      ))}
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>{rule.weight}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <button
                      onClick={() => toggleActive(rule)}
                      style={{ background: rule.is_active ? '#dcfce7' : '#f1f5f9', color: rule.is_active ? '#166534' : '#6b7280', border: 'none', borderRadius: 20, padding: '4px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                    >
                      {rule.is_active ? '✓ ใช้งาน' : '✗ ปิด'}
                    </button>
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                      <button onClick={() => openEdit(rule)} style={{ background: '#dbeafe', color: '#1d4ed8', border: 'none', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontSize: 12 }}>แก้ไข</button>
                      <button onClick={() => setDelConfirm(rule)} style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontSize: 12 }}>ลบ</button>
                    </div>
                  </td>
                </tr>
              ))}
              {rules.length === 0 && (
                <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>ยังไม่มี Rule</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Add/Edit Modal */}
      {form && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 32, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ margin: '0 0 20px', fontSize: 18 }}>{editId ? 'แก้ไข Rule' : 'เพิ่ม Rule ใหม่'}</h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>
                Rule Code
                <input disabled={!!editId} value={form.rule_code} onChange={e => setForm(f => ({ ...f, rule_code: e.target.value }))}
                  placeholder="เช่น DEP-002"
                  style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, background: editId ? '#f9fafb' : '#fff', boxSizing: 'border-box' }} />
              </label>

              <label style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>
                Rule Name
                <input value={form.rule_name} onChange={e => setForm(f => ({ ...f, rule_name: e.target.value }))}
                  placeholder="เช่น ตอบคำถามฝากเงิน"
                  style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }} />
              </label>

              <label style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>
                Category
                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>

              <label style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>
                คำถาม Keywords <span style={{ fontWeight: 400, color: '#6b7280' }}>(คั่นด้วย ,)</span>
                <textarea value={form.question_keywords} onChange={e => setForm(f => ({ ...f, question_keywords: e.target.value }))}
                  placeholder="เช่น ฝาก, โอน, เติมเงิน"
                  rows={2}
                  style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, resize: 'vertical', boxSizing: 'border-box' }} />
              </label>

              <label style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>
                คำตอบ Keywords <span style={{ fontWeight: 400, color: '#6b7280' }}>(คั่นด้วย ,)</span>
                <textarea value={form.answer_keywords} onChange={e => setForm(f => ({ ...f, answer_keywords: e.target.value }))}
                  placeholder="เช่น สลิป, ตรวจสอบ, QR"
                  rows={2}
                  style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, resize: 'vertical', boxSizing: 'border-box' }} />
              </label>

              <label style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>
                Weight (0.1 – 5)
                <input type="number" min="0.1" max="5" step="0.1" value={form.weight}
                  onChange={e => setForm(f => ({ ...f, weight: e.target.value }))}
                  style={{ display: 'block', width: 100, marginTop: 4, padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14 }} />
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} style={{ width: 16, height: 16 }} />
                เปิดใช้งาน Rule นี้
              </label>
            </div>

            {msg && <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 6, background: msg.ok ? '#dcfce7' : '#fee2e2', color: msg.ok ? '#166534' : '#991b1b', fontSize: 13 }}>{msg.text}</div>}

            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button onClick={() => setForm(null)} style={{ padding: '8px 20px', background: '#f1f5f9', border: 'none', borderRadius: 8, cursor: 'pointer' }}>ยกเลิก</button>
              <button onClick={save} style={{ padding: '8px 24px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>บันทึก</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {delConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 32, maxWidth: 380, width: '100%', margin: 16 }}>
            <h3 style={{ margin: '0 0 12px', color: '#dc2626' }}>ยืนยันการลบ</h3>
            <p style={{ margin: '0 0 20px', color: '#374151' }}>ต้องการลบ <b>{delConfirm.rule_code}</b> — {delConfirm.rule_name} ?</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setDelConfirm(null)} style={{ padding: '8px 20px', background: '#f1f5f9', border: 'none', borderRadius: 8, cursor: 'pointer' }}>ยกเลิก</button>
              <button onClick={() => del(delConfirm.id)} style={{ padding: '8px 20px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>ลบเลย</button>
            </div>
          </div>
        </div>
      )}
      </main>
    </div>
  );
}
