const { neon } = require('@neondatabase/serverless');
const fs = require('fs');
(async()=>{
  const db = neon(process.env.DATABASE_URL);
  const sql = fs.readFileSync('sql/schema.sql','utf8');
  for (const part of sql.split(/;\s*\n/).map(x=>x.trim()).filter(Boolean)) await db(part);
  console.log('DB initialized');
})();
