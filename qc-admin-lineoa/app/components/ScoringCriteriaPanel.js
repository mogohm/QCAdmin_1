"use client";
import { useState } from "react";

// เกณฑ์การให้คะแนน QC (ตรงกับ rubric ใน lib/qc-engine.js) — ใช้ซ้ำได้ทุกหน้า
const CRITERIA = [
  {
    code: "problemSolving",
    th: "ความถูกต้องตาม SOP / การแก้ปัญหา",
    weight: 20,
    desc: "ตอบตรงปัญหา ถูกต้องตาม SOP ไม่ให้ข้อมูลผิด",
  },
  {
    code: "communicationTone",
    th: "น้ำเสียงและความสุภาพ",
    weight: 20,
    desc: "สุภาพ เป็นมิตร ไม่ห้วน ไม่หยาบคาย",
  },
  {
    code: "greetingClosing",
    th: "การทักทายและปิดเคส",
    weight: 15,
    desc: "ทักทายเปิดเคส และปิดเคสอย่างเหมาะสม",
  },
  {
    code: "responseTime",
    th: "ความเร็วในการตอบ",
    weight: 10,
    desc: "ตอบภายในเวลา SLA ที่กำหนด",
  },
  {
    code: "kycProcess",
    th: "KYC Process",
    weight: 10,
    desc: "ดำเนินการยืนยันตัวตนถูกขั้นตอน",
  },
  {
    code: "creditDepositWithdraw",
    th: "ฝาก / ถอน",
    weight: 10,
    desc: "จัดการเรื่องฝาก-ถอนถูกต้อง ปลอดภัย",
  },
  {
    code: "upsellPromotion",
    th: "Promotion / Upsell",
    weight: 10,
    desc: "แนะนำโปรโมชันเมื่อเหมาะสม",
  },
];
const PENALTY = [
  {
    th: "Minor Error",
    weight: -5,
    desc: "ข้อผิดพลาดเล็กน้อย หัก 5 คะแนน/ครั้ง",
  },
  {
    th: "Fatal Error",
    weight: "0 คะแนน",
    desc: "ข้อผิดพลาดร้ายแรง (คำต้องห้าม/ผิดนโยบาย) = เคสตก",
  },
];

export function ScoringCriteriaButton({ style }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="ghost"
        style={{ fontSize: 12, ...style }}
      >
        📋 ดูเกณฑ์คะแนน
      </button>
      {open && <ScoringCriteriaPanel onClose={() => setOpen(false)} />}
    </>
  );
}

export default function ScoringCriteriaPanel({ onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(2,8,25,.72)",
        display: "grid",
        placeItems: "center",
        zIndex: 1200,
        padding: 16,
      }}
    >
      <div
        className="glass glow"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 620,
          maxWidth: "96vw",
          maxHeight: "88vh",
          overflow: "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 6,
          }}
        >
          <h3 style={{ margin: 0 }}>เกณฑ์การให้คะแนน QC</h3>
          <button onClick={onClose} className="ghost" style={{ fontSize: 12 }}>
            ปิด
          </button>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
          คะแนนเต็ม 100 — ถ่วงน้ำหนักตามมิติด้านล่าง แล้วหักคะแนนหากมี Minor
          Error และเป็น 0 หากมี Fatal Error
        </p>
        <table className="table">
          <thead>
            <tr>
              <th>มิติการประเมิน</th>
              <th style={{ textAlign: "right" }}>น้ำหนัก</th>
              <th>คำอธิบาย</th>
            </tr>
          </thead>
          <tbody>
            {CRITERIA.map((c) => (
              <tr key={c.code}>
                <td style={{ fontWeight: 700, color: "#e7eefc" }}>{c.th}</td>
                <td style={{ textAlign: "right" }}>
                  <span className="badge">{c.weight}%</span>
                </td>
                <td className="muted" style={{ fontSize: 12 }}>
                  {c.desc}
                </td>
              </tr>
            ))}
            {PENALTY.map((c) => (
              <tr key={c.th}>
                <td style={{ fontWeight: 700, color: "#ffb4b4" }}>{c.th}</td>
                <td style={{ textAlign: "right", color: "#ff8585" }}>
                  {c.weight}
                </td>
                <td className="muted" style={{ fontSize: 12 }}>
                  {c.desc}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="muted" style={{ fontSize: 11, marginTop: 10 }}>
          Tier: ≥90 Excellent · ≥80 Standard · ≥70 Warning · &lt;70 Critical
          (เคสผิดพลาด)
        </div>
      </div>
    </div>
  );
}
