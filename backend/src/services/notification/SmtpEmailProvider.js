import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import { IEmailProvider } from './IEmailProvider.js';

dotenv.config();

/**
 * SmtpEmailProvider — Concrete nodemailer SMTP implementation of IEmailProvider.
 *
 * Configuration is read exclusively from environment variables:
 *   SMTP_HOST    — SMTP server host (e.g. 10.45.0.12)
 *   SMTP_PORT    — Port (default 25)
 *   SMTP_SECURE  — Use TLS (default false for port 25)
 *   SMTP_USER    — Auth username (leave blank for anonymous relay)
 *   SMTP_PASS    — Auth password (leave blank for anonymous relay)
 *   EMAIL_FROM   — Sender string, e.g. "Test Admin <test@nestgroup.net>"
 *
 * When SMTP_HOST is not configured, the provider falls back to
 * MOCK MODE — emails are logged to console only. This is intentional
 * for developer environments that are not on the company network.
 *
 * Future replacement: extend IEmailProvider and inject the new class
 * into NotificationEngine — no business logic changes required.
 */
export class SmtpEmailProvider extends IEmailProvider {
  constructor() {
    super();
    this._transporter = null;
    this._from = process.env.EMAIL_FROM || '"CustomerPulse CRM" <noreply@nestgroup.net>';
    this._isMock = false;
    this._initialize();
  }

  _initialize() {
    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT) || 25;
    const secure = process.env.SMTP_SECURE === 'true';
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host) {
      this._isMock = true;
      console.log('📧 [SmtpEmailProvider] No SMTP_HOST configured — running in MOCK MODE (emails logged to console).');
      return;
    }

    const config = {
      host,
      port,
      secure,
      tls: {
        rejectUnauthorized: false,
        ciphers: 'SSLv3'
      }
    };

    if (user) {
      config.auth = { user, pass: pass || '' };
    }

    this._transporter = nodemailer.createTransport(config);
    console.log(`📧 [SmtpEmailProvider] SMTP configured → ${host}:${port} (secure=${secure}, auth=${user ? 'yes' : 'anonymous relay'})`);
  }

  getProviderName() {
    return this._isMock ? 'SmtpMock' : 'SmtpRelay';
  }

  async verify() {
    if (this._isMock) {
      return { ok: true, error: null, mode: 'mock' };
    }
    try {
      await this._transporter.verify();
      return { ok: true, error: null, mode: 'live' };
    } catch (err) {
      return { ok: false, error: err.message, mode: 'live' };
    }
  }

  /**
   * Send an email.
   * @param {{to, subject, html, from?}} mailOptions
   * @returns {Promise<{success, messageId, error, mock}>}
   */
  async send(mailOptions) {
    const { to, subject, html, from } = mailOptions;

    if (this._isMock) {
      console.log('\n📬 [SmtpEmailProvider] ── MOCK EMAIL ──────────────────────');
      console.log(`  To:      ${to}`);
      console.log(`  Subject: ${subject}`);
      console.log('─────────────────────────────────────────────────────────\n');
      return { success: true, messageId: `mock-${Date.now()}`, error: null, mock: true };
    }

    try {
      const info = await this._transporter.sendMail({
        from: from || this._from,
        to,
        subject,
        html
      });
      console.log(`✅ [SmtpEmailProvider] Sent → ${to} | MessageId: ${info.messageId}`);
      return { success: true, messageId: info.messageId, error: null, mock: false };
    } catch (err) {
      console.error(`❌ [SmtpEmailProvider] Failed → ${to} | ${err.message}`);
      return { success: false, messageId: null, error: err.message, mock: false };
    }
  }
}

// Export singleton instance for use across the engine
export const smtpProvider = new SmtpEmailProvider();
