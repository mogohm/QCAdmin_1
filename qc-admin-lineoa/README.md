# QC Admin Line OA

ระบบ QC Admin สำหรับ LINE Official Account บน Next.js + Vercel + Neon Postgres

## Features
- LINE webhook รับข้อความลูกค้า
- Admin Console สำหรับตอบลูกค้าผ่าน LINE Push API เพื่อวัด SLA รายแอดมิน
- Import Admin จาก Manage permissions โดยรับเฉพาะชื่อขึ้นต้น `PK` รองรับ emoji/unicode
- QC Engine: response time, correctness keyword rules, sentiment/service mind, bot-like phrase penalty
- Dashboard สไตล์ enterprise contact-center layout
- Ranking Admin และ Promotion performance
- API รับ event จากระบบสมัคร/KYC/เติมเงิน
- Telegram alert สำหรับ fail case

## Deploy quick start
1. Push repo to GitHub
2. Import to Vercel
3. Add Neon Postgres integration and copy DATABASE_URL
4. Add env vars from `.env.example`
5. Run `sql/schema.sql` in Neon SQL Editor
6. Set LINE webhook URL = `https://YOUR_DOMAIN/api/webhook`
7. Open `/admin` to import PK admins and reply to cases

## Important production note
LINE webhook records customer-side events. To measure per-admin response quality accurately, admins must reply through this app, or you need a separate chat-log import connector. Replies typed directly in LINE OA Manager are not available as per-admin webhook events.
