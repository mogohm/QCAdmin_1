export async function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return false;
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  });
  return res.ok;
}

// แจ้งเตือน QC ตามฟอร์แมตมาตรฐาน
export async function qcAlert({
  kind = "FAIL",
  admin,
  customer,
  score,
  intent,
  sop,
  failedCats = [],
  reason,
  suggestion,
  lineUserId,
  slaException,
}) {
  const base = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || "https://qc-admin-1.vercel.app";
  const link = lineUserId ? `${base}/customer/${lineUserId}` : "—";
  const lines = [
    `[QC ${kind}]`,
    `Admin: ${admin || "—"}`,
    `Customer: ${customer || "—"}`,
    `Score: ${score}${slaException ? " (SLA exception)" : ""}`,
    `Intent: ${intent || "—"}`,
    `Matched SOP: ${sop || "—"}`,
    `Failed categories: ${failedCats.length ? failedCats.join(", ") : "—"}`,
    `Reason: ${reason || "—"}`,
    suggestion ? `Suggested reply: ${String(suggestion).slice(0, 200)}` : null,
    `Chat: ${link}`,
  ].filter(Boolean);
  return sendTelegram(lines.join("\n"));
}
