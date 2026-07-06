// evidence-storage.js — storage adapter สำหรับภาพหลักฐาน
//   EVIDENCE_STORAGE = blob (Vercel Blob → HTTPS url) | local (ไม่อัปโหลด, ใช้ file_path)
//   production default = blob; ถ้าไม่มี BLOB_READ_WRITE_TOKEN → fallback เป็น data URL (base64)
//     ซึ่งยังแสดงบน production ได้ (แต่ไม่ใช่ https) — ตั้ง token เพื่อให้ได้ HTTPS url จริง
import { put } from "@vercel/blob";

export function evidenceStorageMode() {
  return (
    process.env.EVIDENCE_STORAGE ||
    (process.env.NODE_ENV === "production" ? "blob" : "local")
  ).toLowerCase();
}

function guessType(dataUrl) {
  const m = String(dataUrl).match(/^data:([^;]+);/);
  return m ? m[1] : "image/jpeg";
}

// เก็บภาพ (รับ base64 data URL หรือ base64 ล้วน) → { url, storage }
//   url = https (blob) หรือ data:image (fallback) — EvidenceViewer แสดงได้ทั้งคู่
export async function storeImage(base64, key) {
  if (!base64) return { url: null, storage: "none" };
  const dataUrl = String(base64).startsWith("data:")
    ? String(base64)
    : `data:image/jpeg;base64,${base64}`;
  const mode = evidenceStorageMode();

  if (mode === "blob" && process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const raw = dataUrl.split(",")[1] || "";
      const buf = Buffer.from(raw, "base64");
      const { url } = await put(`evidence/${key}`, buf, {
        access: "public",
        contentType: guessType(dataUrl),
        addRandomSuffix: true,
      });
      return { url, storage: "blob" };
    } catch (e) {
      console.error("evidence blob put:", e.message);
      // ตกลงมา fallback data URL
    }
  }
  // fallback: เก็บเป็น data URL (แสดงบน UI ได้ แต่ไม่ใช่ https)
  return { url: dataUrl, storage: "inline" };
}
