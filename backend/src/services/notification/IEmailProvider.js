/**
 * IEmailProvider — Abstract interface for email providers.
 *
 * All concrete email providers (SMTP, Microsoft Graph, SendGrid, etc.)
 * must extend this class and implement its methods.
 *
 * This ensures the NotificationEngine is completely decoupled from
 * the underlying transport mechanism. Swapping providers requires
 * only changing the concrete class injected into SmtpEmailProvider.
 */
export class IEmailProvider {
  /**
   * Send a single email.
   * @param {object} mailOptions
   * @param {string} mailOptions.to - Recipient email address
   * @param {string} mailOptions.subject - Email subject line
   * @param {string} mailOptions.html - HTML body content
   * @param {string} [mailOptions.from] - Override sender (optional)
   * @returns {Promise<{success: boolean, messageId: string|null, error: string|null}>}
   */
  async send(mailOptions) {
    throw new Error('[IEmailProvider] send() is not implemented by this provider.');
  }

  /**
   * Verify SMTP connection / provider credentials.
   * @returns {Promise<{ok: boolean, error: string|null}>}
   */
  async verify() {
    throw new Error('[IEmailProvider] verify() is not implemented by this provider.');
  }

  /**
   * Returns a human-readable name for this provider.
   * Used in logs and email history.
   * @returns {string}
   */
  getProviderName() {
    return 'UnknownProvider';
  }
}
