import { query } from "@/lib/db";
import { guard } from "@/lib/permissions";

async function safe(fn, fb) {
  try {
    return await fn();
  } catch (e) {
    console.error("query:", e.message);
    return fb;
  }
}

export async function GET(req) {
  const g = guard(
    req,
    "dashboard.executive.view",
    "dashboard.manager.view",
    "dashboard.admin.view",
    "dashboard.marketing.view",
    "dashboard.leaderboard.view",
  );
  if (g) return g;
  const { searchParams } = new URL(req.url);
  const dateFrom = searchParams.get("from") || "2000-01-01";
  const dateTo = searchParams.get("to") || "2099-12-31";

  try {
    const [
      kpiRows,
      rankingAll,
      weeklySummary,
      promos,
      pendingReply,
      replyLog,
      lastActivity,
    ] = await Promise.all([
      // KPI — กรองตามวันที่
      safe(
        () => query`SELECT
        (SELECT count(DISTINCT m.line_user_id) FROM messages m
         WHERE m.created_at >= ${dateFrom}::date - interval '7 hours' AND m.created_at < ${dateTo}::date + interval '17 hours')::int AS customers,
        (SELECT count(*) FROM customer_events
         WHERE event_type='register' AND status='pass'
           AND created_at >= ${dateFrom}::date - interval '7 hours' AND created_at < ${dateTo}::date + interval '17 hours')::int AS registered_pass,
        (SELECT count(*) FROM customer_events
         WHERE event_type='kyc' AND status='pass'
           AND created_at >= ${dateFrom}::date - interval '7 hours' AND created_at < ${dateTo}::date + interval '17 hours')::int AS kyc_pass,
        (SELECT coalesce(sum(amount),0) FROM customer_events
         WHERE event_type='deposit'
           AND created_at >= ${dateFrom}::date - interval '7 hours' AND created_at < ${dateTo}::date + interval '17 hours')::numeric AS deposit_total,
        (SELECT coalesce(avg(q.response_seconds) FILTER (WHERE q.response_seconds > 0),0)::int
         FROM qc_scores q WHERE (q.case_at >= ${dateFrom}::date - interval '7 hours' AND q.case_at < ${dateTo}::date + interval '17 hours')) AS avg_response_sec,
        (SELECT coalesce(avg(q.final_score),0)::int
         FROM qc_scores q WHERE (q.case_at >= ${dateFrom}::date - interval '7 hours' AND q.case_at < ${dateTo}::date + interval '17 hours')) AS avg_score`,
        [{}],
      ),

      // Ranking ทั้งหมด (frontend แสดง 10 + toggle)
      safe(
        () => query`
        SELECT
          a.id, a.member_name,
          count(q.id)::int                                                              AS cases,
          coalesce(avg(q.final_score),0)::int                                           AS avg_score,
          coalesce(avg(q.response_seconds) FILTER (WHERE q.response_seconds > 0),0)::int AS avg_response_sec,
          (count(q.id) FILTER (WHERE q.final_score >= 85))::int                         AS good,
          (count(q.id) FILTER (WHERE q.final_score >= 70 AND q.final_score < 85))::int  AS warn,
          (count(q.id) FILTER (WHERE q.final_score < 70 AND q.final_score IS NOT NULL))::int AS bad,
          max(q.created_at) AS last_reply_at,
          (SELECT count(*)::int FROM customer_events ce
           WHERE ce.metadata->>'admin_id' = a.id::text
             AND ce.event_type = 'register'
             AND ce.created_at >= ${dateFrom}::date - interval '7 hours' AND ce.created_at < ${dateTo}::date + interval '17 hours'
          ) AS reg_count,
          (SELECT coalesce(sum(ce.amount),0)::numeric FROM customer_events ce
           WHERE ce.metadata->>'admin_id' = a.id::text
             AND ce.event_type = 'deposit'
             AND ce.created_at >= ${dateFrom}::date - interval '7 hours' AND ce.created_at < ${dateTo}::date + interval '17 hours'
          ) AS deposit_sum
        FROM qc_admins a
        LEFT JOIN (
          SELECT q.* FROM qc_scores q
          WHERE (q.case_at >= ${dateFrom}::date - interval '7 hours' AND q.case_at < ${dateTo}::date + interval '17 hours')
        ) q ON q.admin_id = a.id
        WHERE a.is_active = true
        GROUP BY a.id, a.member_name
        ORDER BY avg_score DESC, cases DESC`,
        [],
      ),

      // Daily summary — แบ่งตามวัน 28 วันล่าสุด
      safe(
        () => query`
        SELECT
          (q.case_at AT TIME ZONE 'Asia/Bangkok')::date        AS day,
          count(q.id)::int                                                               AS total_cases,
          coalesce(avg(q.final_score),0)::int                                            AS avg_score,
          coalesce(avg(q.response_seconds) FILTER (WHERE q.response_seconds > 0),0)::int AS avg_response_sec,
          (count(q.id) FILTER (WHERE q.final_score >= 85))::int                          AS good,
          (count(q.id) FILTER (WHERE q.final_score < 70 AND q.final_score IS NOT NULL))::int AS bad,
          count(DISTINCT q.admin_id)::int                                                AS active_admins
        FROM qc_scores q
        WHERE (q.case_at >= ${dateFrom}::date - interval '7 hours' AND q.case_at < ${dateTo}::date + interval '17 hours')
        GROUP BY 1
        ORDER BY day DESC
        LIMIT 28`,
        [],
      ),

      safe(
        () => query`
        SELECT promotion_code, count(*)::int customer_count, coalesce(sum(amount),0)::numeric total_amount
        FROM customer_events WHERE promotion_code IS NOT NULL
        GROUP BY promotion_code ORDER BY total_amount DESC LIMIT 20`,
        [],
      ),

      // Pending Reply — conversations ที่ last message เป็นลูกค้าภายใน 7 วัน (admin ยังไม่ตอบ)
      safe(
        () => query`
        SELECT c.id, lc.display_name, lc.line_user_id,
          m.message_text AS last_customer_msg,
          m.created_at AS waiting_since,
          EXTRACT(EPOCH FROM (now() - m.created_at))/60 AS waiting_minutes,
          qa.member_name AS assigned_admin
        FROM conversations c
        JOIN line_customers lc ON lc.line_user_id = c.line_user_id
        JOIN LATERAL (
          SELECT message_text, created_at, direction
          FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1
        ) m ON m.direction = 'customer'
        LEFT JOIN qc_admins qa ON qa.id = c.assigned_admin_id
        WHERE m.created_at > now() - interval '7 days'
        ORDER BY m.created_at ASC
        LIMIT 20`,
        [],
      ),

      safe(
        () => query`
        WITH top_customers AS (
          SELECT line_user_id, MAX(created_at) AS last_at
          FROM messages
          WHERE direction = 'admin'
            AND admin_id IS NOT NULL
            AND created_at >= ${dateFrom}::date - interval '7 hours' AND created_at < ${dateTo}::date + interval '17 hours'
          GROUP BY line_user_id
          ORDER BY last_at DESC
          LIMIT 100
        )
        SELECT
          m.id, m.created_at,
          a.member_name     AS admin_name,
          lc.display_name   AS customer_name,
          m.line_user_id,
          m.message_text    AS reply_text,
          cust.message_text AS customer_text,
          q.final_score, q.speed_score, q.correctness_score,
          q.sentiment_score, q.response_seconds,
          q.fail_reasons, q.matched_rules
        FROM messages m
        JOIN top_customers tc       ON tc.line_user_id = m.line_user_id
        LEFT JOIN qc_admins a       ON a.id = m.admin_id
        LEFT JOIN line_customers lc ON lc.line_user_id = m.line_user_id
        LEFT JOIN qc_scores q       ON q.admin_message_id = m.id
        LEFT JOIN messages cust     ON cust.id = q.customer_message_id
        WHERE m.direction = 'admin'
          AND m.admin_id IS NOT NULL
          AND m.created_at >= ${dateFrom}::date - interval '7 hours' AND m.created_at < ${dateTo}::date + interval '17 hours'
        ORDER BY tc.last_at DESC, m.created_at DESC`,
        [],
      ),

      safe(
        () => query`
        SELECT
          (SELECT max(created_at) FROM messages WHERE direction='customer') AS last_customer_msg,
          (SELECT max(created_at) FROM messages WHERE direction='admin')    AS last_admin_reply,
          (SELECT max(first_seen_at) FROM line_customers)                   AS last_new_customer,
          now() AS server_time`,
        [{}],
      ),
    ]);

    // ---- Phase 2 summaries ----
    const [
      categorySummary,
      intentDistribution,
      fatalCases,
      minorCases,
      sopCoverage,
      coachingSummary,
      disputeSummary,
      commissionSummary,
      adminCategoryRanking,
      slaExceptionSummary,
    ] = await Promise.all([
      // categorySummary จาก qc_score_details จริง (รายมิติ rubric)
      safe(
        () => query`
        WITH dd AS (
          SELECT d.category_code, d.raw_score, d.weighted_score, d.pass, d.fail_reason
          FROM qc_score_details d JOIN qc_scores q ON q.id = d.qc_score_id
          WHERE d.raw_score IS NOT NULL AND d.category_code NOT IN ('minorError','fatalError')
            AND (q.case_at >= ${dateFrom}::date - interval '7 hours' AND q.case_at < ${dateTo}::date + interval '17 hours')
        ),
        tf AS (
          SELECT category_code, fail_reason, count(*)::int fn,
                 row_number() OVER (PARTITION BY category_code ORDER BY count(*) DESC) rn
          FROM dd WHERE pass=false AND fail_reason IS NOT NULL GROUP BY 1,2
        )
        SELECT dd.category_code,
               count(*)::int n,
               round(avg(dd.raw_score))::int avg_score,
               round(avg(dd.weighted_score)::numeric,2) avg_weighted,
               round(100.0*sum(CASE WHEN dd.pass THEN 1 ELSE 0 END)/NULLIF(count(*),0))::int pass_rate,
               sum(CASE WHEN dd.pass=false THEN 1 ELSE 0 END)::int fail_count,
               (SELECT fail_reason FROM tf WHERE tf.category_code=dd.category_code AND rn=1) top_fail_reason
        FROM dd GROUP BY dd.category_code ORDER BY avg_score ASC`,
        [],
      ),
      safe(
        () => query`SELECT COALESCE(intent,'general') intent, count(*)::int n
                       FROM qc_scores WHERE (case_at >= ${dateFrom}::date - interval '7 hours' AND case_at < ${dateTo}::date + interval '17 hours') GROUP BY 1 ORDER BY n DESC`,
        [],
      ),
      safe(
        () => query`SELECT q.id, q.final_score, q.intent, q.fatal_reasons, q.created_at, a.member_name admin, q.line_user_id
                       FROM qc_scores q LEFT JOIN qc_admins a ON a.id=q.admin_id
                       WHERE q.is_fatal=true AND (q.case_at >= ${dateFrom}::date - interval '7 hours' AND q.case_at < ${dateTo}::date + interval '17 hours')
                       ORDER BY q.created_at DESC LIMIT 20`,
        [],
      ),
      safe(
        () => query`SELECT count(*)::int n FROM qc_scores WHERE is_fatal=false AND final_score BETWEEN 50 AND 69
                       AND (case_at >= ${dateFrom}::date - interval '7 hours' AND case_at < ${dateTo}::date + interval '17 hours')`,
        [{ n: 0 }],
      ),
      safe(
        () => query`SELECT count(*)::int total, sum(CASE WHEN matched_sop_id IS NOT NULL THEN 1 ELSE 0 END)::int matched
                       FROM qc_scores WHERE (case_at >= ${dateFrom}::date - interval '7 hours' AND case_at < ${dateTo}::date + interval '17 hours')`,
        [{ total: 0, matched: 0 }],
      ),
      safe(
        () => query`SELECT q.id, q.final_score, q.intent, q.coaching, a.member_name admin, q.line_user_id, q.created_at
                       FROM qc_scores q LEFT JOIN qc_admins a ON a.id=q.admin_id
                       WHERE q.coaching IS NOT NULL AND (q.case_at >= ${dateFrom}::date - interval '7 hours' AND q.case_at < ${dateTo}::date + interval '17 hours')
                       ORDER BY q.created_at DESC LIMIT 25`,
        [],
      ),
      safe(
        () =>
          query`SELECT status, count(*)::int n FROM qc_disputes GROUP BY status`,
        [],
      ),
      safe(
        () => query`SELECT
                         sum(CASE WHEN final_score>=90 THEN 1 ELSE 0 END)::int tier1,
                         sum(CASE WHEN final_score BETWEEN 80 AND 89 THEN 1 ELSE 0 END)::int tier2,
                         sum(CASE WHEN final_score BETWEEN 70 AND 79 THEN 1 ELSE 0 END)::int tier3,
                         sum(CASE WHEN final_score<70 THEN 1 ELSE 0 END)::int tier4
                       FROM qc_scores WHERE (case_at >= ${dateFrom}::date - interval '7 hours' AND case_at < ${dateTo}::date + interval '17 hours')`,
        [{}],
      ),
      safe(
        () => query`SELECT a.member_name admin, a.id admin_id,
                         round(avg((q.dimension_scores->>'greetingClosing')::numeric))::int greeting_closing,
                         round(avg((q.dimension_scores->>'problemSolving')::numeric))::int problem_solving,
                         round(avg((q.dimension_scores->>'communicationTone')::numeric))::int communication_tone,
                         round(avg((q.dimension_scores->>'responseTime')::numeric))::int response_time
                       FROM qc_scores q JOIN qc_admins a ON a.id=q.admin_id
                       WHERE q.dimension_scores IS NOT NULL AND (q.case_at >= ${dateFrom}::date - interval '7 hours' AND q.case_at < ${dateTo}::date + interval '17 hours')
                       GROUP BY a.member_name, a.id HAVING count(*)>0 ORDER BY problem_solving DESC NULLS LAST LIMIT 30`,
        [],
      ),
      safe(
        () => query`SELECT
                         (SELECT count(*)::int FROM qc_scores WHERE sla_exception=true AND (case_at >= ${dateFrom}::date - interval '7 hours' AND case_at < ${dateTo}::date + interval '17 hours')) AS sla_exception_count,
                         (SELECT count(*)::int FROM system_events WHERE is_active=true AND (ends_at IS NULL OR ends_at>=now())) AS active_events,
                         (SELECT round(100.0 * sum(CASE WHEN (dimension_scores->>'responseTime')::numeric >= 80 OR sla_exception THEN 1 ELSE 0 END) / NULLIF(count(*),0))::int
                          FROM qc_scores WHERE dimension_scores IS NOT NULL AND (case_at >= ${dateFrom}::date - interval '7 hours' AND case_at < ${dateTo}::date + interval '17 hours')) AS sla_pass_pct`,
        [{}],
      ),
    ]);

    const cov = sopCoverage[0] || { total: 0, matched: 0 };
    const dispMap = Object.fromEntries(
      (disputeSummary || []).map((r) => [r.status, r.n]),
    );

    // เพิ่ม: fail reasons ซ้ำ + intent ที่ไม่ match SOP + commission ต่อ admin
    const [repeatedFails, unmatchedIntents] = await Promise.all([
      safe(
        () => query`SELECT category_code, fail_reason, count(*)::int n FROM qc_score_details d
                       JOIN qc_scores q ON q.id=d.qc_score_id
                       WHERE d.pass=false AND d.fail_reason IS NOT NULL AND d.category_code NOT IN ('minorError','fatalError')
                         AND (q.case_at >= ${dateFrom}::date - interval '7 hours' AND q.case_at < ${dateTo}::date + interval '17 hours')
                       GROUP BY 1,2 ORDER BY n DESC LIMIT 10`,
        [],
      ),
      safe(
        () => query`SELECT COALESCE(intent,'general') intent, count(*)::int n FROM qc_scores
                       WHERE matched_sop_id IS NULL AND (case_at >= ${dateFrom}::date - interval '7 hours' AND case_at < ${dateTo}::date + interval '17 hours')
                       GROUP BY 1 ORDER BY n DESC LIMIT 8`,
        [],
      ),
    ]);

    const counts = await safe(
      () => query`SELECT
        (SELECT count(*)::int FROM qc_scores WHERE (case_at >= ${dateFrom}::date - interval '7 hours' AND case_at < ${dateTo}::date + interval '17 hours')) AS qc_cases,
        (SELECT count(*)::int FROM messages WHERE direction='admin' AND created_at >= ${dateFrom}::date - interval '7 hours' AND created_at < ${dateTo}::date + interval '17 hours') AS admin_msgs,
        (SELECT count(*)::int FROM messages WHERE created_at >= ${dateFrom}::date - interval '7 hours' AND created_at < ${dateTo}::date + interval '17 hours') AS total_msgs`,
      [{}],
    );
    const cnt = counts[0] || {};

    // commission ต่อ admin (tier multiplier ตาม Excel) — rate = 1% ของยอด upsell (deposit)
    const dispByAdmin = await safe(
      () => query`SELECT admin_id, count(*)::int n FROM qc_disputes
       WHERE status='approved' AND created_at >= ${dateFrom}::date - interval '7 hours' AND created_at < ${dateTo}::date + interval '17 hours' GROUP BY admin_id`,
      [],
    );
    const dispMapAdmin = Object.fromEntries(
      (dispByAdmin || []).map((r) => [r.admin_id, r.n]),
    );
    const fatalByAdmin = await safe(
      () => query`SELECT admin_id, count(*)::int n FROM qc_scores
       WHERE is_fatal=true AND (case_at >= ${dateFrom}::date - interval '7 hours' AND case_at < ${dateTo}::date + interval '17 hours') GROUP BY admin_id`,
      [],
    );
    const fatalMapAdmin = Object.fromEntries(
      (fatalByAdmin || []).map((r) => [r.admin_id, r.n]),
    );

    // ---- marketing summary (customer_events ในช่วงวันที่) ----
    const mkt = await safe(
      () => query`SELECT
        count(*) FILTER (WHERE event_type='register')::int AS registration,
        count(*) FILTER (WHERE event_type='register' AND status='pass')::int AS registration_pass,
        count(*) FILTER (WHERE event_type='register' AND status='fail')::int AS registration_fail,
        count(*) FILTER (WHERE event_type='kyc' AND status='pass')::int AS kyc_pass,
        count(*) FILTER (WHERE event_type='kyc')::int AS kyc_total,
        coalesce(sum(amount) FILTER (WHERE event_type='deposit'),0)::numeric AS deposit_total,
        count(*) FILTER (WHERE event_type='deposit')::int AS deposit_count,
        coalesce(sum(amount) FILTER (WHERE event_type IN ('withdraw','withdrawal')),0)::numeric AS withdraw_total,
        count(*) FILTER (WHERE event_type IN ('withdraw','withdrawal'))::int AS withdraw_count,
        coalesce(sum(amount) FILTER (WHERE event_type='deposit' AND promotion_code IS NOT NULL),0)::numeric AS promo_deposit,
        count(DISTINCT line_user_id) FILTER (WHERE promotion_code IS NOT NULL)::int AS promo_participants
        FROM customer_events
        WHERE created_at >= ${dateFrom}::date - interval '7 hours' AND created_at < ${dateTo}::date + interval '17 hours'`,
      [{}],
    );
    const m0 = mkt[0] || {};
    const marketingSummary = {
      registration: m0.registration || 0,
      registration_pass: m0.registration_pass || 0,
      registration_fail: m0.registration_fail || 0,
      kyc_pass: m0.kyc_pass || 0,
      kyc_total: m0.kyc_total || 0,
      deposit_total: Number(m0.deposit_total || 0),
      deposit_count: m0.deposit_count || 0,
      withdraw_total: Number(m0.withdraw_total || 0),
      withdraw_count: m0.withdraw_count || 0,
      promotion_deposit: Number(m0.promo_deposit || 0),
      promotion_participants: m0.promo_participants || 0,
    };

    // ---- most improved: avg score 7 วันล่าสุด vs 7 วันก่อนหน้า (อิง dateTo) ----
    const improved = await safe(
      () => query`
      WITH cur AS (SELECT admin_id, avg(final_score) s FROM qc_scores
         WHERE (case_at >= (${dateTo}::date - 6) - interval '7 hours' AND case_at < ${dateTo}::date + interval '17 hours') GROUP BY admin_id),
       prev AS (SELECT admin_id, avg(final_score) s FROM qc_scores
         WHERE (case_at >= (${dateTo}::date - 13) - interval '7 hours' AND case_at < (${dateTo}::date - 6) - interval '7 hours') GROUP BY admin_id)
      SELECT a.member_name, round(cur.s)::int cur, round(prev.s)::int prev, round(cur.s - prev.s)::int delta
      FROM cur JOIN prev ON prev.admin_id = cur.admin_id JOIN qc_admins a ON a.id = cur.admin_id
      WHERE prev.s > 0 ORDER BY (cur.s - prev.s) DESC LIMIT 6`,
      [],
    );
    const mostImproved = (improved || []).map((r) => ({
      admin: r.member_name,
      current: r.cur,
      previous: r.prev,
      delta: r.delta,
      pct: r.prev ? Math.round((r.delta / r.prev) * 100) : 0,
    }));

    const MULT = (s) => (s >= 90 ? 1.2 : s >= 80 ? 1.0 : s >= 70 ? 0.5 : 0);
    const TIER = (s) =>
      s >= 90
        ? "Excellent"
        : s >= 80
          ? "Standard"
          : s >= 70
            ? "Warning"
            : "Critical";
    const RATE = 0.01;
    const commissionPerAdmin = (rankingAll || [])
      .filter((a) => a.cases > 0)
      .map((a) => {
        const mult = MULT(a.avg_score),
          upsell = Number(a.deposit_sum || 0);
        return {
          admin: a.member_name,
          admin_id: a.id,
          avg_score: a.avg_score,
          tier: TIER(a.avg_score),
          multiplier: mult,
          upsell_amount: upsell,
          fatal_penalty: fatalMapAdmin[a.id] || 0,
          dispute_adjustment: dispMapAdmin[a.id] || 0,
          estimated_commission: Math.round(upsell * RATE * mult),
        };
      });

    const estCommissionTotal = commissionPerAdmin.reduce(
      (s, a) => s + (a.estimated_commission || 0),
      0,
    );
    const kpiExt = {
      totalChats: cnt.total_msgs || 0,
      totalQcCases: cnt.qc_cases || 0,
      avgQaScore: kpiRows[0]?.avg_score || 0,
      qaCoveragePercent: cnt.admin_msgs
        ? Math.round(((cnt.qc_cases || 0) / cnt.admin_msgs) * 100)
        : 0,
      sopCoveragePercent: cov.total
        ? Math.round((cov.matched / cov.total) * 100)
        : 0,
      avgResponseSec: kpiRows[0]?.avg_response_sec || 0,
      slaPassPercent: slaExceptionSummary[0]?.sla_pass_pct ?? 0,
      fatalCount: (fatalCases || []).length,
      minorCount: minorCases[0]?.n || 0,
      pendingDisputes: dispMap.pending || 0,
      estimatedCommission: estCommissionTotal,
    };

    // ---- ความครบของข้อมูล (partial-data warning): วันไหนใน range ที่ scraper ยังไม่ done ----
    //   นับเฉพาะวันที่ "ควรมีข้อมูลแล้ว" (ถึงเมื่อวานตามเวลา Bangkok) และ range ไม่กว้างเกิน 92 วัน
    const scraperCoverage = await safe(async () => {
      const bkkYesterday = new Date(Date.now() + 7 * 3600000 - 86400000).toISOString().slice(0, 10);
      const covFrom = dateFrom < "2020-01-01" ? bkkYesterday : dateFrom; // default 2000-01-01 = ไม่ได้เลือกช่วง
      const covTo = dateTo > bkkYesterday ? bkkYesterday : dateTo;
      if (covFrom > covTo) return { checked: false, reason: "ช่วงที่เลือกยังไม่ถึงกำหนดเก็บข้อมูล (เก็บได้ถึงเมื่อวาน)" };
      const dayMs = 86400000;
      const nDays = Math.round((new Date(covTo) - new Date(covFrom)) / dayMs) + 1;
      if (nDays > 92) return { checked: false, reason: "ช่วงกว้างเกิน 92 วัน — ข้ามการตรวจความครบ" };
      const jobs = await query`SELECT date_from, date_to, status FROM scraper_jobs
        WHERE date_from <= ${covTo}::date AND date_to >= ${covFrom}::date`;
      // neon คืน DATE เป็น JS Date object ฝั่ง server — String() ตรง ๆ ได้ "Tue Jul 07..." เทียบไม่ได้
      const ds = (v) => (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10);
      const doneCover = (d) => jobs.some((j) => j.status === "done" && ds(j.date_from) <= d && ds(j.date_to) >= d);
      const missing = [];
      for (let i = 0; i < nDays; i++) {
        const d = new Date(new Date(covFrom).getTime() + i * dayMs).toISOString().slice(0, 10);
        if (!doneCover(d)) missing.push(d);
      }
      const active = jobs.some((j) => ["pending", "running", "blocked_auth"].includes(j.status));
      return {
        checked: true, from: covFrom, to: covTo, days: nDays,
        days_done: nDays - missing.length, days_missing: missing.length,
        missing_dates: missing.slice(0, 14), active_job: active,
        complete: missing.length === 0,
      };
    }, { checked: false, reason: "ตรวจไม่สำเร็จ" });

    // contract: kpi ต้อง zero-fill เสมอ (เดิม query พัง → {} ทุก field เป็น undefined ต่างจาก marketingSummary)
    const k0 = kpiRows[0] || {};
    const kpi = {
      customers: k0.customers || 0,
      registered_pass: k0.registered_pass || 0,
      registration_pass: k0.registered_pass || 0, // alias ให้ชื่อเดียวกับ marketingSummary.registration_pass
      kyc_pass: k0.kyc_pass || 0,
      deposit_total: Number(k0.deposit_total || 0),
      avg_response_sec: k0.avg_response_sec || 0,
      avg_score: k0.avg_score || 0,
    };

    return Response.json({
      kpi,
      scraperCoverage,
      kpiExt,
      ranking: rankingAll,
      weeklySummary,
      promos,
      pendingReply,
      replyLog,
      lastActivity: lastActivity[0] || {},
      // Phase 2
      categorySummary,
      intentDistribution,
      fatalCases,
      minorCases: minorCases[0]?.n || 0,
      sopCoverage: {
        total: cov.total,
        matched: cov.matched,
        unmatched: cov.total - cov.matched,
        percent: cov.total ? Math.round((cov.matched / cov.total) * 100) : 0,
        top_unmatched_intents: unmatchedIntents,
      },
      coachingSummary: {
        recent: coachingSummary,
        lowest_categories: [...(categorySummary || [])]
          .sort((a, b) => a.avg_score - b.avg_score)
          .slice(0, 3),
        repeated_fail_reasons: repeatedFails,
      },
      disputeSummary: {
        pending: dispMap.pending || 0,
        approved: dispMap.approved || 0,
        rejected: dispMap.rejected || 0,
      },
      commissionSummary: {
        tiers: commissionSummary[0] || {},
        per_admin: commissionPerAdmin,
      },
      adminCategoryRanking,
      slaExceptionSummary: slaExceptionSummary[0] || {},
      marketingSummary,
      mostImproved,
    });
  } catch (err) {
    console.error("Dashboard fatal:", err);
    return Response.json(
      { error: String(err.message || err) },
      { status: 500 },
    );
  }
}
