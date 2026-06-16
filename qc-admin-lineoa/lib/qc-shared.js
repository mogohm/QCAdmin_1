// helpers ที่ใช้ร่วมกันฝั่ง server (CommonJS-safe ผ่าน import ใน Next)
import { query } from "@/lib/db";

// โหลด SOP scripts + fatal rules (เงียบถ้าตารางยังไม่มี)
export async function loadKnowledge() {
  try {
    const [sops, fatals] = await Promise.all([
      query`SELECT id, topic, question, answer, intent, category_code,
                   keywords, required_keywords, forbidden_keywords, escalation
            FROM sop_scripts WHERE is_active IS NOT false`,
      query`SELECT code, name, patterns, applies_to, is_active FROM fatal_rules WHERE is_active = true`,
    ]);
    return { sops, fatalRules: fatals };
  } catch {
    return { sops: [], fatalRules: [] };
  }
}

// มี system event ที่ affects_sla active ครอบเวลา at ไหม
export async function isSlaException(at = null) {
  try {
    const t = at ? new Date(at).toISOString() : new Date().toISOString();
    const rows = await query`
      SELECT id, title FROM system_events
      WHERE is_active = true AND affects_sla = true
        AND starts_at <= ${t}::timestamptz
        AND (ends_at IS NULL OR ends_at >= ${t}::timestamptz)
      LIMIT 1`;
    return rows[0] ? { active: true, event: rows[0] } : { active: false, event: null };
  } catch {
    return { active: false, event: null };
  }
}
