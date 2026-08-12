import dotenv from 'dotenv';
dotenv.config();

const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://10.15.0.191/CustomerPulse').replace(/\/$/, '');
const TASKS_URL = FRONTEND_URL + '/staff-tasks';
const DASHBOARD_URL = FRONTEND_URL + '/dashboard';
const COMPANY_NAME = 'NeST Digital';
const CRM_NAME = 'CustomerPulse';

// ─────────────────────────────────────────────────────────────────────────────
// Shared HTML layout helpers
// ─────────────────────────────────────────────────────────────────────────────
const BASE_CSS = `<style>
  :root {
    color-scheme: light dark;
    supported-color-schemes: light dark;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f1f5f9; color: #1e293b; }
  .wrapper { max-width: 620px; margin: 32px auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.09); border: 1px solid #e2e8f0; }
  .header { background-color: #1a3a8f; padding: 24px 32px 20px; text-align: center; color: #ffffff !important; }
  .header-logo { display: inline-flex; align-items: center; justify-content: center; gap: 12px; margin-bottom: 12px; }
  .header-logo-icon { width: 42px; height: 42px; background: rgba(255,255,255,0.18); border-radius: 10px; display: flex; align-items: center; justify-content: center; }
  .header-logo-text { text-align: left; }
  .header-logo-name { font-size: 20px; font-weight: 800; color: #ffffff; letter-spacing: -0.3px; line-height: 1.1; }
  .header-logo-sub { font-size: 9px; font-weight: 800; letter-spacing: 2.5px; text-transform: uppercase; color: rgba(255,255,255,0.65); margin-top: 2px; }
  .header-divider { height: 1px; background: rgba(255,255,255,0.18); margin: 12px 0; }
  .header-icon { font-size: 32px; margin-bottom: 8px; }
  .header-title { font-size: 20px; font-weight: 800; color: #ffffff; letter-spacing: -0.3px; }
  .body { padding: 32px; }
  .greeting { font-size: 17px; font-weight: 700; color: #0f172a; margin-bottom: 6px; }
  .subtitle { font-size: 14px; color: #64748b; margin-bottom: 24px; line-height: 1.6; }
  .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px 24px; margin-bottom: 20px; }
  .card-title { font-size: 13px; font-weight: 800; color: #1a3a8f; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 14px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; }
  .row { display: flex; justify-content: space-between; gap: 16px; margin-bottom: 10px; }
  .field { flex: 1; }
  .field-label { font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 3px; }
  .field-value { font-size: 13px; font-weight: 700; color: #1e293b; }
  .badge { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; }
  .badge-high { background: #fee2e2; color: #dc2626; }
  .badge-medium { background: #fef3c7; color: #d97706; }
  .badge-low { background: #f1f5f9; color: #64748b; }
  .badge-completed { background: #dcfce7; color: #16a34a; }
  .badge-pending { background: #f1f5f9; color: #64748b; }
  .badge-overdue { background: #fee2e2; color: #dc2626; }
  .badge-cancelled { background: #fce7f3; color: #9d174d; }
  .note-box { background: #eff6ff; border-left: 4px solid #1a3a8f; border-radius: 0 8px 8px 0; padding: 12px 16px; margin-bottom: 20px; font-size: 13px; color: #1e3a5f; line-height: 1.6; }
  .btn-container { text-align: center; margin: 24px 0 8px; }
  .btn { display: inline-block; background: #1a3a8f; color: #ffffff !important; text-decoration: none; padding: 13px 28px; border-radius: 10px; font-size: 14px; font-weight: 800; letter-spacing: 0.3px; }
  .divider { height: 1px; background: #e2e8f0; margin: 24px 0; }
  .footer { background: #f8fafc; padding: 20px 32px; text-align: center; border-top: 1px solid #e2e8f0; }
  .footer-text { font-size: 11px; color: #94a3b8; line-height: 1.8; }
  .footer-brand { font-weight: 800; color: #1a3a8f; }
  .highlight-box { background: linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%); border: 1px solid #bfdbfe; border-radius: 12px; padding: 20px 24px; margin-bottom: 20px; text-align: center; }
  .big-text { font-size: 32px; margin-bottom: 6px; }
  .message-text { font-size: 15px; font-weight: 600; color: #1e293b; line-height: 1.7; }

  /* ─────────────────────────────────────────────────────────────
     Theme Responsive (Dark Mode / Light Mode) CSS for Outlook & Email Clients
     ───────────────────────────────────────────────────────────── */
  @media (prefers-color-scheme: dark) {
    body { background-color: #0f172a !important; color: #f8fafc !important; }
    .wrapper { background-color: #1e293b !important; border-color: #334155 !important; box-shadow: 0 4px 24px rgba(0,0,0,0.4) !important; }
    .greeting { color: #f8fafc !important; }
    .subtitle { color: #94a3b8 !important; }
    .card { background-color: #0f172a !important; border-color: #334155 !important; }
    .card-title { color: #60a5fa !important; border-bottom-color: #334155 !important; }
    .field-label { color: #64748b !important; }
    .field-value { color: #f8fafc !important; }
    .note-box { background-color: #1e3a5f !important; color: #93c5fd !important; border-left-color: #60a5fa !important; }
    .footer { background-color: #0f172a !important; border-top-color: #334155 !important; }
    .footer-text { color: #64748b !important; }
    .footer-brand { color: #60a5fa !important; }
    .badge-high { background-color: #7f1d1d !important; color: #fca5a5 !important; }
    .badge-medium { background-color: #78350f !important; color: #fcd34d !important; }
    .badge-low { background-color: #334155 !important; color: #cbd5e1 !important; }
    .badge-completed { background-color: #14532d !important; color: #86efac !important; }
    .badge-pending { background-color: #334155 !important; color: #cbd5e1 !important; }
    .badge-overdue { background-color: #7f1d1d !important; color: #fca5a5 !important; }
    .highlight-box { background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%) !important; border-color: #334155 !important; }
    .message-text { color: #f8fafc !important; }
  }

  /* Outlook Dark Mode Specific Selectors ([data-ogsc]) */
  [data-ogsc] body { background-color: #0f172a !important; color: #f8fafc !important; }
  [data-ogsc] .wrapper { background-color: #1e293b !important; border-color: #334155 !important; }
  [data-ogsc] .greeting { color: #f8fafc !important; }
  [data-ogsc] .subtitle { color: #94a3b8 !important; }
  [data-ogsc] .card { background-color: #0f172a !important; border-color: #334155 !important; }
  [data-ogsc] .card-title { color: #60a5fa !important; }
  [data-ogsc] .footer { background-color: #0f172a !important; }
</style>`;

function extractSolidColor(gradientOrColor) {
  if (!gradientOrColor) return '#1a3a8f';
  if (gradientOrColor.startsWith('#')) return gradientOrColor;
  const match = gradientOrColor.match(/#(?:[0-9a-fA-F]{3}){1,2}/);
  return match ? match[0] : '#1a3a8f';
}

function baseLayout(headerColor, headerTitle, headerIcon, bodyHtml) {
  const year = new Date().getFullYear();
  const solidColor = extractSolidColor(headerColor);
  return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">'
    + '<meta name="color-scheme" content="light dark">'
    + '<meta name="supported-color-schemes" content="light dark">'
    + '<title>' + headerTitle + ' - ' + CRM_NAME + '</title>' + BASE_CSS + '</head><body>'
    + '<div class="wrapper" style="max-width:620px; margin:32px auto; background-color:#ffffff; border-radius:16px; overflow:hidden; border:1px solid #e2e8f0; box-shadow:0 4px 24px rgba(0,0,0,0.09);">'
    + '<div class="header" style="background-color:' + solidColor + '; background:' + headerColor + '; padding:24px 32px 20px; text-align:center; color:#ffffff !important;">'
    + '<div class="header-logo" style="margin-bottom:14px; text-align:center;">'
    + '<div style="display:inline-block; text-align:left;">'
    + '<div class="header-logo-name" style="font-size:22px; font-weight:800; color:#ffffff !important; letter-spacing:-0.4px; line-height:1.1;">' + CRM_NAME + '</div>'
    + '<div class="header-logo-sub" style="font-size:9px; font-weight:800; letter-spacing:2.5px; text-transform:uppercase; color:rgba(255,255,255,0.7) !important; margin-top:3px; display:block;">RELATIONSHIPS, MEASURED</div>'
    + '</div>'
    + '</div>'
    + '<div class="header-divider" style="height:1px; background-color:rgba(255,255,255,0.2); margin:12px 0;"></div>'
    + '<div class="header-icon" style="font-size:32px; margin-bottom:6px; line-height:1;">' + headerIcon + '</div>'
    + '<div class="header-title" style="font-size:20px; font-weight:800; color:#ffffff !important; letter-spacing:-0.3px; margin:0;">' + headerTitle + '</div>'
    + '</div>'
    + '<div class="body" style="padding:32px; background-color:#ffffff;">' + bodyHtml + '</div>'
    + '<div class="footer" style="background-color:#f8fafc; padding:20px 32px; text-align:center; border-top:1px solid #e2e8f0;"><div class="footer-text" style="font-size:11px; color:#94a3b8; line-height:1.8;">'
    + 'This is an automated notification from <span class="footer-brand" style="font-weight:800; color:#1a3a8f;">' + CRM_NAME + '</span>.<br>'
    + '&copy; ' + year + ' ' + COMPANY_NAME + '. All rights reserved.<br>'
    + '<small>Do not reply to this email. Manage your preferences in the CustomerPulse.</small>'
    + '</div></div>'
    + '</div></body></html>';
}

function formatKolkataDateTime(input) {
  if (!input) return '—';
  const str = String(input).trim();

  // If already formatted as DD-MM-YYYY, return directly
  if (/^\d{2}-\d{2}-\d{4}$/.test(str)) {
    return str;
  }

  // If pure YYYY-MM-DD date string (no time component)
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [yyyy, mm, dd] = str.split('-');
    return `${dd}-${mm}-${yyyy}`;
  }

  const d = new Date(str);
  if (isNaN(d.getTime())) return str;

  try {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
    const parts = formatter.formatToParts(d);
    const map = {};
    parts.forEach(p => { map[p.type] = p.value; });
    const dd = String(map.day).padStart(2, '0');
    const mm = String(map.month).padStart(2, '0');
    const yyyy = map.year;
    const hh = String(map.hour).padStart(2, '0');
    const min = String(map.minute).padStart(2, '0');
    const ampm = (map.dayPeriod || (d.getHours() >= 12 ? 'pm' : 'am')).toLowerCase();

    // Include time component only if input specified time/timestamp
    if (str.includes('T') || str.includes(':') || str.includes(' ')) {
      return `${dd}-${mm}-${yyyy}, ${hh}:${min} ${ampm}`;
    }
    return `${dd}-${mm}-${yyyy}`;
  } catch (err) {
    return str;
  }
}

function priorityBadge(priority) {
  const p = String(priority || 'Medium').trim();
  const bg = p === 'High' || p === 'Critical' ? '#fee2e2' : p === 'Medium' ? '#fef3c7' : '#f1f5f9';
  const color = p === 'High' || p === 'Critical' ? '#dc2626' : p === 'Medium' ? '#d97706' : '#64748b';
  return '<span class="badge" style="display:inline-block; padding:3px 10px; border-radius:20px; font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:0.5px; background-color:' + bg + '; color:' + color + ' !important;">' + p + '</span>';
}

function formatStatusLabel(status) {
  if (!status) return '—';
  const s = String(status).trim().toLowerCase();
  if (s === 'accept' || s === 'accepted' || s === 'in progress') return 'Accepted';
  if (s === 'decline' || s === 'declined') return 'Declined';
  if (s === 'complete' || s === 'completed') return 'Completed';
  if (s === 'forward' || s === 'forwarded') return 'Forwarded';
  if (s === 'task assigned' || s === 'pending') return 'Task Assigned';
  if (s === 'overdue' || s === 'overdued') return 'Overdue';
  return status;
}

function statusBadge(status) {
  const formatted = formatStatusLabel(status);
  const s = formatted.toLowerCase();
  const bg = s === 'completed' ? '#dcfce7' : s === 'overdue' ? '#fee2e2' : (s === 'declined' || s === 'cancelled') ? '#fce7f3' : '#e0f2fe';
  const color = s === 'completed' ? '#16a34a' : s === 'overdue' ? '#dc2626' : (s === 'declined' || s === 'cancelled') ? '#9d174d' : '#0369a1';
  return '<span class="badge" style="display:inline-block; padding:3px 10px; border-radius:20px; font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:0.5px; background-color:' + bg + '; color:' + color + ' !important;">' + formatted + '</span>';
}

function btn(label, url) {
  return '<div class="btn-container" style="text-align:center; margin:24px 0 8px;"><a href="' + url + '" class="btn" style="display:inline-block; background-color:#1a3a8f; color:#ffffff !important; text-decoration:none; padding:13px 28px; border-radius:10px; font-size:14px; font-weight:800; letter-spacing:0.3px;">' + label + '</a></div>';
}

function row(label1, val1, label2, val2) {
  return '<div class="row" style="display:flex; justify-content:space-between; gap:16px; margin-bottom:10px;">'
    + '<div class="field" style="flex:1;"><div class="field-label" style="font-size:11px; font-weight:700; color:#94a3b8; text-transform:uppercase; letter-spacing:0.6px; margin-bottom:3px;">' + label1 + '</div><div class="field-value" style="font-size:13px; font-weight:700; color:#1e293b;">' + val1 + '</div></div>'
    + (label2 ? '<div class="field" style="flex:1;"><div class="field-label" style="font-size:11px; font-weight:700; color:#94a3b8; text-transform:uppercase; letter-spacing:0.6px; margin-bottom:3px;">' + label2 + '</div><div class="field-value" style="font-size:13px; font-weight:700; color:#1e293b;">' + val2 + '</div></div>' : '')
    + '</div>';
}

function noteBox(text) {
  return '<div class="note-box" style="background-color:#eff6ff; border-left:4px solid #1a3a8f; border-radius:0 8px 8px 0; padding:12px 16px; margin-bottom:20px; font-size:13px; color:#1e3a5f; line-height:1.6;">' + text + '</div>';
}

function highlightBox(emoji, message) {
  return '<div class="highlight-box"><div class="big-text">' + emoji + '</div><p class="message-text">' + message + '</p></div>';
}

// ─────────────────────────────────────────────────────────────────────────────
// Template registry
// ─────────────────────────────────────────────────────────────────────────────
const TEMPLATES = {

  // ── Task Notifications ───────────────────────────────────────────────────

  task_assigned: (v) => ({
    subject: '[Task Assigned] ' + (v.TaskTitle || 'New Task') + ' - ' + (v.CompanyName || 'Internal'),
    html: baseLayout(
      'linear-gradient(135deg, #1a3a8f 0%, #1e40af 100%)',
      'New Task Assigned', '&#x1F4CB;',
      '<p class="greeting">Hello ' + v.EmployeeName + ',</p>'
      + '<p class="subtitle">You have been assigned a new task in ' + CRM_NAME + '. Please review the details below and take action.</p>'
      + '<div class="card">'
      + '<div class="card-title">Task Details</div>'
      + row('Task Title', v.TaskTitle || '-', 'Priority', priorityBadge(v.Priority))
      + row('Account / Customer', v.CustomerName || v.CompanyName || 'Internal', 'Due Date', v.DueDate || 'No deadline set')
      + row('Assigned By', v.AssignedBy || 'System', 'Task Type', v.TaskType || 'Staff Task')
      + (v.TaskDescription ? '<div class="divider"></div><div class="field-label">Description</div><p style="font-size:13px;color:#475569;margin-top:6px;line-height:1.7">' + v.TaskDescription + '</p>' : '')
      + '</div>'
      + btn('View Task', TASKS_URL)
    )
  }),

  task_reassigned: (v) => ({
    subject: '[Task Reassigned] ' + v.TaskTitle + ' - Now assigned to you',
    html: baseLayout(
      'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
      'Task Reassigned to You', '&#x1F504;',
      '<p class="greeting">Hello ' + v.EmployeeName + ',</p>'
      + '<p class="subtitle">A task has been reassigned to you by <strong>' + v.AssignedBy + '</strong>. Please review and begin working on it.</p>'
      + '<div class="card">'
      + '<div class="card-title">Reassigned Task</div>'
      + row('Task', v.TaskTitle, 'Priority', priorityBadge(v.Priority))
      + row('Previously Assigned To', v.PreviousAssignee || '-', 'Due Date', v.DueDate || '-')
      + '</div>'
      + (v.ForwardReason ? noteBox('<strong>Reassignment Reason:</strong> ' + v.ForwardReason) : '')
      + btn('Open Task', TASKS_URL)
    )
  }),

  task_updated: (v) => ({
    subject: '[Task Updated] ' + v.TaskTitle + ' - Changes made',
    html: baseLayout(
      'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
      'Task Has Been Updated', '&#x270F;&#xFE0F;',
      '<p class="greeting">Hello ' + v.EmployeeName + ',</p>'
      + '<p class="subtitle">The task <strong>' + v.TaskTitle + '</strong> has been updated by <strong>' + (v.UpdatedBy || 'a team member') + '</strong>.</p>'
      + '<div class="card">'
      + '<div class="card-title">Updated Task</div>'
      + row('Task', v.TaskTitle, 'Priority', priorityBadge(v.Priority))
      + row('Status', statusBadge(v.Status), 'Due Date', v.DueDate || '-')
      + '</div>'
      + (v.UpdateNote ? noteBox('<strong>Update Note:</strong> ' + v.UpdateNote) : '')
      + btn('View Task', TASKS_URL)
    )
  }),

  // ── Staff Tasks ────────────────────────────────────────────────────────
  staff_task_assigned: (v) => ({
    subject: '[Staff Task Assigned] ' + (v.TaskTitle || 'New Task') + ' - ' + (v.CompanyName || 'Internal'),
    html: baseLayout(
      'linear-gradient(135deg, #1a3a8f 0%, #1e40af 100%)',
      'Staff Task Assigned', '&#x1F4CB;',
      '<p class="greeting">Hello ' + (v.EmployeeName || 'Team Member') + ',</p>'
      + '<p class="subtitle">You have been assigned a new staff task in ' + CRM_NAME + '. Please review the details below.</p>'
      + '<div class="card">'
      + '<div class="card-title">Staff Task Details</div>'
      + row('Task Title', v.TaskTitle || '-', 'Priority', priorityBadge(v.Priority))
      + row('Assigned By', v.AssignedBy || 'System', 'Due Date', v.DueDate || 'No deadline set')
      + (v.TaskDescription ? '<div class="divider"></div><div class="field-label">Description</div><p style="font-size:13px;color:#475569;margin-top:6px;line-height:1.7">' + v.TaskDescription + '</p>' : '')
      + '</div>'
      + (v.Note || v.StatusNote ? noteBox(v.Note || v.StatusNote) : '')
      + btn('View Staff Task', TASKS_URL)
    )
  }),

  staff_task_accepted: (v) => ({
    subject: '[Staff Task Accepted] ' + v.TaskTitle,
    html: baseLayout(
      'linear-gradient(135deg, #059669 0%, #10b981 100%)',
      'Staff Task Accepted', '&#x2705;',
      '<p class="greeting">Hello ' + (v.EmployeeName || 'Team Member') + ',</p>'
      + '<p class="subtitle">The staff task <strong>' + v.TaskTitle + '</strong> has been accepted by <strong>' + (v.UpdatedBy || 'Assignee') + '</strong>.</p>'
      + '<div class="card">'
      + '<div class="card-title">Task Acceptance Details</div>'
      + row('Task Title', v.TaskTitle, 'Status', statusBadge('Accepted'))
      + row('Accepted By', v.UpdatedBy || '-', 'Priority', priorityBadge(v.Priority))
      + '</div>'
      + (v.Note || v.StatusNote ? noteBox(v.Note || v.StatusNote) : '')
      + btn('View Staff Task', TASKS_URL)
    )
  }),

  staff_task_forwarded: (v) => ({
    subject: '[Staff Task Forwarded] ' + v.TaskTitle + ' - Reassigned to you',
    html: baseLayout(
      'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
      'Staff Task Forwarded', '&#x1F504;',
      '<p class="greeting">Hello ' + (v.EmployeeName || 'Team Member') + ',</p>'
      + '<p class="subtitle">The staff task <strong>' + v.TaskTitle + '</strong> has been forwarded to you by <strong>' + (v.UpdatedBy || v.AssignedBy) + '</strong>.</p>'
      + '<div class="card">'
      + '<div class="card-title">Forwarded Task Details</div>'
      + row('Task Title', v.TaskTitle, 'Status', statusBadge('Forwarded'))
      + row('Forwarded By', v.UpdatedBy || v.AssignedBy || '-', 'Priority', priorityBadge(v.Priority))
      + '</div>'
      + (v.Note || v.StatusNote || v.ForwardReason ? noteBox(v.Note || v.StatusNote || v.ForwardReason) : '')
      + btn('Open Staff Task', TASKS_URL)
    )
  }),

  staff_task_declined: (v) => ({
    subject: '[Staff Task Declined] ' + v.TaskTitle,
    html: baseLayout(
      'linear-gradient(135deg, #9f1239 0%, #be123c 100%)',
      'Staff Task Declined', '&#x274C;',
      '<p class="greeting">Hello ' + (v.EmployeeName || 'Team Member') + ',</p>'
      + '<p class="subtitle">The staff task <strong>' + v.TaskTitle + '</strong> has been declined by <strong>' + (v.UpdatedBy || 'Assignee') + '</strong>.</p>'
      + '<div class="card">'
      + '<div class="card-title">Task Decline Summary</div>'
      + row('Task Title', v.TaskTitle, 'Status', statusBadge('Declined'))
      + row('Declined By', v.UpdatedBy || '-', 'Priority', priorityBadge(v.Priority))
      + '</div>'
      + (v.Note || v.StatusNote || v.CompletionNote ? noteBox('<strong>Decline Reason:</strong> ' + (v.Note || v.StatusNote || v.CompletionNote)) : '')
      + btn('View Staff Task', TASKS_URL)
    )
  }),

  staff_task_completed: (v) => ({
    subject: '[Staff Task Completed] ' + v.TaskTitle,
    html: baseLayout(
      'linear-gradient(135deg, #15803d 0%, #16a34a 100%)',
      'Staff Task Completed', '&#x2705;',
      '<p class="greeting">Hello ' + (v.EmployeeName || 'Team Member') + ',</p>'
      + '<p class="subtitle">Great news! The staff task <strong>' + v.TaskTitle + '</strong> has been marked as completed.</p>'
      + '<div class="card">'
      + '<div class="card-title">Completion Details</div>'
      + row('Task Title', v.TaskTitle, 'Completed By', v.CompletedBy || v.UpdatedBy || '-')
      + row('Completion Date', v.CompletionDate || new Date().toLocaleDateString(), 'Status', statusBadge('Completed'))
      + '</div>'
      + (v.Note || v.StatusNote || v.CompletionNote ? noteBox('<strong>Completion Note:</strong> ' + (v.Note || v.StatusNote || v.CompletionNote)) : '')
      + btn('View Staff Task', TASKS_URL)
    )
  }),

  staff_task_overdue: (v) => ({
    subject: '[OVERDUE Staff Task] ' + v.TaskTitle + ' - Action Required',
    html: baseLayout(
      'linear-gradient(135deg, #92400e 0%, #b45309 100%)',
      'Staff Task Overdue', '&#x26A0;&#xFE0F;',
      '<p class="greeting">Hello ' + (v.EmployeeName || 'Team Member') + ',</p>'
      + '<p class="subtitle">The staff task <strong>' + v.TaskTitle + '</strong> is overdue and requires immediate attention.</p>'
      + '<div class="card">'
      + '<div class="card-title">Overdue Task Summary</div>'
      + row('Task Title', v.TaskTitle, 'Priority', priorityBadge(v.Priority))
      + row('Due Date', '<span style="color:#dc2626;font-weight:800">' + (v.DueDate || '-') + '</span>', 'Status', statusBadge('Overdue'))
      + '</div>'
      + (v.Note || v.StatusNote ? noteBox(v.Note || v.StatusNote) : noteBox('Please complete or update this staff task immediately.'))
      + btn('Take Action Now', TASKS_URL)
    )
  }),

  staff_task_comment: (v) => ({
    subject: '[Staff Task Comment] ' + (v.AuthorName || v.UpdatedBy || 'Team Member') + ' commented on "' + v.TaskTitle + '"',
    html: baseLayout(
      'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
      'New Comment on Staff Task', '&#x1F4AC;',
      '<p class="greeting">Hello ' + (v.EmployeeName || 'Team Member') + ',</p>'
      + '<p class="subtitle">A new comment was added to the staff task <strong>' + v.TaskTitle + '</strong>.</p>'
      + '<div class="card">'
      + '<div class="card-title">Comment</div>'
      + '<p class="message-text" style="font-style:italic">&ldquo;' + (v.CommentText || v.Note || v.Comments || '-') + '&rdquo;</p>'
      + '<div class="divider"></div>'
      + row('Task Title', v.TaskTitle, 'Commented By', v.AuthorName || v.UpdatedBy || 'Team Member')
      + '</div>'
      + btn('Reply on Task', TASKS_URL)
    )
  }),

  // ── Associated Tasks & Interaction Logs ─────────────────────────────────
  interaction_log_entered: (v) => ({
    subject: '[Interaction Logged] ' + (v.CompanyName || 'Customer Account') + ' - ' + (v.InteractionType || 'Interaction'),
    html: baseLayout(
      'linear-gradient(135deg, #0f766e 0%, #0d9488 100%)',
      'Interaction Log Entered', '&#x1F4DD;',
      '<p class="greeting">Hello ' + (v.EmployeeName || 'Team Member') + ',</p>'
      + '<p class="subtitle">A new interaction log has been entered for <strong>' + (v.CompanyName || 'Customer Account') + '</strong>.</p>'
      + '<div class="card">'
      + '<div class="card-title">Interaction Details</div>'
      + row('Account', v.CompanyName || '-', 'Channel', v.InteractionType || 'Meeting')
      + row('Logged By', v.LoggedBy || v.AuthorName || 'Team Member', 'Logged Date', v.Date || new Date().toLocaleDateString())
      + (v.Summary || v.Description ? '<div class="divider"></div><div class="field-label">Summary</div><p style="font-size:13px;color:#475569;margin-top:6px;line-height:1.7">' + (v.Summary || v.Description) + '</p>' : '')
      + '</div>'
      + (v.Note || v.StatusNote ? noteBox(v.Note || v.StatusNote) : '')
      + btn('View Interaction Log', FRONTEND_URL + '/interaction-log')
    )
  }),

  associated_task_assigned: (v) => ({
    subject: '[Associated Task Assigned] ' + (v.TaskTitle || 'Associated Action') + ' - ' + (v.CompanyName || 'Account'),
    html: baseLayout(
      'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
      'Associated Task Assigned', '&#x1F517;',
      '<p class="greeting">Hello ' + (v.EmployeeName || 'Team Member') + ',</p>'
      + '<p class="subtitle">You have been assigned an associated task linked to interaction log for <strong>' + (v.CompanyName || 'Account') + '</strong>.</p>'
      + '<div class="card">'
      + '<div class="card-title">Associated Task Details</div>'
      + row('Task Title', v.TaskTitle || '-', 'Account', v.CompanyName || 'External Account')
      + row('Assigned By', v.AssignedBy || 'System', 'Priority', priorityBadge(v.Priority))
      + row('Due Date', v.DueDate || 'No deadline set', 'Status', statusBadge('Task Assigned'))
      + '</div>'
      + (v.Note || v.StatusNote ? noteBox(v.Note || v.StatusNote) : '')
      + btn('View Associated Task', FRONTEND_URL + '/interaction-log')
    )
  }),

  associated_task_accepted: (v) => ({
    subject: '[Associated Task Accepted] ' + v.TaskTitle + ' - ' + (v.CompanyName || 'Account'),
    html: baseLayout(
      'linear-gradient(135deg, #059669 0%, #10b981 100%)',
      'Associated Task Accepted', '&#x2705;',
      '<p class="greeting">Hello ' + (v.EmployeeName || 'Team Member') + ',</p>'
      + '<p class="subtitle">The associated task <strong>' + v.TaskTitle + '</strong> for <strong>' + (v.CompanyName || 'Account') + '</strong> has been accepted.</p>'
      + '<div class="card">'
      + '<div class="card-title">Task Details</div>'
      + row('Task Title', v.TaskTitle, 'Account', v.CompanyName || '-')
      + row('Accepted By', v.UpdatedBy || '-', 'Status', statusBadge('Accepted'))
      + '</div>'
      + (v.Note || v.StatusNote ? noteBox(v.Note || v.StatusNote) : '')
      + btn('View Interaction Log', FRONTEND_URL + '/interaction-log')
    )
  }),

  associated_task_forwarded: (v) => ({
    subject: '[Associated Task Forwarded] ' + v.TaskTitle + ' - ' + (v.CompanyName || 'Account'),
    html: baseLayout(
      'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
      'Associated Task Forwarded', '&#x1F504;',
      '<p class="greeting">Hello ' + (v.EmployeeName || 'Team Member') + ',</p>'
      + '<p class="subtitle">The associated task <strong>' + v.TaskTitle + '</strong> for <strong>' + (v.CompanyName || 'Account') + '</strong> has been forwarded to you.</p>'
      + '<div class="card">'
      + '<div class="card-title">Forwarded Details</div>'
      + row('Task Title', v.TaskTitle, 'Account', v.CompanyName || '-')
      + row('Forwarded By', v.UpdatedBy || '-', 'Status', statusBadge('Forwarded'))
      + '</div>'
      + (v.Note || v.StatusNote || v.ForwardReason ? noteBox(v.Note || v.StatusNote || v.ForwardReason) : '')
      + btn('View Interaction Log', FRONTEND_URL + '/interaction-log')
    )
  }),

  associated_task_declined: (v) => ({
    subject: '[Associated Task Declined] ' + v.TaskTitle + ' - ' + (v.CompanyName || 'Account'),
    html: baseLayout(
      'linear-gradient(135deg, #9f1239 0%, #be123c 100%)',
      'Associated Task Declined', '&#x274C;',
      '<p class="greeting">Hello ' + (v.EmployeeName || 'Team Member') + ',</p>'
      + '<p class="subtitle">The associated task <strong>' + v.TaskTitle + '</strong> for <strong>' + (v.CompanyName || 'Account') + '</strong> has been declined.</p>'
      + '<div class="card">'
      + '<div class="card-title">Decline Summary</div>'
      + row('Task Title', v.TaskTitle, 'Account', v.CompanyName || '-')
      + row('Declined By', v.UpdatedBy || '-', 'Status', statusBadge('Declined'))
      + '</div>'
      + (v.Note || v.StatusNote || v.CompletionNote ? noteBox('<strong>Decline Reason:</strong> ' + (v.Note || v.StatusNote || v.CompletionNote)) : '')
      + btn('View Interaction Log', FRONTEND_URL + '/interaction-log')
    )
  }),

  associated_task_completed: (v) => ({
    subject: '[Associated Task Completed] ' + v.TaskTitle + ' - ' + (v.CompanyName || 'Account'),
    html: baseLayout(
      'linear-gradient(135deg, #15803d 0%, #16a34a 100%)',
      'Associated Task Completed', '&#x2705;',
      '<p class="greeting">Hello ' + (v.EmployeeName || 'Team Member') + ',</p>'
      + '<p class="subtitle">Great news! The associated task <strong>' + v.TaskTitle + '</strong> for <strong>' + (v.CompanyName || 'Account') + '</strong> has been completed.</p>'
      + '<div class="card">'
      + '<div class="card-title">Completion Details</div>'
      + row('Task Title', v.TaskTitle, 'Account', v.CompanyName || '-')
      + row('Completed By', v.CompletedBy || v.UpdatedBy || '-', 'Status', statusBadge('Completed'))
      + '</div>'
      + (v.Note || v.StatusNote || v.CompletionNote ? noteBox('<strong>Completion Note:</strong> ' + (v.Note || v.StatusNote || v.CompletionNote)) : '')
      + btn('View Interaction Log', FRONTEND_URL + '/interaction-log')
    )
  }),

  associated_task_overdue: (v) => ({
    subject: '[OVERDUE Associated Task] ' + v.TaskTitle + ' - ' + (v.CompanyName || 'Account'),
    html: baseLayout(
      'linear-gradient(135deg, #92400e 0%, #b45309 100%)',
      'Associated Task Overdue', '&#x26A0;&#xFE0F;',
      '<p class="greeting">Hello ' + (v.EmployeeName || 'Team Member') + ',</p>'
      + '<p class="subtitle">An associated task linked to <strong>' + (v.CompanyName || 'Account') + '</strong> is overdue.</p>'
      + '<div class="card">'
      + '<div class="card-title">Overdue Details</div>'
      + row('Task Title', v.TaskTitle, 'Account', v.CompanyName || '-')
      + row('Due Date', '<span style="color:#dc2626;font-weight:800">' + (v.DueDate || '-') + '</span>', 'Status', statusBadge('Overdue'))
      + '</div>'
      + (v.Note || v.StatusNote ? noteBox(v.Note || v.StatusNote) : noteBox('Please complete or update this associated task immediately.'))
      + btn('View Interaction Log', FRONTEND_URL + '/interaction-log')
    )
  }),

  associated_task_comment: (v) => ({
    subject: '[Associated Task Comment] ' + (v.AuthorName || v.UpdatedBy || 'Team Member') + ' commented on "' + v.TaskTitle + '"',
    html: baseLayout(
      'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
      'New Comment on Associated Task', '&#x1F4AC;',
      '<p class="greeting">Hello ' + (v.EmployeeName || 'Team Member') + ',</p>'
      + '<p class="subtitle">A comment was added to the associated task <strong>' + v.TaskTitle + '</strong> for <strong>' + (v.CompanyName || 'Account') + '</strong>.</p>'
      + '<div class="card">'
      + '<div class="card-title">Comment</div>'
      + '<p class="message-text" style="font-style:italic">&ldquo;' + (v.CommentText || v.Note || v.Comments || '-') + '&rdquo;</p>'
      + '<div class="divider"></div>'
      + row('Task Title', v.TaskTitle, 'Account', v.CompanyName || '-')
      + '</div>'
      + btn('View Interaction Log', FRONTEND_URL + '/interaction-log')
    )
  }),

  // ── Account Assignment ───────────────────────────────────────────────────
  account_assignment_changed: (v) => ({
    subject: '[Account Assignment Changed] ' + (v.CompanyName || 'Account Portfolio'),
    html: baseLayout(
      'linear-gradient(135deg, #0891b2 0%, #0e7490 100%)',
      'Account Owner Changed', '&#x1F3E2;',
      '<p class="greeting">Hello ' + (v.EmployeeName || 'Team Member') + ',</p>'
      + '<p class="subtitle">The owner assignment for account <strong>' + (v.CompanyName || 'Account') + '</strong> has been updated.</p>'
      + '<div class="card">'
      + '<div class="card-title">Account Details</div>'
      + row('Account Name', v.CompanyName || '-', 'New Owner', v.NewOwnerName || v.OwnerName || '-')
      + row('Previous Owner', v.PreviousOwnerName || '-', 'Updated By', v.UpdatedBy || 'System')
      + '</div>'
      + (v.Note || v.StatusNote ? noteBox(v.Note || v.StatusNote) : '')
      + btn('View Account', FRONTEND_URL + '/accounts')
    )
  }),

  status_changed: (v) => {
    const formattedStatus = formatStatusLabel(v.Status);
    const formattedPrevStatus = formatStatusLabel(v.PreviousStatus);
    return {
      subject: '[Status Update] ' + v.TaskTitle + ' - ' + formattedStatus,
      html: baseLayout(
        'linear-gradient(135deg, #0f766e 0%, #0d9488 100%)',
        'Task Status Changed', '&#x1F503;',
        '<p class="greeting">Hello ' + v.EmployeeName + ',</p>'
        + '<p class="subtitle">The status of task <strong>' + v.TaskTitle + '</strong> has been changed to <strong>' + formattedStatus + '</strong> by <strong>' + (v.UpdatedBy || 'a team member') + '</strong>.</p>'
        + '<div class="card">'
        + '<div class="card-title">Status Update</div>'
        + row('Task', v.TaskTitle, 'Account', v.CompanyName || 'Internal')
        + row('Previous Status', statusBadge(formattedPrevStatus), 'New Status', statusBadge(formattedStatus))
        + '</div>'
        + (v.StatusNote ? noteBox(v.StatusNote) : '')
        + btn('View Task', TASKS_URL)
      )
    };
  },

  task_completed: (v) => ({
    subject: '[Task Completed] ' + v.TaskTitle,
    html: baseLayout(
      'linear-gradient(135deg, #15803d 0%, #16a34a 100%)',
      'Task Completed', '&#x2705;',
      '<p class="greeting">Hello ' + v.EmployeeName + ',</p>'
      + '<p class="subtitle">Great news! The task <strong>' + v.TaskTitle + '</strong> has been marked as completed.</p>'
      + '<div class="card">'
      + '<div class="card-title">Completion Summary</div>'
      + row('Task', v.TaskTitle, 'Completed By', v.CompletedBy || '-')
      + row('Account', v.CompanyName || 'Internal', 'Completion Date', v.CompletionDate || new Date().toLocaleDateString())
      + '</div>'
      + (v.CompletionNote ? noteBox('<strong>Completion Note:</strong> ' + v.CompletionNote) : '')
      + btn('View Task', TASKS_URL)
    )
  }),

  task_cancelled: (v) => ({
    subject: '[Task Cancelled] ' + v.TaskTitle,
    html: baseLayout(
      'linear-gradient(135deg, #9f1239 0%, #be123c 100%)',
      'Task Cancelled', '&#x274C;',
      '<p class="greeting">Hello ' + v.EmployeeName + ',</p>'
      + '<p class="subtitle">The task <strong>' + v.TaskTitle + '</strong> has been cancelled.</p>'
      + '<div class="card">'
      + '<div class="card-title">Cancelled Task</div>'
      + row('Task', v.TaskTitle, 'Cancelled By', v.CancelledBy || '-')
      + '</div>'
      + (v.CancelReason ? noteBox('<strong>Reason:</strong> ' + v.CancelReason) : '')
      + btn('Go to Tasks', TASKS_URL)
    )
  }),

  task_overdue: (v) => ({
    subject: '[OVERDUE] ' + v.TaskTitle + ' - Action Required',
    html: baseLayout(
      'linear-gradient(135deg, #92400e 0%, #b45309 100%)',
      'Task is Overdue', '&#x26A0;&#xFE0F;',
      '<p class="greeting">Hello ' + v.EmployeeName + ',</p>'
      + '<p class="subtitle">The following task has passed its due date and requires immediate attention.</p>'
      + '<div class="card">'
      + '<div class="card-title">Overdue Task</div>'
      + row('Task', v.TaskTitle, 'Priority', priorityBadge(v.Priority))
      + row('Due Date', '<span style="color:#dc2626;font-weight:800">' + v.DueDate + '</span>', 'Days Overdue', '<span style="color:#dc2626;font-weight:800">' + (v.DaysOverdue || '?') + ' day(s)</span>')
      + '</div>'
      + noteBox('Please complete or update this task immediately to avoid escalation.')
      + btn('Take Action Now', TASKS_URL)
    )
  }),

  task_reminder: (v) => ({
    subject: '[Reminder] ' + v.TaskTitle + ' due ' + v.DueDate,
    html: baseLayout(
      'linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)',
      'Task Reminder', '&#x23F0;',
      '<p class="greeting">Hello ' + v.EmployeeName + ',</p>'
      + '<p class="subtitle">This is a friendly reminder about an upcoming task deadline.</p>'
      + '<div class="card">'
      + '<div class="card-title">Upcoming Task</div>'
      + row('Task', v.TaskTitle, 'Priority', priorityBadge(v.Priority))
      + row('Due Date', v.DueDate, 'Reminder', v.ReminderLabel || '1 day before')
      + '</div>'
      + (v.TaskDescription ? noteBox(v.TaskDescription) : '')
      + btn('View Task', TASKS_URL)
    )
  }),

  task_comment: (v) => ({
    subject: '[New Comment] ' + v.AuthorName + ' replied on "' + v.TaskTitle + '"',
    html: baseLayout(
      'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
      'New Comment on Task', '&#x1F4AC;',
      '<p class="greeting">Hello ' + v.EmployeeName + ',</p>'
      + '<p class="subtitle"><strong>' + v.AuthorName + '</strong> added a new comment on the task <strong>' + v.TaskTitle + '</strong>.</p>'
      + '<div class="card">'
      + '<div class="card-title">Comment</div>'
      + '<p class="message-text" style="font-style:italic">&ldquo;' + v.CommentText + '&rdquo;</p>'
      + '<div class="divider"></div>'
      + row('Task', v.TaskTitle, 'Commented By', v.AuthorName)
      + '</div>'
      + btn('Reply ', TASKS_URL)
    )
  }),

  task_attachment: (v) => ({
    subject: '[Attachment] ' + v.AuthorName + ' attached a file on "' + v.TaskTitle + '"',
    html: baseLayout(
      'linear-gradient(135deg, #0369a1 0%, #0284c7 100%)',
      'Attachment Added to Task', '&#x1F4CE;',
      '<p class="greeting">Hello ' + v.EmployeeName + ',</p>'
      + '<p class="subtitle"><strong>' + v.AuthorName + '</strong> added an attachment to task <strong>' + v.TaskTitle + '</strong>.</p>'
      + '<div class="card">'
      + '<div class="card-title">Attachment Details</div>'
      + row('File', v.FileName || 'Attachment', 'Uploaded By', v.AuthorName)
      + row('Task', v.TaskTitle, '', '')
      + '</div>'
      + btn('View', TASKS_URL)
    )
  }),

  // ── Greeting Templates ───────────────────────────────────────────────────

  birthday: (v) => ({
    subject: 'Happy Birthday, ' + v.EmployeeName + '! Warm wishes from ' + COMPANY_NAME,
    html: baseLayout(
      'linear-gradient(135deg, #db2777 0%, #ec4899 100%)',
      'Happy Birthday!', '&#x1F382;',
      highlightBox('&#x1F389;&#x1F382;&#x1F389;', 'Wishing you a very Happy Birthday, <strong>' + v.EmployeeName + '</strong>!')
      + '<p class="subtitle">On behalf of the entire <strong>' + COMPANY_NAME + '</strong> family, we wish you a wonderful birthday filled with joy, happiness, and everything you deserve.</p>'
      + '<div class="card"><p style="font-size:15px;color:#475569;line-height:1.8;text-align:center">Your talent, dedication, and contributions make our team stronger every day.<br>May this special day bring you as much happiness as you bring to those around you.</p></div>'
      + '<p style="text-align:center;font-size:13px;color:#64748b;margin-top:16px">With warm regards,<br><strong>' + COMPANY_NAME + ' Team</strong></p>'
    )
  }),

  work_anniversary: (v) => ({
    subject: v.Years + ' Year' + (v.Years > 1 ? 's' : '') + ' Work Anniversary, ' + v.EmployeeName + '! - ' + COMPANY_NAME,
    html: baseLayout(
      'linear-gradient(135deg, #d97706 0%, #f59e0b 100%)',
      'Work Anniversary', '&#x1F3C6;',
      highlightBox('&#x1F31F;', 'Congratulations on <strong>' + v.Years + ' Year' + (v.Years > 1 ? 's' : '') + '</strong> with ' + COMPANY_NAME + '!')
      + '<p class="subtitle">Thank you, <strong>' + v.EmployeeName + '</strong>, for your continued dedication and valuable contributions to our organization.</p>'
      + '<div class="card"><p style="font-size:15px;color:#475569;line-height:1.8;text-align:center">Your ' + v.Years + ' year' + (v.Years > 1 ? 's' : '') + ' of service reflect your commitment to excellence and growth.<br>We are proud to have you as part of the ' + COMPANY_NAME + ' family!</p></div>'
      + '<p style="text-align:center;font-size:13px;color:#64748b;margin-top:16px">With sincere appreciation,<br><strong>' + COMPANY_NAME + ' Leadership Team</strong></p>'
    )
  }),

  festival: (v) => ({
    subject: (v.FestivalEmoji || '') + ' ' + v.FestivalName + ' Greetings from ' + COMPANY_NAME + '!',
    html: baseLayout(
      'linear-gradient(135deg, #7c3aed 0%, #8b5cf6 100%)',
      v.FestivalName + ' Greetings', v.FestivalEmoji || '&#x1F38A;',
      highlightBox(v.FestivalEmoji || '&#x1F38A;', 'Happy ' + v.FestivalName + ', <strong>' + v.EmployeeName + '</strong>!')
      + '<p class="subtitle">' + (v.FestivalMessage || 'Wishing you and your family a joyful and memorable ' + v.FestivalName + ' celebration.') + '</p>'
      + '<div class="card"><p style="font-size:15px;color:#475569;line-height:1.8;text-align:center">May this festive season bring you peace, prosperity, and happiness.<br>Warm wishes from the entire ' + COMPANY_NAME + ' family!</p></div>'
      + '<p style="text-align:center;font-size:13px;color:#64748b;margin-top:16px">Warm regards,<br><strong>' + COMPANY_NAME + ' Team</strong></p>'
    )
  }),

  welcome: (v) => ({
    subject: 'Welcome to ' + COMPANY_NAME + ', ' + v.EmployeeName + '!',
    html: baseLayout(
      'linear-gradient(135deg, #1a3a8f 0%, #2563eb 100%)',
      'Welcome to ' + COMPANY_NAME + '!', '&#x1F44B;',
      highlightBox('&#x1F389;', 'Welcome aboard, <strong>' + v.EmployeeName + '</strong>!')
      + '<p class="subtitle">We are thrilled to have you join the ' + COMPANY_NAME + ' team. Your journey starts today and we look forward to achieving great things together.</p>'
      + '<div class="card">'
      + '<div class="card-title">Your Details</div>'
      + row('Role / Position', v.Position || '-', 'Department', v.Department || '-')
      + row('Start Date', v.StartDate || new Date().toLocaleDateString(), 'Reporting To', v.Manager || '-')
      + '</div>'
      + btn('Access', DASHBOARD_URL)
      + '<p style="text-align:center;font-size:13px;color:#64748b;margin-top:16px">We are excited to have you!<br><strong>' + COMPANY_NAME + ' HR Team</strong></p>'
    )
  }),

  farewell: (v) => ({
    subject: 'Best Wishes, ' + v.EmployeeName + ' - Farewell from ' + COMPANY_NAME,
    html: baseLayout(
      'linear-gradient(135deg, #475569 0%, #64748b 100%)',
      'Farewell & Best Wishes', '&#x1F44F;',
      highlightBox('&#x1F31F;', 'Thank you for everything, <strong>' + v.EmployeeName + '</strong>!')
      + '<p class="subtitle">As you move on to your next chapter, we want you to know how much your contributions have meant to us and to the entire team.</p>'
      + '<div class="card"><p style="font-size:15px;color:#475569;line-height:1.8;text-align:center">' + (v.FarewellMessage || 'Your work, dedication, and positive spirit will always be remembered at ' + COMPANY_NAME + '. We wish you every success in your future endeavors.') + '</p></div>'
      + '<p style="text-align:center;font-size:13px;color:#64748b;margin-top:16px">With warm wishes,<br><strong>' + COMPANY_NAME + ' Team</strong></p>'
    )
  }),

  promotion: (v) => ({
    subject: 'Congratulations on Your Promotion, ' + v.EmployeeName + '!',
    html: baseLayout(
      'linear-gradient(135deg, #15803d 0%, #16a34a 100%)',
      'Congratulations on Your Promotion!', '&#x1F680;',
      highlightBox('&#x1F38A;', 'Congratulations, <strong>' + v.EmployeeName + '</strong>!')
      + '<p class="subtitle">We are delighted to announce your well-deserved promotion. Your hard work and dedication have paid off!</p>'
      + '<div class="card">'
      + '<div class="card-title">Promotion Details</div>'
      + row('Previous Role', v.PreviousRole || '-', 'New Role', '<span style="color:#15803d;font-weight:800">' + (v.NewRole || '-') + '</span>')
      + (v.EffectiveDate ? row('Effective Date', v.EffectiveDate, '', '') : '')
      + '</div>'
      + '<p style="text-align:center;font-size:13px;color:#64748b;margin-top:16px">With congratulations,<br><strong>' + COMPANY_NAME + ' Leadership Team</strong></p>'
    )
  }),

  achievement: (v) => ({
    subject: 'Achievement Recognized - ' + v.EmployeeName + ', ' + COMPANY_NAME,
    html: baseLayout(
      'linear-gradient(135deg, #b45309 0%, #d97706 100%)',
      'Achievement Recognized!', '&#x1F3C5;',
      highlightBox('&#x2B50;', 'Outstanding work, <strong>' + v.EmployeeName + '</strong>!')
      + '<p class="subtitle">We are proud to recognize your exceptional achievement and contribution to ' + COMPANY_NAME + '.</p>'
      + '<div class="card"><div class="card-title">Achievement</div><p class="message-text">' + (v.AchievementDescription || 'For exceptional performance and dedication.') + '</p></div>'
      + '<p style="text-align:center;font-size:13px;color:#64748b;margin-top:16px">With pride and recognition,<br><strong>' + COMPANY_NAME + ' Management</strong></p>'
    )
  }),

  company_announcement: (v) => ({
    subject: '[' + COMPANY_NAME + '] ' + v.AnnouncementTitle,
    html: baseLayout(
      'linear-gradient(135deg, #1a3a8f 0%, #1e40af 100%)',
      'Company Announcement', '&#x1F4E2;',
      '<p class="greeting">Dear ' + v.EmployeeName + ',</p>'
      + '<p class="subtitle">We have an important announcement to share with you.</p>'
      + '<div class="card"><div class="card-title">' + v.AnnouncementTitle + '</div><p class="message-text">' + v.AnnouncementBody + '</p></div>'
      + (v.ActionUrl ? btn('Learn More', v.ActionUrl) : '')
      + '<p style="text-align:center;font-size:13px;color:#64748b;margin-top:20px">Regards,<br><strong>' + (v.SenderName || COMPANY_NAME + ' Management') + '</strong></p>'
    )
  }),

  custom_greeting: (v) => ({
    subject: v.Subject || 'Greetings from ' + COMPANY_NAME,
    html: baseLayout(
      v.HeaderColor || 'linear-gradient(135deg, #1a3a8f 0%, #6366f1 100%)',
      v.GreetingTitle || 'Special Greetings',
      v.GreetingEmoji || '&#x1F48C;',
      '<p class="greeting">Dear ' + v.EmployeeName + ',</p>'
      + highlightBox('', v.GreetingMessage)
      + '<p style="text-align:center;font-size:13px;color:#64748b;margin-top:20px">Warm regards,<br><strong>' + (v.SenderName || COMPANY_NAME) + '</strong></p>'
    )
  }),

  // ── Interaction Log Notification ─────────────────────────────────────────

  interaction_logged: (v) => ({
    subject: '[New Interaction] ' + (v.Subject || 'Interaction Logged') + ' — ' + (v.CompanyName || 'Account'),
    html: baseLayout(
      'linear-gradient(135deg, #0369a1 0%, #0ea5e9 100%)',
      'New Interaction Logged', '&#x1F4DD;',
      '<p class="greeting">Hello ' + v.EmployeeName + ',</p>'
      + '<p class="subtitle">A new interaction has been logged for <strong>' + (v.CompanyName || 'your account') + '</strong> that you are associated with. Here are the details:</p>'
      + '<div class="card">'
      + '<div class="card-title">Interaction Details</div>'
      + row('Account / Company', v.CompanyName || '-', 'Channel', v.Source || '-')
      + row('Subject', v.Subject || '-', 'Date & Time', (v.Date || '-') + (v.Time ? ' at ' + v.Time : ''))
      + row('Logged By', v.LoggedBy || '-', 'Sentiment', v.Sentiment || 'Neutral')
      + '</div>'
      + (v.MessageSummary ? '<div class="note-box"><strong>Interaction Summary:</strong><br>' + v.MessageSummary + '</div>' : '')
      + btn('View in CustomerPulse', DASHBOARD_URL)
    )
  })
};

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export function renderTemplate(templateId, variables) {
  const v = { ...variables };
  
  // Format date/time fields to Asia/Kolkata timezone standard
  const dateKeys = ['CompletionDate', 'Date', 'DueDate', 'SentAt', 'CreatedOn', 'StartDate', 'EffectiveDate'];
  for (const key of dateKeys) {
    if (v[key] && typeof v[key] === 'string' && v[key] !== '—' && v[key] !== 'Not specified' && v[key] !== 'No deadline set') {
      if (v[key].includes('T') || v[key].includes('Z') || /^\d{4}-\d{2}-\d{2}/.test(v[key])) {
        v[key] = formatKolkataDateTime(v[key]);
      }
    }
  }

  const tpl = TEMPLATES[templateId];
  if (!tpl) {
    return {
      subject: '[CustomerPulse] Notification - ' + templateId,
      html: baseLayout(
        'linear-gradient(135deg, #1a3a8f 0%, #2563eb 100%)',
        'Notification', '&#x1F514;',
        '<p class="greeting">Hello ' + (v.EmployeeName || 'Team Member') + ',</p>'
        + '<p class="subtitle">' + (v.Message || 'You have a new notification in CustomerPulse CRM.') + '</p>'
        + btn('Open ', DASHBOARD_URL)
      )
    };
  }
  return tpl(v);
}

export function listTemplates() {
  return Object.keys(TEMPLATES).map(id => ({
    id,
    name: id.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
    category: (id.startsWith('task_') || id === 'status_changed') ? 'Task Notification' : 'Greeting'
  }));
}
