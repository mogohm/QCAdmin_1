// init-db — รัน sql/schema.sql ทั้งหมด (idempotent: CREATE/ALTER ... IF NOT EXISTS)
//   DATABASE_URL=postgres://… npm run db:init
const { neon } = require("@neondatabase/serverless");
const fs = require("fs");
const path = require("path");

(async () => {
  if (!process.env.DATABASE_URL) {
    console.error("❌ ต้องตั้ง DATABASE_URL ก่อน เช่น:  DATABASE_URL=postgres://… npm run db:init");
    process.exit(1);
  }
  const db = neon(process.env.DATABASE_URL);
  const schemaPath = path.join(__dirname, "..", "sql", "schema.sql");
  const sql = fs.readFileSync(schemaPath, "utf8");
  const statements = sql
    .split(/;\s*\n/)
    .map((x) => x.trim())
    .filter(Boolean);

  let ok = 0;
  for (const part of statements) {
    try {
      await db(part);
      ok++;
    } catch (e) {
      console.error(`⚠️  statement ล้มเหลว: ${part.slice(0, 60)}… → ${e.message}`);
    }
  }
  console.log(
    `✅ DB initialized — รัน ${ok}/${statements.length} statements จาก ${path.relative(process.cwd(), schemaPath)}`,
  );
  process.exit(0);
})().catch((e) => {
  console.error("fatal:", e.message);
  process.exit(1);
});
