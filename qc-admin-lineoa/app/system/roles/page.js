"use client";
import { useEffect, useState } from "react";
import AppShell from "../../components/AppShell";

const DANGER = [
  "system.users.disable",
  "system.roles.manage",
  "system.settings.manage",
  "sop.delete",
  "qc.score.override",
  "commission.adjust",
];

export default function Roles() {
  const [roles, setRoles] = useState([]);
  const [all, setAll] = useState([]);
  const [sel, setSel] = useState(null);
  const [draft, setDraft] = useState([]);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const load = () =>
    fetch("/api/system/roles")
      .then((r) => (r.ok ? r.json() : r.json().then((j) => Promise.reject(j.error || r.status))))
      .then((d) => {
        setRoles(d.roles || []);
        setAll(d.all_permissions || []);
        if (!sel && d.roles?.length) {
          const first = d.roles.find((r) => r.role_key !== "system_admin") || d.roles[0];
          setSel(first.role_key);
          setDraft(first.permissions || []);
        }
      })
      .catch((e) => setErr(String(e)));
  useEffect(() => {
    load();
  }, []);

  const pickRole = (r) => {
    setSel(r.role_key);
    setDraft(r.permissions || []);
    setMsg("");
  };
  const toggle = (p) => setDraft((d) => (d.includes(p) ? d.filter((x) => x !== p) : [...d, p]));
  const save = async () => {
    const r = await fetch(`/api/system/roles/${sel}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ permissions: draft }),
    });
    const j = await r.json();
    if (!r.ok) return alert(j.error || "error");
    setMsg("✅ บันทึกสิทธิ์ " + sel + " แล้ว");
    load();
  };

  const modules = [...new Set(all.map((p) => p.split(".")[0]))];
  const selRole = roles.find((r) => r.role_key === sel);

  if (err)
    return (
      <AppShell title="Role Permissions" subtitle="กำหนดสิทธิ์ต่อบทบาท">
        <div className="glass glow empty" style={{ color: "#f6c65b" }}>
          🔒 {err === "forbidden" ? "ไม่มีสิทธิ์ (system.roles.manage)" : err}
        </div>
      </AppShell>
    );

  return (
    <AppShell title="Role Permissions" subtitle="กำหนดสิทธิ์ต่อบทบาท (server-enforced)">
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {roles.map((r) => (
          <span key={r.role_key} className={`chip ${sel === r.role_key ? "on" : ""}`} onClick={() => pickRole(r)}>
            {r.role_name} <span className="muted">({(r.permissions || []).length})</span>
          </span>
        ))}
      </div>
      {msg && (
        <div className="loadbar" style={{ color: "#22c55e" }}>
          {msg}
        </div>
      )}
      <div className="glass glow">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div className="panel-title" style={{ margin: 0 }}>
            สิทธิ์ของ {selRole?.role_name || sel}
            {sel === "system_admin" && <span className="tag">มีทุกสิทธิ์ — แก้ไม่ได้</span>}
          </div>
          {sel !== "system_admin" && <button onClick={save}>💾 บันทึก</button>}
        </div>
        {modules.map((mod) => (
          <div key={mod} style={{ marginBottom: 12 }}>
            <div
              className="muted"
              style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}
            >
              {mod}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {all
                .filter((p) => p.startsWith(mod + "."))
                .map((p) => {
                  const on = sel === "system_admin" || draft.includes(p);
                  return (
                    <span
                      key={p}
                      onClick={() => sel !== "system_admin" && toggle(p)}
                      className={`chip ${on ? "on" : ""}`}
                      style={{
                        cursor: sel === "system_admin" ? "default" : "pointer",
                        borderColor: DANGER.includes(p) && on ? "#ef4444" : undefined,
                      }}
                      title={DANGER.includes(p) ? "⚠️ สิทธิ์อันตราย" : ""}
                    >
                      {on ? "✓ " : ""}
                      {p.split(".").slice(1).join(".")}
                      {DANGER.includes(p) && " ⚠️"}
                    </span>
                  );
                })}
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
