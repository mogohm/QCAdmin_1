"use client";
import { useState } from "react";
import { explainMetric } from "@/lib/ui-labels";

// MetricHelp — ไอคอน (?) แสดงคำอธิบาย metric เป็นภาษาไทย (hover/คลิก)
//   props: { label } — ชื่อ metric ไทย หรือ { text } — คำอธิบายเอง
export default function MetricHelp({ label, text }) {
  const [open, setOpen] = useState(false);
  const help = text || explainMetric(label);
  if (!help) return null;
  return (
    <span
      style={{ position: "relative", display: "inline-block", marginLeft: 4 }}
    >
      <span
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={() => setOpen((v) => !v)}
        style={{
          cursor: "help",
          display: "inline-grid",
          placeItems: "center",
          width: 15,
          height: 15,
          borderRadius: "50%",
          background: "rgba(95,208,255,.18)",
          border: "1px solid rgba(95,208,255,.4)",
          color: "#9fd8ff",
          fontSize: 10,
          fontWeight: 700,
          lineHeight: 1,
        }}
      >
        ?
      </span>
      {open && (
        <span
          style={{
            position: "absolute",
            bottom: "130%",
            left: "50%",
            transform: "translateX(-50%)",
            width: 240,
            maxWidth: "70vw",
            background: "#0e1c33",
            border: "1px solid #2a456f",
            borderRadius: 10,
            padding: "8px 11px",
            fontSize: 12,
            fontWeight: 400,
            color: "#dbe7fb",
            lineHeight: 1.5,
            zIndex: 1500,
            boxShadow: "0 10px 30px rgba(0,0,0,.5)",
            whiteSpace: "normal",
          }}
        >
          {help}
        </span>
      )}
    </span>
  );
}
