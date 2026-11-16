import dotenv from 'dotenv';
import { fetchRecentMessages } from './services/outlookSync.service.js';

dotenv.config({ override: true });

try {
  const mailbox = process.env.MICROSOFT_TEST_MAILBOX;

  const messages = await fetchRecentMessages(mailbox, 5);

  console.log(`Mailbox: ${mailbox}`);
  console.log(`Messages retrieved: ${messages.length}`);

  for (const message of messages) {
    console.log({
      id: message.id,
      subject: message.subject,
      from: message.from?.emailAddress?.address,
      receivedDateTime: message.receivedDateTime,
      hasAttachments: message.hasAttachments,
    });
  }

  process.exit(0);
} catch (error) {
  console.error('Outlook mailbox test failed.');
  console.error(error.message);
  process.exit(1);
}
