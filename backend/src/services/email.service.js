/**
 * email.service.js — Backward-compatible email service wrapper.
 *
 * The original direct-SMTP implementation has been replaced by delegation
 * to the centralized NotificationEngine. The public function signatures
 * are unchanged so existing callers continue to work without modification.
 *
 * For new code, prefer calling NotificationEngine.publishEvent() directly.
 */
import { db } from '../config/database.js';
import { NotificationEngine } from './notification/NotificationEngine.js';
import { smtpProvider } from './notification/SmtpEmailProvider.js';

/**
 * Formats date to DD-MM-YYYY
 */
function formatEmailDate(dateStr) {
  if (!dateStr) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr).trim())) {
    const [yyyy, mm, dd] = String(dateStr).trim().split('-');
    return `${dd}-${mm}-${yyyy}`;
  }
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return String(dateStr);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

/**
 * Formats time to 24-hour hh:mm
 */
function formatEmailTime(timeStr) {
  if (!timeStr) return '';
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(String(timeStr).trim())) {
    const parts = String(timeStr).trim().split(':');
    const hours = parseInt(parts[0], 10);
    const minutes = parts[1].substring(0, 2);
    return `${String(hours).padStart(2, '0')}:${minutes}`;
  }
  return String(timeStr);
}

/**
 * Dispatches a task assignment email notification via the NotificationEngine.
 * @param {string} toUserId - UID of the recipient user
 * @param {object} taskDetails - { task, taskHeader, accountName, priority, dueDate, assignerName }
 */
export async function sendTaskAssignmentEmail(toUserId, taskDetails) {
  try {
    if (!toUserId) return;

    const { task, taskHeader, accountName, priority, dueDate, assignerName, isAssociated } = taskDetails;

    const formattedDueDate = dueDate
      ? formatEmailDate(dueDate)
      : 'No deadline set';

    const isAssoc = Boolean(isAssociated || (accountName && accountName !== 'Internal Staff Assignment' && accountName !== 'Internal'));
    const eventType = isAssoc ? 'associated_task_assigned' : 'staff_task_assigned';

    await NotificationEngine.publishEvent(
      eventType,
      {
        TaskTitle: taskHeader || 'New Task Assigned',
        TaskDescription: task || '',
        TaskType: isAssoc ? 'Associated Task' : 'Staff Task',
        Priority: priority || 'Medium',
        DueDate: formattedDueDate,
        AssignedBy: assignerName || 'System',
        CompanyName: accountName || 'Internal',
        CustomerName: accountName || 'Internal',
        InAppMessage: `${assignerName || 'System'} assigned you a ${isAssoc ? 'associated' : 'staff'} task: "${taskHeader || task}"`
      },
      [toUserId],
      { skipInAppNotification: true } // in-app notif created separately by route
    );
  } catch (err) {
    console.error('[email.service] sendTaskAssignmentEmail delegation error:', err.message);
  }
}

/**
 * Sends an "interaction logged" email to all users associated with the account
 * (account owner + stakeholders) whenever a new interaction is created.
 * @param {string[]} toUserIds - Array of UIDs (account owner + stakeholders)
 * @param {object} interactionDetails - { companyName, source, subject, date, time, loggedBy, messageSummary, sentiment, accountId }
 */
export async function sendInteractionLoggedEmail(toUserIds, interactionDetails) {
  try {
    if (!toUserIds || toUserIds.length === 0) return;

    const {
      companyName,
      source,
      subject,
      date,
      time,
      loggedBy,
      messageSummary,
      sentiment,
      accountId
    } = interactionDetails;

    const formattedDate = date ? formatEmailDate(date) : formatEmailDate(new Date());
    const formattedTime = time ? formatEmailTime(time) : '';

    await NotificationEngine.publishEvent(
      'interaction_logged',
      {
        CompanyName: companyName || 'Account',
        Source: source || '-',
        Subject: subject || 'Interaction Note',
        Date: formattedDate,
        Time: formattedTime,
        LoggedBy: loggedBy || 'System',
        MessageSummary: messageSummary || '',
        Sentiment: sentiment || 'Neutral',
        AccountId: accountId || null,
        InAppMessage: `New interaction logged for ${companyName || 'your account'} by ${loggedBy || 'System'}`
      },
      toUserIds,
      { skipInAppNotification: true, relatedAccountId: accountId }
    );
  } catch (err) {
    console.error('[email.service] sendInteractionLoggedEmail delegation error:', err.message);
  }
}

/**
 * Escapes unsafe HTML characters in dynamic strings interpolated into email templates.
 * @param {*} value
 * @returns {string}
 */
function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const EMAIL_BADGE_STYLES = {
  gold: 'background-color: #fef08a; color: #713f12; border: 1px solid #facc15;',
  amber: 'background-color: #fef3c7; color: #92400e; border: 1px solid #fcd34d;',
  indigo: 'background-color: #e0e7ff; color: #3730a3; border: 1px solid #c7d2fe;'
};

/**
 * Renders an inline-styled highlighted mailto pill for an email address.
 * @param {string} email
 * @param {string} fallbackText
 * @param {'gold'|'amber'|'indigo'} tone
 * @returns {string}
 */
function renderHighlightedEmail(email, fallbackText = 'Not provided', tone = 'gold') {
  const trimmed = typeof email === 'string' ? email.trim() : '';
  if (!trimmed) {
    return `<span style="color: #94a3b8; font-style: italic; font-size: 12px;">${escapeHtml(fallbackText)}</span>`;
  }
  const safeEmail = escapeHtml(trimmed);
  const toneStyle = EMAIL_BADGE_STYLES[tone] || EMAIL_BADGE_STYLES.gold;
  return `<a href="mailto:${safeEmail}" style="display: inline-block; ${toneStyle} padding: 3px 8px; border-radius: 6px; font-size: 12px; font-weight: 700; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; text-decoration: none; word-break: break-all;">${safeEmail}</a>`;
}

/**
 * Renders the Key Contacts table block for a single account card.
 * @param {Array} contacts
 * @returns {string}
 */
function renderKeyContactsBlock(contacts) {
  if (!Array.isArray(contacts) || contacts.length === 0) {
    return `
      <div style="padding: 12px 16px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; font-style: italic;">
        No key contacts were provided for this account at creation time.
      </div>
    `;
  }

  const contactRowsHtml = contacts.map((contact, cIdx) => {
    const safeName = escapeHtml(contact.name || 'Unnamed Contact');
    const roleParts = [contact.designation || contact.position, contact.department].filter(Boolean).map(escapeHtml);
    const roleText = roleParts.length > 0 ? roleParts.join(' · ') : '—';
    const phoneText = contact.phone ? escapeHtml(contact.phone) : '—';
    const tagsHtml = [contact.hierarchyTag, contact.influenceTag]
      .filter(Boolean)
      .map(tag => `<span style="display: inline-block; background-color: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; padding: 1px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; margin-right: 4px; margin-top: 3px;">${escapeHtml(tag)}</span>`)
      .join('');

    return `
      <tr style="background-color: ${cIdx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
        <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; vertical-align: top;">
          <div style="font-weight: 700; color: #0f172a; font-size: 12px;">${safeName}</div>
          ${tagsHtml ? `<div>${tagsHtml}</div>` : ''}
        </td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; color: #334155; font-size: 12px; vertical-align: top;">
          ${roleText}
        </td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; color: #475569; font-size: 12px; vertical-align: top; white-space: nowrap;">
          ${phoneText}
        </td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; vertical-align: top;">
          ${renderHighlightedEmail(contact.email, 'No email provided', 'gold')}
        </td>
      </tr>
    `;
  }).join('');

  return `
    <div style="border-top: 1px solid #e2e8f0;">
      <div style="background-color: #fffbeb; padding: 9px 16px; border-bottom: 1px solid #fde68a;">
        <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #92400e;">
          Key Contacts (${contacts.length}) — Highlighted Email Addresses for Sync Permission
        </span>
      </div>
      <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: left;">
        <thead>
          <tr style="background-color: #f8fafc; border-bottom: 1px solid #cbd5e1;">
            <th style="padding: 8px 12px; font-weight: 700; color: #475569; font-size: 11px;">Contact Name</th>
            <th style="padding: 8px 12px; font-weight: 700; color: #475569; font-size: 11px;">Designation / Dept</th>
            <th style="padding: 8px 12px; font-weight: 700; color: #475569; font-size: 11px;">Phone</th>
            <th style="padding: 8px 12px; font-weight: 700; color: #92400e; background-color: #fef9c3; font-size: 11px;">Email Address (Highlighted)</th>
          </tr>
        </thead>
        <tbody>
          ${contactRowsHtml}
        </tbody>
      </table>
    </div>
  `;
}

/**
 * Renders a detailed card for a single newly added account, including account metadata and key contacts.
 * @param {object} acc
 * @param {number} idx
 * @returns {string}
 */
function renderAccountCardHtml(acc, idx) {
  const contacts = Array.isArray(acc.contacts) ? acc.contacts : [];
  const contactsCount = contacts.length > 0 ? contacts.length : (acc.contactsCount ?? 0);

  return `
    <div style="border: 1px solid #cbd5e1; border-radius: 10px; overflow: hidden; margin-bottom: 18px; background-color: #ffffff;">
      <!-- Account Card Header -->
      <table style="width: 100%; border-collapse: collapse; background-color: #f8fafc; border-bottom: 1px solid #e2e8f0;">
        <tr>
          <td style="padding: 12px 16px; vertical-align: middle;">
            <span style="font-size: 11px; font-weight: 700; color: #64748b; margin-right: 6px;">#${idx + 1}</span>
            <span style="font-size: 15px; font-weight: 700; color: #0f172a;">${escapeHtml(acc.companyName || 'Unknown Company')}</span>
            ${acc.accountId ? `<span style="margin-left: 8px; font-size: 11px; font-family: ui-monospace, monospace; color: #475569; background-color: #e2e8f0; padding: 2px 6px; border-radius: 4px;">${escapeHtml(acc.accountId)}</span>` : ''}
          </td>
          <td style="padding: 12px 16px; text-align: right; vertical-align: middle;">
            <span style="display: inline-block; background-color: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 700;">
              ${escapeHtml(acc.domain || 'General')}
            </span>
          </td>
        </tr>
      </table>

      <!-- Account Metadata Grid -->
      <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
        <tr>
          <td style="width: 50%; padding: 10px 16px; border-bottom: 1px solid #f1f5f9; vertical-align: top;">
            <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; margin-bottom: 3px;">Industry</div>
            <div style="color: #1e293b; font-weight: 600;">${escapeHtml(acc.industry || 'Not specified')}</div>
          </td>
          <td style="width: 50%; padding: 10px 16px; border-bottom: 1px solid #f1f5f9; vertical-align: top;">
            <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; margin-bottom: 3px;">Region / Location</div>
            <div style="color: #1e293b; font-weight: 600;">${escapeHtml(acc.region || 'Not specified')}</div>
          </td>
        </tr>
        <tr>
          <td style="width: 50%; padding: 10px 16px; border-bottom: 1px solid #f1f5f9; vertical-align: top;">
            <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; margin-bottom: 4px;">Company Corporate Email</div>
            <div>${renderHighlightedEmail(acc.email, 'Not provided', 'amber')}</div>
          </td>
          <td style="width: 50%; padding: 10px 16px; border-bottom: 1px solid #f1f5f9; vertical-align: top;">
            <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; margin-bottom: 3px;">Company Phone</div>
            <div style="color: #1e293b; font-weight: 600;">${escapeHtml(acc.phone || 'Not provided')}</div>
          </td>
        </tr>
        <tr>
          <td style="width: 50%; padding: 10px 16px; vertical-align: top;">
            <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; margin-bottom: 4px;">Account Owner</div>
            <div style="color: #0f172a; font-weight: 700; margin-bottom: 4px;">${escapeHtml(acc.ownerName || 'Unassigned')}</div>
            ${acc.ownerEmail ? `<div>${renderHighlightedEmail(acc.ownerEmail, '', 'indigo')}</div>` : ''}
          </td>
          <td style="width: 50%; padding: 10px 16px; vertical-align: top;">
            <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; margin-bottom: 3px;">${acc.ceoName ? 'Executive / CEO' : 'Total Key Contacts'}</div>
            <div style="color: #1e293b; font-weight: 600;">
              ${acc.ceoName ? escapeHtml(acc.ceoName) : `${contactsCount} Key Contact${contactsCount === 1 ? '' : 's'}`}
            </div>
          </td>
        </tr>
      </table>

      <!-- Key Contacts Details -->
      ${renderKeyContactsBlock(contacts)}
    </div>
  `;
}

/**
 * Builds the subject, recipients, and HTML body for the new-accounts tech team notification email.
 * @param {object} params - { accounts: Array, uploadedBy: { name, email }, source?: string }
 * @returns {{ targetEmails: string[], subject: string, html: string }}
 */
export function buildNewAccountsTechTeamEmail({ accounts, uploadedBy, source = 'Bulk Account Upload' }) {
  const targetEmails = Array.from(new Set([
    'rashadamina149@gmail.com',
    process.env.TECH_TEAM_EMAIL,
    process.env.TECH_HEAD_EMAIL
  ].filter(Boolean)));

  const count = accounts.length;
  const totalContacts = accounts.reduce(
    (sum, acc) => sum + (Array.isArray(acc.contacts) ? acc.contacts.length : (acc.contactsCount ?? 0)),
    0
  );

  const uniqueClientEmails = Array.from(new Set(
    accounts.flatMap(acc => [
      acc.email,
      ...(Array.isArray(acc.contacts) ? acc.contacts.map(c => c.email) : [])
    ])
      .map(e => (typeof e === 'string' ? e.trim() : ''))
      .filter(Boolean)
  ));

  const subject = `[CustomerPulse Action Required] ${count} New Account${count > 1 ? 's' : ''} Added via ${source} — Grant Outlook & Teams Permissions`;
  const safeSource = escapeHtml(source);
  const safeUploaderName = escapeHtml(uploadedBy?.name || 'Administrator');
  const safeUploaderEmail = escapeHtml(uploadedBy?.email || 'System');

  const emailWhitelistBarHtml = uniqueClientEmails.length > 0 ? `
    <div style="background-color: #fefce8; border: 1px solid #fde047; border-left: 4px solid #eab308; border-radius: 8px; padding: 14px 16px; margin-bottom: 22px;">
      <div style="font-size: 12px; font-weight: 700; color: #854d0e; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.04em;">
        Highlighted Email Addresses Requiring Outlook &amp; Teams Sync (${uniqueClientEmails.length})
      </div>
      <div style="line-height: 2;">
        ${uniqueClientEmails.map(em => `<span style="margin-right: 6px;">${renderHighlightedEmail(em, '', 'gold')}</span>`).join('')}
      </div>
    </div>
  ` : '';

  const accountCardsHtml = accounts.map((acc, idx) => renderAccountCardHtml(acc, idx)).join('');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>New Accounts Added - Outlook &amp; Teams Permissions Required</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 24px; color: #1e293b;">
      <div style="max-width: 720px; margin: 0 auto; background-color: #ffffff; border-radius: 14px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.06);">

        <!-- Header -->
        <div style="background: linear-gradient(135deg, #1e1b4b 0%, #312e81 100%); padding: 24px 28px; color: #ffffff;">
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 10px;">
            <tr>
              <td>
                <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; background-color: rgba(255,255,255,0.16); padding: 4px 10px; border-radius: 6px; color: #e0e7ff;">
                  CustomerPulse Enterprise Alert
                </span>
              </td>
              <td style="text-align: right; font-size: 12px; color: #c7d2fe;">
                ${escapeHtml(new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }))}
              </td>
            </tr>
          </table>
          <h1 style="margin: 0 0 6px 0; font-size: 21px; font-weight: 700; color: #ffffff;">
            New Client Account${count > 1 ? 's' : ''} Added (${count}) · ${totalContacts} Key Contact${totalContacts === 1 ? '' : 's'}
          </h1>
          <p style="margin: 0; font-size: 13px; color: #c7d2fe; line-height: 1.4;">
            Action Required: Grant Outlook and Microsoft Teams sync permissions for these accounts and highlighted contact emails.
          </p>
        </div>

        <!-- Body -->
        <div style="padding: 26px 28px;">
          <p style="margin: 0 0 14px 0; font-size: 14px; line-height: 1.6; color: #334155;">
            Dear Technical Team &amp; Tech Head,
          </p>
          <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.6; color: #334155;">
            <strong>${count} new customer account${count > 1 ? 's have' : ' has'} been added to CustomerPulse</strong> via <strong>${safeSource}</strong> by <strong>${safeUploaderName}</strong> (${renderHighlightedEmail(uploadedBy?.email || '', safeUploaderEmail, 'indigo')}).
          </p>

          <!-- Action Callout Box -->
          <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-left: 4px solid #3b82f6; border-radius: 8px; padding: 15px 18px; margin-bottom: 20px;">
            <div style="font-weight: 700; color: #1e40af; font-size: 13px; margin-bottom: 6px;">
              Action Required: Grant Microsoft 365 Permissions
            </div>
            <p style="font-size: 13px; color: #1e3a8a; line-height: 1.5; margin: 0 0 8px 0;">
              Please authorize and configure <strong>Microsoft Graph / Teams &amp; Outlook</strong> sync permissions for the accounts and highlighted key contact email addresses below:
            </p>
            <ul style="margin: 0; padding-left: 20px; font-size: 12px; color: #1e3a8a; line-height: 1.5;">
              <li><strong>Outlook Sync:</strong> Allow reading inbound/outbound correspondence with the highlighted corporate and key contact email addresses for relationship and silence scoring.</li>
              <li><strong>Teams Sync:</strong> Enable automated sync of customer meeting schedules, attendances, and call transcripts with these stakeholders.</li>
            </ul>
          </div>

          ${emailWhitelistBarHtml}

          <!-- Detailed Account Cards + Key Contacts -->
          <h3 style="font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #475569; margin: 0 0 12px 0;">
            Account &amp; Key Contact Details
          </h3>
          ${accountCardsHtml}

          <p style="font-size: 12px; color: #64748b; line-height: 1.5; margin: 8px 0 0 0;">
            This is an automated operational alert generated by the <strong>CustomerPulse Enterprise Platform</strong>. Once Microsoft 365 permissions are granted, CustomerPulse background intelligence schedulers will begin automated signal processing.
          </p>
        </div>

        <!-- Footer -->
        <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 28px; font-size: 11px; color: #94a3b8; text-align: center;">
          NeST Digital &middot; CustomerPulse Enterprise CRM &middot; Notification Engine<br>
          Sent to: ${escapeHtml(targetEmails.join(', '))}
        </div>

      </div>
    </body>
    </html>
  `;

  return { targetEmails, subject, html };
}

/**
 * Sends an email notification to the technical team and tech head informing them that
 * new account(s) have been added to CustomerPulse via bulk upload or single creation,
 * including full account details and key contacts with highlighted email addresses.
 * @param {object} params - { accounts: Array, uploadedBy: { name, email }, source?: string }
 */
export async function sendNewAccountsTechTeamNotification({ accounts, uploadedBy, source = 'Bulk Account Upload' }) {
  try {
    if (!accounts || accounts.length === 0) return;

    const { targetEmails, subject, html } = buildNewAccountsTechTeamEmail({ accounts, uploadedBy, source });

    for (const to of targetEmails) {
      try {
        await smtpProvider.send({
          to,
          subject,
          html
        });
        console.log(`📧 [AccountNotification] Sent new accounts alert to: ${to}`);
      } catch (err) {
        console.error(`❌ [AccountNotification] Failed to send new accounts alert to ${to}:`, err.message);
      }
    }
  } catch (outerErr) {
    console.error('❌ [sendNewAccountsTechTeamNotification] Error dispatching email:', outerErr);
  }
}
