import { query } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import sopData from '@/data/sop-data.json';

// นำเข้า SOP knowledge base เข้า Postgres (รัน migration v3 + insert จาก data/sop-data.json)
// เรียกครั้งเดียวหลัง deploy:  POST /api/admin/import-sop
export async function POST(req) {
  if (!requireAdmin(req)) return Response.json({ error: 'unauthorized' }, { status: 401 });
  try {
  // ---- migration v3 (idempotent) ----
  await query`CREATE TABLE IF NOT EXISTS sop_categories (
    id SERIAL PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, description TEXT,
    created_at TIMESTAMPTZ DEFAULT now())`;
  await query`CREATE TABLE IF NOT EXISTS sop_scripts (
    id SERIAL PRIMARY KEY, category_code TEXT, topic TEXT NOT NULL, question TEXT, answer TEXT NOT NULL,
    intent TEXT, keywords JSONB NOT NULL DEFAULT '[]', required_keywords JSONB NOT NULL DEFAULT '[]',
    forbidden_keywords JSONB NOT NULL DEFAULT '[]', escalation BOOLEAN DEFAULT false,
    source_sheet TEXT, source_row INT, created_at TIMESTAMPTZ DEFAULT now(), UNIQUE(topic))`;
  await query`CREATE TABLE IF NOT EXISTS intent_patterns (
    id SERIAL PRIMARY KEY, intent TEXT NOT NULL, pattern TEXT NOT NULL, lang TEXT DEFAULT 'th',
    weight NUMERIC(5,2) DEFAULT 1, UNIQUE(intent, pattern))`;
  await query`CREATE TABLE IF NOT EXISTS fatal_rules (
    id SERIAL PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, description TEXT,
    patterns JSONB NOT NULL DEFAULT '[]', applies_to TEXT, severity TEXT DEFAULT 'fatal',
    is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT now())`;
  // qc_scores upgrade columns (tagged template, no interpolation)
  await query`ALTER TABLE qc_scores ADD COLUMN IF NOT EXISTS intent TEXT`;
  await query`ALTER TABLE qc_scores ADD COLUMN IF NOT EXISTS matched_sop_id INT`;
  await query`ALTER TABLE qc_scores ADD COLUMN IF NOT EXISTS sop_confidence INT`;
  await query`ALTER TABLE qc_scores ADD COLUMN IF NOT EXISTS dimension_scores JSONB DEFAULT '{}'`;
  await query`ALTER TABLE qc_scores ADD COLUMN IF NOT EXISTS is_fatal BOOLEAN DEFAULT false`;
  await query`ALTER TABLE qc_scores ADD COLUMN IF NOT EXISTS fatal_reasons JSONB DEFAULT '[]'`;
  await query`ALTER TABLE qc_scores ADD COLUMN IF NOT EXISTS coaching JSONB`;

  // ---- insert จาก JSON ----
  for (const c of sopData.categories)
    await query`INSERT INTO sop_categories (code,name,description) VALUES (${c.code},${c.name},${c.description})
                ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description`;

  let scripts = 0;
  for (const s of sopData.scripts) {
    await query`INSERT INTO sop_scripts
      (category_code,topic,question,answer,intent,keywords,required_keywords,forbidden_keywords,escalation,source_sheet,source_row)
      VALUES (${s.category_code},${s.topic},${s.question},${s.answer},${s.intent},
              ${JSON.stringify(s.keywords)},${JSON.stringify(s.required_keywords)},${JSON.stringify(s.forbidden_keywords)},
              ${s.escalation},${s.source_sheet},${s.source_row})
      ON CONFLICT (topic) DO UPDATE SET answer=EXCLUDED.answer, intent=EXCLUDED.intent, category_code=EXCLUDED.category_code,
              keywords=EXCLUDED.keywords, required_keywords=EXCLUDED.required_keywords,
              forbidden_keywords=EXCLUDED.forbidden_keywords, escalation=EXCLUDED.escalation`;
    scripts++;
  }
  for (const p of sopData.intent_patterns)
    await query`INSERT INTO intent_patterns (intent,pattern,lang,weight) VALUES (${p.intent},${p.pattern},${p.lang},${p.weight})
                ON CONFLICT (intent,pattern) DO UPDATE SET weight=EXCLUDED.weight, lang=EXCLUDED.lang`;
  for (const f of sopData.fatal_rules)
    await query`INSERT INTO fatal_rules (code,name,description,patterns,applies_to) VALUES (${f.code},${f.name},${f.description},${JSON.stringify(f.patterns)},${f.applies_to})
                ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description, patterns=EXCLUDED.patterns`;

  const counts = {
    categories: sopData.categories.length,
    scripts,
    intent_patterns: sopData.intent_patterns.length,
    fatal_rules: sopData.fatal_rules.length,
  };
  return Response.json({ ok: true, imported: counts, stats: sopData.stats });
  } catch (e) {
    return Response.json({ error: e.message, stack: String(e.stack || '').split('\n').slice(0, 3) }, { status: 500 });
  }
}

// GET: ดูสถานะ knowledge base ปัจจุบัน
export async function GET(req) {
  if (!requireAdmin(req)) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const [cats, scripts, pats, fatals] = await Promise.all([
    query`SELECT count(*)::int n FROM sop_categories`.catch(() => [{ n: 0 }]),
    query`SELECT count(*)::int n FROM sop_scripts`.catch(() => [{ n: 0 }]),
    query`SELECT count(*)::int n FROM intent_patterns`.catch(() => [{ n: 0 }]),
    query`SELECT count(*)::int n FROM fatal_rules`.catch(() => [{ n: 0 }]),
  ]);
  return Response.json({ categories: cats[0].n, scripts: scripts[0].n, intent_patterns: pats[0].n, fatal_rules: fatals[0].n });
}
