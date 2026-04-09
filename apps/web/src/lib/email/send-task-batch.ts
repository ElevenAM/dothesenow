import { Resend } from "resend";

let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("RESEND_API_KEY not configured");
    _resend = new Resend(key);
  }
  return _resend;
}

const FROM_ADDRESS = "DoTheseNow <tasks@dothesenow.com>";

interface TaskSummary {
  id: string;
  title: string;
  priority: string;
  executor_type: string;
  description: string | null;
}

interface SendTaskBatchEmailParams {
  to: string;
  displayName: string;
  orgName: string;
  targetDate: string;
  tasks: TaskSummary[];
}

const PRIORITY_EMOJI: Record<string, string> = {
  urgent: "!!",
  high: "!",
  medium: "-",
  low: "~",
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function buildPlainText(params: SendTaskBatchEmailParams): string {
  const { displayName, orgName, targetDate, tasks } = params;
  const lines: string[] = [
    `Hi ${displayName},`,
    "",
    `${tasks.length} task${tasks.length === 1 ? " has" : "s have"} been generated for ${formatDate(targetDate)} at ${orgName}.`,
    "",
  ];

  for (const task of tasks) {
    const pri = PRIORITY_EMOJI[task.priority] ?? "-";
    lines.push(`[${pri}] ${task.title} (${task.executor_type})`);
    if (task.description) {
      lines.push(`    ${task.description.slice(0, 120)}`);
    }
  }

  lines.push("", "View your tasks: https://dothesenow.com", "");
  return lines.join("\n");
}

function buildHtml(params: SendTaskBatchEmailParams): string {
  const { displayName, orgName, targetDate, tasks } = params;

  const PRIORITY_COLORS: Record<string, string> = {
    urgent: "#d1242f",
    high: "#bc4c00",
    medium: "#9a6700",
    low: "#59636e",
  };

  const taskRows = tasks
    .map((t) => {
      const color = PRIORITY_COLORS[t.priority] ?? "#59636e";
      return `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #d1d9e0;">
          <span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;color:#fff;background:${color};text-transform:uppercase;">${t.priority}</span>
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid #d1d9e0;">
          <strong>${escapeHtml(t.title)}</strong>
          ${t.description ? `<br><span style="color:#59636e;font-size:13px;">${escapeHtml(t.description.slice(0, 120))}</span>` : ""}
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid #d1d9e0;color:#59636e;font-size:13px;">${t.executor_type}</td>
      </tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans',Helvetica,Arial,sans-serif;color:#1f2328;margin:0;padding:0;background:#f6f8fa;">
<div style="max-width:600px;margin:24px auto;background:#fff;border:1px solid #d1d9e0;border-radius:6px;overflow:hidden;">
  <div style="background:#1f2328;padding:20px 24px;">
    <h1 style="margin:0;color:#fff;font-size:18px;font-weight:600;">DoTheseNow</h1>
  </div>
  <div style="padding:24px;">
    <p>Hi ${escapeHtml(displayName)},</p>
    <p><strong>${tasks.length} task${tasks.length === 1 ? "" : "s"}</strong> ${tasks.length === 1 ? "has" : "have"} been generated for <strong>${formatDate(targetDate)}</strong> at ${escapeHtml(orgName)}.</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      <thead>
        <tr style="background:#f6f8fa;">
          <th style="padding:8px 12px;text-align:left;font-size:12px;color:#59636e;border-bottom:1px solid #d1d9e0;">Priority</th>
          <th style="padding:8px 12px;text-align:left;font-size:12px;color:#59636e;border-bottom:1px solid #d1d9e0;">Task</th>
          <th style="padding:8px 12px;text-align:left;font-size:12px;color:#59636e;border-bottom:1px solid #d1d9e0;">Executor</th>
        </tr>
      </thead>
      <tbody>${taskRows}</tbody>
    </table>
    <a href="https://dothesenow.com" style="display:inline-block;padding:8px 16px;background:#1f883d;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">View Tasks</a>
  </div>
  <div style="padding:16px 24px;background:#f6f8fa;border-top:1px solid #d1d9e0;font-size:12px;color:#59636e;">
    Sent by DoTheseNow &middot; <a href="https://dothesenow.com" style="color:#0969da;">dothesenow.com</a>
  </div>
</div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendTaskBatchEmail(
  params: SendTaskBatchEmailParams,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await getResend().emails.send({
      from: FROM_ADDRESS,
      to: params.to,
      subject: `${params.tasks.length} task${params.tasks.length === 1 ? "" : "s"} for ${formatDate(params.targetDate)} — ${params.orgName}`,
      text: buildPlainText(params),
      html: buildHtml(params),
    });

    if (error) {
      console.error(`[email:task-batch] Failed to send to ${params.to}:`, error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown_error";
    console.error(`[email:task-batch] Failed to send to ${params.to}:`, msg);
    return { success: false, error: msg };
  }
}
