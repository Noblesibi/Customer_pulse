import nodemailer from 'nodemailer';
import { db } from '../config/database.js';
import dotenv from 'dotenv';

dotenv.config();

const smtpHost = process.env.SMTP_HOST || 'smtp.office365.com';
const smtpPort = parseInt(process.env.SMTP_PORT) || 587;
const smtpSecure = process.env.SMTP_SECURE === 'true';
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;
const emailFrom = process.env.EMAIL_FROM || '"Customer Pulse" <noreply@nestgroup.net>';
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

// Create Nodemailer transporter
let transporter = null;

if (smtpUser && smtpPass) {
  transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    auth: {
      user: smtpUser,
      pass: smtpPass
    },
    tls: {
      ciphers: 'SSLv3',
      rejectUnauthorized: false
    }
  });
}

/**
 * Generates the premium HTML template for task assignments
 */
function generateTaskEmailHtml(userName, taskText, taskHeader, accountName, priority, dueDate, assignerName) {
  const priorityColor = 
    priority === 'High' ? '#EF4444' :
    priority === 'Medium' ? '#F59E0B' :
    '#64748B';

  const formattedDueDate = dueDate ? new Date(dueDate).toLocaleDateString() : 'No due date set';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>New Task Assigned</title>
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background-color: #0f172a;
          color: #f1f5f9;
          margin: 0;
          padding: 0;
        }
        .container {
          max-width: 600px;
          margin: 20px auto;
          background-color: #1e293b;
          border-radius: 12px;
          border: 1px solid #334155;
          overflow: hidden;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
        }
        .header {
          background: linear-gradient(135deg, #1e1b4b 0%, #312e81 100%);
          padding: 24px;
          text-align: center;
          border-bottom: 2px solid #4f46e5;
        }
        .header h1 {
          margin: 0;
          font-size: 20px;
          color: #ffffff;
          font-weight: 800;
          letter-spacing: 0.5px;
          text-transform: uppercase;
        }
        .content {
          padding: 30px;
        }
        .greeting {
          font-size: 16px;
          margin-bottom: 20px;
          color: #e2e8f0;
        }
        .task-card {
          background-color: #0f172a;
          border: 1px solid #334155;
          border-radius: 8px;
          padding: 20px;
          margin-bottom: 25px;
        }
        .task-title {
          font-weight: 700;
          font-size: 15px;
          color: #38bdf8;
          margin-bottom: 10px;
        }
        .task-text {
          font-size: 14px;
          line-height: 1.6;
          color: #cbd5e1;
          margin-bottom: 15px;
        }
        .details-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          font-size: 13px;
          border-t: 1px solid #334155;
          padding-top: 15px;
        }
        .detail-item {
          margin-bottom: 6px;
        }
        .detail-label {
          color: #94a3b8;
          font-weight: 600;
        }
        .detail-value {
          color: #e2e8f0;
          font-weight: 700;
        }
        .priority-badge {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 4px;
          color: #ffffff;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
        }
        .cta-container {
          text-align: center;
          margin-top: 20px;
        }
        .btn {
          display: inline-block;
          background-color: #4f46e5;
          color: #ffffff;
          text-decoration: none;
          padding: 12px 24px;
          font-weight: 700;
          font-size: 14px;
          border-radius: 8px;
          transition: background-color 0.2s;
        }
        .footer {
          background-color: #0f172a;
          padding: 20px;
          text-align: center;
          font-size: 12px;
          color: #64748b;
          border-top: 1px solid #334155;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>CustomerPulse CRM</h1>
        </div>
        <div class="content">
          <div class="greeting">Hello ${userName},</div>
          <p style="font-size: 14px; color: #cbd5e1; margin-top: 0;">You have been assigned a new task in CustomerPulse CRM.</p>
          
          <div class="task-card">
            <div class="task-title">${taskHeader || 'New Task Assigned'}</div>
            <div style="font-size: 13px; color: #94a3b8; margin-bottom: 12px;"><strong>Account:</strong> ${accountName}</div>
            <div class="task-text">"${taskText}"</div>
            
            <div class="details-grid">
              <div class="detail-item">
                <span class="detail-label">Priority: </span>
                <span class="priority-badge" style="background-color: ${priorityColor};">${priority}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Due Date: </span>
                <span class="detail-value">${formattedDueDate}</span>
              </div>
              <div class="detail-item" style="grid-column: span 2; margin-top: 6px;">
                <span class="detail-label">Assigned By: </span>
                <span class="detail-value">${assignerName}</span>
              </div>
            </div>
          </div>
          
          <div class="cta-container">
            <a href="${frontendUrl}/dashboard" class="btn">View Task on Dashboard</a>
          </div>
        </div>
        <div class="footer">
          This is an automated system alert from CustomerPulse Relationship Intelligence.<br>
          Nest Digital © 2026. All rights reserved.
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Dispatches a task assignment email to the assigned user
 * @param {string} toUserId - Uid of the recipient user
 * @param {object} taskDetails - Details of the task { task, taskHeader, accountName, priority, dueDate, assignerName }
 */
export async function sendTaskAssignmentEmail(toUserId, taskDetails) {
  try {
    if (!toUserId) return;

    // Load the user from DB to retrieve their email
    const userDoc = await db.collection('users').doc(toUserId).get();
    if (!userDoc.exists) {
      console.warn(`⚠️ [EmailService] Cannot send task email: User doc not found for UID "${toUserId}"`);
      return;
    }

    const user = userDoc.data();
    const recipientEmail = user.email;
    const recipientName = user.name || 'Team Member';

    if (!recipientEmail) {
      console.warn(`⚠️ [EmailService] User "${recipientName}" does not have an email address configured.`);
      return;
    }

    const { task, taskHeader, accountName, priority, dueDate, assignerName } = taskDetails;
    const subject = `[CustomerPulse] Task: ${taskHeader || ('New Task Assigned for ' + accountName)}`;
    const htmlBody = generateTaskEmailHtml(
      recipientName,
      task || 'New Task Assignment',
      taskHeader,
      accountName || 'External Account',
      priority || 'Medium',
      dueDate,
      assignerName || 'System'
    );

    // MOCK MODE fallback if credentials are not configured in env
    if (!transporter) {
      console.log('✉️ [EmailService] (MOCK MODE - Credentials Not Configured)');
      console.log(`  To:      ${recipientName} <${recipientEmail}>`);
      console.log(`  Subject: ${subject}`);
      console.log(`  Task:    "${taskHeader || task}" (Priority: ${priority}, Due: ${dueDate})`);
      console.log(`  From:    ${assignerName}`);
      return;
    }

    // Send email via transport
    const mailOptions = {
      from: emailFrom,
      to: recipientEmail,
      subject: subject,
      html: htmlBody
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`📧 [EmailService] Email notification successfully sent to ${recipientEmail}. MessageId: ${info.messageId}`);
  } catch (err) {
    console.error('❌ [EmailService] Failed to send email alert:', err.message);
  }
}
