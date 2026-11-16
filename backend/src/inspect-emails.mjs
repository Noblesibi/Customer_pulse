import { fetchRecentMessages } from './src/services/outlookSync.service.js';
import dotenv from 'dotenv';
dotenv.config();

const mailbox = process.env.MICROSOFT_TEST_MAILBOX;
const messages = await fetchRecentMessages(mailbox, 50);
const internals = [];
const externals = [];

for (const msg of messages) {
  const from = msg.from?.emailAddress?.address || '';
  const allAddrs = [
    from,
    ...(msg.toRecipients || []).map(r => r.emailAddress?.address),
    ...(msg.ccRecipients || []).map(r => r.emailAddress?.address)
  ].filter(Boolean).map(e => e.toLowerCase());
  
  const externalOnes = allAddrs.filter(e => !e.endsWith('@nestgroup.net') && !e.endsWith('@microsoft.com'));
  
  if (externalOnes.length === 0) {
    internals.push(msg.subject);
  } else {
    externals.push({ subject: msg.subject, from, external: externalOnes, receivedDateTime: msg.receivedDateTime });
  }
}

console.log(`--- INTERNAL ONLY (${internals.length}) ---`);
internals.forEach(s => console.log(' -', s));

console.log(`\n--- EXTERNAL EMAILS (${externals.length}) ---`);
externals.forEach(e => {
  console.log(' - Subject:', e.subject);
  console.log('   Received:', e.receivedDateTime);
  console.log('   From:', e.from);
  console.log('   External addrs:', e.external.join(', '));
  console.log('');
});

process.exit(0);
