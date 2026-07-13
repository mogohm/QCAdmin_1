import { neon } from "@neondatabase/serverless";

export function sql() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing");
  return neon(process.env.DATABASE_URL);
}

export async function query(strings, ...values) {
  return sql()(strings, ...values);
}

// รันหลาย statement เป็น "transaction เดียว" (neon HTTP batch) — สำเร็จทั้งชุดหรือ rollback ทั้งชุด
//   ใช้กับ write หลายขั้นที่ห้ามขาดกลาง (เช่น DELETE snapshot + INSERT ทั้ง period ของค่าคอม)
//   build(tx) ต้อง "คืน array ของ tx`...`" โดยไม่ await ทีละตัว — neon ส่งทั้งชุดใน request เดียว
export async function transaction(build) {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing");
  const s = neon(process.env.DATABASE_URL);
  return s.transaction((tx) => build(tx));
}
