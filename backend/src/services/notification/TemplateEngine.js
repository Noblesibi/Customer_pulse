import dotenv from 'dotenv';
dotenv.config();

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const TASKS_URL = FRONTEND_URL + '/staff-tasks';
const DASHBOARD_URL = FRONTEND_URL + '/dashboard';
const COMPANY_NAME = 'NeST Digital';
const CRM_NAME = 'CustomerPulse CRM';

// ─────────────────────────────────────────────────────────────────────────────
// Shared HTML layout helpers
// ─────────────────────────────────────────────────────────────────────────────
const BASE_CSS = `<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f1f5f9; color: #1e293b; }
  .wrapper { max-width: 620px; margin: 32px auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.09); border: 1px solid #e2e8f0; }
  .header { padding: 28px 32px; text-align: center; }
  .header-brand { font-size: 11px; font-weight: 800; letter-spacing: 3px; text-transform: uppercase; color: rgba(255,255,255,0.7); margin-bottom: 8px; }
  .header-title { font-size: 22px; font-weight: 800; color: #ffffff; letter-spacing: -0.3px; }
  .header-icon { font-size: 36px; margin-bottom: 10px; }
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
</style>`;

function baseLayout(headerColor, headerTitle, headerIcon, bodyHtml) {
  const year = new Date().getFullYear();
  return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">'
    + '<title>' + headerTitle + ' - ' + CRM_NAME + '</title>' + BASE_CSS + '</head><body>'
    + '<div class="wrapper">'
    + '<div class="header" style="background:' + headerColor + '">'
    + '<div class="header-brand">' + COMPANY_NAME + ' &middot; ' + CRM_NAME + '</div>'
    + '<div class="header-icon">' + headerIcon + '</div>'
    + '<div class="header-title">' + headerTitle + '</div>'
    + '</div>'
    + '<div class="body">' + bodyHtml + '</div>'
    + '<div class="footer"><div class="footer-text">'
    + 'This is an automated notification from <span class="footer-brand">' + CRM_NAME + '</span>.<br>'
    + '&copy; ' + year + ' ' + COMPANY_NAME + '. All rights reserved.<br>'
    + '<small>Do not reply to this email. Manage your preferences in the CRM.</small>'
    + '</div></div>'
    + '</div></body></html>';
}

function priorityBadge(priority) {
  const cls = priority === 'High' ? 'badge-high' : priority === 'Medium' ? 'badge-medium' : 'badge-low';
  return '<span class="badge ' + cls + '">' + (priority || 'Normal') + '</span>';
}

function statusBadge(status) {
  const s = (status || '').toLowerCase();
  const cls = s === 'completed' ? 'badge-completed' : s === 'overdue' ? 'badge-overdue'
    : (s === 'cancelled' || s === 'decline' || s === 'declined') ? 'badge-cancelled' : 'badge-pending';
  return '<span class="badge ' + cls + '">' + (status || '') + '</span>';
}

function btn(label, url) {
  return '<div class="btn-container"><a href="' + url + '" class="btn">' + label + '</a></div>';
}

function row(label1, val1, label2, val2) {
  return '<div class="row">'
    + '<div class="field"><div class="field-label">' + label1 + '</div><div class="field-value">' + val1 + '</div></div>'
    + (label2 ? '<div class="field"><div class="field-label">' + label2 + '</div><div class="field-value">' + val2 + '</div></div>' : '')
    + '</div>';
}

function noteBox(text) {
  return '<div class="note-box">' + text + '</div>';
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
      + btn('View Task in CRM', TASKS_URL)
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

  status_changed: (v) => ({
    subject: '[Status Update] ' + v.TaskTitle + ' - ' + v.Status,
    html: baseLayout(
      'linear-gradient(135deg, #0f766e 0%, #0d9488 100%)',
      'Task Status Changed', '&#x1F503;',
      '<p class="greeting">Hello ' + v.EmployeeName + ',</p>'
      + '<p class="subtitle">The status of task <strong>' + v.TaskTitle + '</strong> has been changed by <strong>' + (v.UpdatedBy || 'a team member') + '</strong>.</p>'
      + '<div class="card">'
      + '<div class="card-title">Status Update</div>'
      + row('Task', v.TaskTitle, 'Account', v.CompanyName || 'Internal')
      + row('Previous Status', statusBadge(v.PreviousStatus || '-'), 'New Status', statusBadge(v.Status))
      + '</div>'
      + (v.StatusNote ? noteBox(v.StatusNote) : '')
      + btn('View Task', TASKS_URL)
    )
  }),

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
      + btn('Reply in CRM', TASKS_URL)
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
      + btn('View in CRM', TASKS_URL)
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
      + btn('Access CRM', DASHBOARD_URL)
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
  })
};

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export function renderTemplate(templateId, variables) {
  const v = variables || {};
  const tpl = TEMPLATES[templateId];
  if (!tpl) {
    return {
      subject: '[CustomerPulse] Notification - ' + templateId,
      html: baseLayout(
        'linear-gradient(135deg, #1a3a8f 0%, #2563eb 100%)',
        'Notification', '&#x1F514;',
        '<p class="greeting">Hello ' + (v.EmployeeName || 'Team Member') + ',</p>'
        + '<p class="subtitle">' + (v.Message || 'You have a new notification in CustomerPulse CRM.') + '</p>'
        + btn('Open CRM', DASHBOARD_URL)
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
