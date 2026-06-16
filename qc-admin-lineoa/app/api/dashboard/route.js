import { query } from "@/lib/db";
import { requireView, unauthorized } from "@/lib/guard";

async function safe(fn, fb) {
  try {
    return await fn();
  } catch (e) {
    console.error("query:", e.message);
    return fb;
  }
}

export async function GET(req) {
  if (!requireView(req)) return unauthorized();
  const { searchParams } = new URL(req.url);
  const dateFrom = searchParams.get("from") || "2000-01-01";
  const dateTo = searchParams.get("to") || "2099-12-31";

  try {
    const [kpiRows, rankingAll, weeklySummary, promos, pendingReply, replyLog, lastActivity] = await Promise.all([
      // KPI — กรองตามวันที่
      safe(
        () => query`SELECT
        (SELECT count(DISTINCT m.line_user_id) FROM messages m
         WHERE m.created_at BETWEEN ${dateFrom}::date AND (${dateTo}::date + interval '1 day'))::int AS customers,
        (SELECT count(*) FROM customer_events
         WHERE event_type='register' AND status='pass'
           AND created_at BETWEEN ${dateFrom}::date AND (${dateTo}::date + interval '1 day'))::int AS registered_pass,
        (SELECT count(*) FROM customer_events
         WHERE event_type='kyc' AND status='pass'
           AND created_at BETWEEN ${dateFrom}::date AND (${dateTo}::date + interval '1 day'))::int AS kyc_pass,
        (SELECT coalesce(sum(amount),0) FROM customer_events
         WHERE event_type='deposit'
           AND created_at BETWEEN ${dateFrom}::date AND (${dateTo}::date + interval '1 day'))::numeric AS deposit_total,
        (SELECT coalesce(avg(q.response_seconds) FILTER (WHERE q.response_seconds > 0),0)::int
         FROM qc_scores q WHERE q.created_at BETWEEN ${dateFrom}::date AND (${dateTo}::date + interval '1 day')) AS avg_response_sec,
        (SELECT coalesce(avg(q.final_score),0)::int
         FROM qc_scores q WHERE q.created_at BETWEEN ${dateFrom}::date AND (${dateTo}::date + interval '1 day')) AS avg_score`,
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
             AND ce.created_at BETWEEN ${dateFrom}::date AND (${dateTo}::date + interval '1 day')
          ) AS reg_count,
          (SELECT coalesce(sum(ce.amount),0)::numeric FROM customer_events ce
           WHERE ce.metadata->>'admin_id' = a.id::text
             AND ce.event_type = 'deposit'
             AND ce.created_at BETWEEN ${dateFrom}::date AND (${dateTo}::date + interval '1 day')
          ) AS deposit_sum
        FROM qc_admins a
        LEFT JOIN (
          SELECT q.* FROM qc_scores q
          JOIN messages mq ON mq.id = q.admin_message_id
          WHERE mq.created_at BETWEEN ${dateFrom}::date AND (${dateTo}::date + interval '1 day')
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
          m.created_at::date                                                             AS day,
          count(q.id)::int                                                               AS total_cases,
          coalesce(avg(q.final_score),0)::int                                            AS avg_score,
          coalesce(avg(q.response_seconds) FILTER (WHERE q.response_seconds > 0),0)::int AS avg_response_sec,
          (count(q.id) FILTER (WHERE q.final_score >= 85))::int                          AS good,
          (count(q.id) FILTER (WHERE q.final_score < 70 AND q.final_score IS NOT NULL))::int AS bad,
          count(DISTINCT q.admin_id)::int                                                AS active_admins
        FROM qc_scores q
        JOIN messages m ON m.id = q.admin_message_id
        WHERE m.created_at BETWEEN ${dateFrom}::date AND (${dateTo}::date + interval '1 day')
        GROUP BY m.created_at::date
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
            AND created_at BETWEEN ${dateFrom}::date AND (${dateTo}::date + interval '1 day')
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
          AND m.created_at BETWEEN ${dateFrom}::date AND (${dateTo}::date + interval '1 day')
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
            AND q.created_at BETWEEN ${dateFrom}::date AND (${dateTo}::date + interval '1 day')
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
                       FROM qc_scores WHERE created_at BETWEEN ${dateFrom}::date AND (${dateTo}::date + interval '1 day') GROUP BY 1 ORDER BY n DESC`,
        [],
      ),
      safe(
        () => query`SELECT q.id, q.final_score, q.intent, q.fatal_reasons, q.created_at, a.member_name admin, q.line_user_id
                       FROM qc_scores q LEFT JOIN qc_admins a ON a.id=q.admin_id
                       WHERE q.is_fatal=true AND q.created_at BETWEEN ${dateFrom}::date AND (${dateTo}::date + interval '1 day')
                       ORDER BY q.created_at DESC LIMIT 20`,
        [],
      ),
      safe(
        () => query`SELECT count(*)::int n FROM qc_scores WHERE is_fatal=false AND final_score BETWEEN 50 AND 69
                       AND created_at BETWEEN ${dateFrom}::date AND (${dateTo}::date + interval '1 day')`,
        [{ n: 0 }],
      ),
      safe(
        () => query`SELECT count(*)::int total, sum(CASE WHEN matched_sop_id IS NOT NULL THEN 1 ELSE 0 END)::int matched
                       FROM qc_scores WHERE created_at BETWEEN ${dateFrom}::date AND (${dateTo}::date + interval '1 day')`,
        [{ total: 0, matched: 0 }],
      ),
      safe(
        () => query`SELECT q.id, q.final_score, q.intent, q.coaching, a.member_name admin, q.line_user_id, q.created_at
                       FROM qc_scores q LEFT JOIN qc_admins a ON a.id=q.admin_id
                       WHERE q.coaching IS NOT NULL AND q.created_at BETWEEN ${dateFrom}::date AND (${dateTo}::date + interval '1 day')
                       ORDER BY q.created_at DESC LIMIT 25`,
        [],
      ),
      safe(() => query`SELECT status, count(*)::int n FROM qc_disputes GROUP BY status`, []),
      safe(
        () => query`SELECT
                         sum(CASE WHEN final_score>=90 THEN 1 ELSE 0 END)::int tier1,
                         sum(CASE WHEN final_score BETWEEN 80 AND 89 THEN 1 ELSE 0 END)::int tier2,
                         sum(CASE WHEN final_score BETWEEN 70 AND 79 THEN 1 ELSE 0 END)::int tier3,
                         sum(CASE WHEN final_score<70 THEN 1 ELSE 0 END)::int tier4
                       FROM qc_scores WHERE created_at BETWEEN ${dateFrom}::date AND (${dateTo}::date + interval '1 day')`,
        [{}],
      ),
      safe(
        () => query`SELECT a.member_name admin, a.id admin_id,
                         round(avg((q.dimension_scores->>'greetingClosing')::numeric))::int greeting_closing,
                         round(avg((q.dimension_scores->>'problemSolving')::numeric))::int problem_solving,
                         round(avg((q.dimension_scores->>'communicationTone')::numeric))::int communication_tone,
                         round(avg((q.dimension_scores->>'responseTime')::numeric))::int response_time
                       FROM qc_scores q JOIN qc_admins a ON a.id=q.admin_id
                       WHERE q.dimension_scores IS NOT NULL AND q.created_at BETWEEN ${dateFrom}::date AND (${dateTo}::date + interval '1 day')
                       GROUP BY a.member_name, a.id HAVING count(*)>0 ORDER BY problem_solving DESC NULLS LAST LIMIT 30`,
        [],
      ),
      safe(
        () => query`SELECT
                         (SELECT count(*)::int FROM qc_scores WHERE sla_exception=true AND created_at BETWEEN ${dateFrom}::date AND (${dateTo}::date + interval '1 day')) AS sla_exception_count,
                         (SELECT count(*)::int FROM system_events WHERE is_active=true AND (ends_at IS NULL OR ends_at>=now())) AS active_events,
                         (SELECT round(100.0 * sum(CASE WHEN (dimension_scores->>'responseTime')::numeric >= 80 OR sla_exception THEN 1 ELSE 0 END) / NULLIF(count(*),0))::int
                          FROM qc_scores WHERE dimension_scores IS NOT NULL AND created_at BETWEEN ${dateFrom}::date AND (${dateTo}::date + interval '1 day')) AS sla_pass_pct`,
        [{}],
      ),
    ]);

    const cov = sopCoverage[0] || { total: 0, matched: 0 };
    const dispMap = Object.fromEntries((disputeSummary || []).map((r) => [r.status, r.n]));

    // เพิ่ม: fail reasons ซ้ำ + intent ที่ไม่ match SOP + commission ต่อ admin
    const [repeatedFails, unmatchedIntents] = await Promise.all([
      safe(
        () => query`SELECT category_code, fail_reason, count(*)::int n FROM qc_score_details d
                       JOIN qc_scores q ON q.id=d.qc_score_id
                       WHERE d.pass=false AND d.fail_reason IS NOT NULL AND d.category_code NOT IN ('minorError','fatalError')
                         AND q.created_at BETWEEN ${dateFrom}::date AND (${dateTo}::date + interval '1 day')
                       GROUP BY 1,2 ORDER BY n DESC LIMIT 10`,
        [],
      ),
      safe(
        () => query`SELECT COALESCE(intent,'general') intent, count(*)::int n FROM qc_scores
                       WHERE matched_sop_id IS NULL AND created_at BETWEEN ${dateFrom}::date AND (${dateTo}::date + interval '1 day')
                       GROUP BY 1 ORDER BY n DESC LIMIT 8`,
        [],
      ),
    ]);

    const counts = await safe(
      () => query`SELECT
        (SELECT count(*)::int FROM qc_scores WHERE created_at BETWEEN ${dateFrom}::date AND (${dateTo}::date + interval '1 day')) AS qc_cases,
        (SELECT count(*)::int FROM messages WHERE direction='admin' AND created_at BETWEEN ${dateFrom}::date AND (${dateTo}::date + interval '1 day')) AS admin_msgs,
        (SELECT count(*)::int FROM messages WHERE created_at BETWEEN ${dateFrom}::date AND (${dateTo}::date + interval '1 day')) AS total_msgs`,
      [{}],
    );
    const cnt = counts[0] || {};

    // commission ต่อ admin (tier multiplier ตาม Excel) — rate = 1% ของยอด upsell (deposit)
    const dispByAdmin = await safe(
      () => query`SELECT admin_id, count(*)::int n FROM qc_disputes
       WHERE status='approved' AND created_at BETWEEN ${dateFrom}::date AND (${dateTo}::date + interval '1 day') GROUP BY admin_id`,
      [],
    );
    const dispMapAdmin = Object.fromEntries((dispByAdmin || []).map((r) => [r.admin_id, r.n]));
    const fatalByAdmin = await safe(
      () => query`SELECT admin_id, count(*)::int n FROM qc_scores
       WHERE is_fatal=true AND created_at BETWEEN ${dateFrom}::date AND (${dateTo}::date + interval '1 day') GROUP BY admin_id`,
      [],
    );
    const fatalMapAdmin = Object.fromEntries((fatalByAdmin || []).map((r) => [r.admin_id, r.n]));

    const MULT = (s) => (s >= 90 ? 1.2 : s >= 80 ? 1.0 : s >= 70 ? 0.5 : 0);
    const TIER = (s) => (s >= 90 ? "Excellent" : s >= 80 ? "Standard" : s >= 70 ? "Warning" : "Critical");
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

    const estCommissionTotal = commissionPerAdmin.reduce((s, a) => s + (a.estimated_commission || 0), 0);
    const kpiExt = {
      totalChats: cnt.total_msgs || 0,
      totalQcCases: cnt.qc_cases || 0,
      avgQaScore: kpiRows[0]?.avg_score || 0,
      qaCoveragePercent: cnt.admin_msgs ? Math.round(((cnt.qc_cases || 0) / cnt.admin_msgs) * 100) : 0,
      sopCoveragePercent: cov.total ? Math.round((cov.matched / cov.total) * 100) : 0,
      avgResponseSec: kpiRows[0]?.avg_response_sec || 0,
      slaPassPercent: slaExceptionSummary[0]?.sla_pass_pct ?? 0,
      fatalCount: (fatalCases || []).length,
      minorCount: minorCases[0]?.n || 0,
      pendingDisputes: dispMap.pending || 0,
      estimatedCommission: estCommissionTotal,
    };

    return Response.json({
      kpi: kpiRows[0] || {},
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
        lowest_categories: [...(categorySummary || [])].sort((a, b) => a.avg_score - b.avg_score).slice(0, 3),
        repeated_fail_reasons: repeatedFails,
      },
      disputeSummary: {
        pending: dispMap.pending || 0,
        approved: dispMap.approved || 0,
        rejected: dispMap.rejected || 0,
      },
      commissionSummary: { tiers: commissionSummary[0] || {}, per_admin: commissionPerAdmin },
      adminCategoryRanking,
      slaExceptionSummary: slaExceptionSummary[0] || {},
    });
  } catch (err) {
    console.error("Dashboard fatal:", err);
    return Response.json({ error: String(err.message || err) }, { status: 500 });
  }
}
